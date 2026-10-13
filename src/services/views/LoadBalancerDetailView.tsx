import { Action, ActionPanel, Clipboard, Detail, Icon, open, showToast, Toast } from "@raycast/api";
import { peekShared, useFetchWithCache } from "../../core/useFetchWithCache";
import { buildHorizonLink } from "../../utils/horizonUrl";
import { getLBOperatingStatusColor, getLBProvisioningStatusColor } from "../../utils/statusColors";
import { escapeMarkdown } from "../../utils/markdown";
import { cacheKey, CloudViewProps, getServices } from "../index";
import { LBHealthMonitor, LoadBalancerDetail, Server } from "../types";

interface LoadBalancerDetailViewProps extends CloudViewProps {
  loadBalancerId: string;
  loadBalancerName: string;
  projectName?: string;
}

/** Escapes characters that would break a markdown table cell. */
function cell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return escapeMarkdown(String(value));
}

/** Highlights anything that is not healthy so problems stand out in tables. */
function status(value: string | undefined): string {
  if (!value) return "—";
  return value === "ONLINE" || value === "ACTIVE" ? value : `**${value}**`;
}

function formatBytes(bytes: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function describeHealthMonitor(hm: LBHealthMonitor): string {
  const http = hm.type.startsWith("HTTP")
    ? ` ${hm.http_method ?? "GET"} ${hm.url_path ?? "/"} expect ${hm.expected_codes ?? "200"}`
    : "";
  return (
    `${hm.type}${http} · every ${hm.delay}s · timeout ${hm.timeout}s · ` +
    `retries up ${hm.max_retries} / down ${hm.max_retries_down ?? "—"}`
  );
}

/**
 * Builds the markdown body. Member addresses are resolved to server names
 * when the server list for this cloud is already loaded.
 */
function buildMarkdown(detail: LoadBalancerDetail, projectName: string | undefined, serverByIp: Map<string, string>) {
  const { loadBalancer: lb, listeners, pools, amphorae, stats } = detail;
  const poolNames = new Map(pools.map((p) => [p.id, p.name || p.id.slice(0, 8)]));
  const listenerNames = new Map(listeners.map((l) => [l.id, l.name || `${l.protocol}:${l.protocol_port}`]));
  const lines: string[] = [`# ${escapeMarkdown(lb.name || lb.id)}`, ""];

  const summary = [
    projectName ? `**Project:** ${escapeMarkdown(projectName)}` : "",
    `**VIP:** ${lb.vip_address ?? "—"}${lb.floating_ip ? ` (floating IP ${lb.floating_ip})` : ""}`,
    `**Status:** ${status(lb.operating_status)} / ${status(lb.provisioning_status)}`,
    lb.description ? `> ${escapeMarkdown(lb.description)}` : "",
  ].filter(Boolean);
  lines.push(summary.join("\n\n"), "");

  lines.push(`## Listeners (${listeners.length})`, "");
  if (listeners.length === 0) {
    lines.push("No listeners.", "");
  } else {
    lines.push(
      "| Name | Protocol | Port | Default Pool | Operating | Provisioning | Allowed CIDRs |",
      "|------|----------|------|--------------|-----------|--------------|---------------|",
      ...listeners.map(
        (l) =>
          `| ${cell(l.name)} | ${cell(l.protocol)} | ${cell(l.protocol_port)} | ${cell(l.default_pool_id ? poolNames.get(l.default_pool_id) : "")} | ` +
          `${status(l.operating_status)} | ${status(l.provisioning_status)} | ${cell(l.allowed_cidrs?.join(", "))} |`,
      ),
      "",
    );
  }

  lines.push(`## Pools (${pools.length})`, "");
  if (pools.length === 0) lines.push("No pools.", "");
  for (const pool of pools) {
    lines.push(
      `### ${escapeMarkdown(pool.name || pool.id)} — ${pool.protocol} · ${pool.lb_algorithm} · ${status(pool.operating_status)}`,
      "",
    );
    const poolListeners = (pool.listeners ?? []).map((l) => listenerNames.get(l.id) ?? l.id.slice(0, 8));
    if (poolListeners.length > 0) lines.push(`**Listeners:** ${escapeMarkdown(poolListeners.join(", "))}`, "");
    if (pool.session_persistence) {
      const cookie = pool.session_persistence.cookie_name ? ` (${pool.session_persistence.cookie_name})` : "";
      lines.push(`**Session persistence:** ${escapeMarkdown(pool.session_persistence.type + cookie)}`, "");
    }
    lines.push(
      `**Health monitor:** ${pool.healthMonitor ? escapeMarkdown(describeHealthMonitor(pool.healthMonitor)) : "none"}`,
      "",
    );
    if (pool.members.length === 0) {
      lines.push("No members.", "");
    } else {
      lines.push(
        "| Member | Server | Address | Port | Weight | Operating | Provisioning |",
        "|--------|--------|---------|------|--------|-----------|--------------|",
        ...pool.members.map(
          (m) =>
            `| ${cell(m.name)} | ${cell(serverByIp.get(m.address))} | ${cell(m.address)} | ${cell(m.protocol_port)} | ` +
            `${cell(m.weight)}${m.backup ? " (backup)" : ""} | ${status(m.operating_status)} | ${status(m.provisioning_status)} |`,
        ),
        "",
      );
    }
  }

  if (amphorae && amphorae.length > 0) {
    lines.push(
      `## Amphorae (${amphorae.length})`,
      "",
      "| Role | Status | Compute ID | LB Network IP | VRRP IP | Cert Expiration |",
      "|------|--------|------------|---------------|---------|-----------------|",
      ...amphorae.map(
        (a) =>
          `| ${cell(a.role)} | ${a.status === "ALLOCATED" ? a.status : `**${a.status}**`} | ${cell(a.compute_id)} | ` +
          `${cell(a.lb_network_ip)} | ${cell(a.vrrp_ip)} | ${cell(a.cert_expiration)} |`,
      ),
      "",
    );
  }

  if (stats) {
    lines.push(
      "## Statistics",
      "",
      "| Active Connections | Total Connections | Bytes In | Bytes Out | Request Errors |",
      "|--------------------|-------------------|----------|-----------|----------------|",
      `| ${stats.active_connections} | ${stats.total_connections} | ${formatBytes(stats.bytes_in)} | ` +
        `${formatBytes(stats.bytes_out)} | ${stats.request_errors} |`,
      "",
    );
  }

  return lines.join("\n");
}

export default function LoadBalancerDetailView({
  loadBalancerId,
  loadBalancerName,
  projectName,
  horizonUrl,
  binaryPath,
  configName,
}: LoadBalancerDetailViewProps) {
  const services = getServices(configName, binaryPath);
  const { data, isLoading, revalidate } = useFetchWithCache<LoadBalancerDetail>(
    cacheKey("load-balancer-detail", configName, loadBalancerId),
    () => services.loadBalancers.getLoadBalancerDetail(loadBalancerId),
    { errorTitle: "Failed to load load balancer" },
  );

  const horizonLink = buildHorizonLink(horizonUrl, "load_balancers", loadBalancerId);

  const refreshAction = (
    <Action
      title="Refresh"
      icon={Icon.ArrowClockwise}
      shortcut={{ modifiers: ["cmd"], key: "r" }}
      onAction={revalidate}
    />
  );

  if (!data) {
    const markdown = isLoading
      ? `# ${escapeMarkdown(loadBalancerName)}\n\nLoading load balancer details...`
      : `# ${escapeMarkdown(loadBalancerName)}\n\nFailed to load load balancer details.`;
    return (
      <Detail
        isLoading={isLoading}
        navigationTitle={`Load Balancer: ${loadBalancerName}`}
        markdown={markdown}
        actions={<ActionPanel>{refreshAction}</ActionPanel>}
      />
    );
  }

  const serverByIp = new Map<string, string>();
  for (const server of peekShared<Server[]>(cacheKey("servers", configName)) ?? []) {
    for (const ip of server.ips ?? []) serverByIp.set(ip, server.name);
  }

  const lb = data.loadBalancer;
  const memberAddresses = [...new Set(data.pools.flatMap((p) => p.members.map((m) => m.address)))];
  const addresses = [lb.vip_address, lb.floating_ip].filter((a): a is string => Boolean(a));

  return (
    <Detail
      isLoading={isLoading}
      navigationTitle={`Load Balancer: ${lb.name || lb.id}`}
      markdown={buildMarkdown(data, projectName, serverByIp)}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.TagList title="Operating Status">
            <Detail.Metadata.TagList.Item
              text={lb.operating_status}
              color={getLBOperatingStatusColor(lb.operating_status)}
            />
          </Detail.Metadata.TagList>
          <Detail.Metadata.TagList title="Provisioning Status">
            <Detail.Metadata.TagList.Item
              text={lb.provisioning_status}
              color={getLBProvisioningStatusColor(lb.provisioning_status)}
            />
          </Detail.Metadata.TagList>
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="ID" text={lb.id} />
          {projectName ? <Detail.Metadata.Label title="Project" text={projectName} /> : null}
          <Detail.Metadata.Label title="VIP Address" text={lb.vip_address ?? "—"} />
          <Detail.Metadata.Label title="Floating IP" text={lb.floating_ip ?? "—"} />
          <Detail.Metadata.Label title="Provider" text={lb.provider ?? "—"} />
          <Detail.Metadata.Label title="Flavor ID" text={lb.flavor_id ?? "—"} />
          <Detail.Metadata.Label title="Availability Zone" text={lb.availability_zone ?? "—"} />
          <Detail.Metadata.Label title="Admin State" text={lb.admin_state_up === false ? "DOWN" : "UP"} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="VIP Port ID" text={lb.vip_port_id ?? "—"} />
          <Detail.Metadata.Label title="VIP Subnet ID" text={lb.vip_subnet_id ?? "—"} />
          <Detail.Metadata.Label title="VIP Network ID" text={lb.vip_network_id ?? "—"} />
          <Detail.Metadata.Label title="Created" text={lb.created_at ?? "—"} />
          <Detail.Metadata.Label title="Updated" text={lb.updated_at ?? "—"} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          {addresses.length > 0 && (
            <Action
              title="Copy Vip and Floating Ip"
              icon={Icon.Network}
              shortcut={{ modifiers: ["cmd", "shift"], key: "i" }}
              onAction={() => {
                Clipboard.copy(addresses.join(", "));
                showToast({ style: Toast.Style.Success, title: "Copied IPs", message: addresses.join(", ") });
              }}
            />
          )}
          {memberAddresses.length > 0 && (
            <Action
              title="Copy Member Addresses"
              icon={Icon.List}
              shortcut={{ modifiers: ["cmd", "shift"], key: "m" }}
              onAction={() => {
                Clipboard.copy(memberAddresses.join(", "));
                showToast({ style: Toast.Style.Success, title: "Copied member addresses" });
              }}
            />
          )}
          <Action
            title="Copy Id"
            icon={Icon.Clipboard}
            shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
            onAction={() => {
              Clipboard.copy(lb.id);
              showToast({ style: Toast.Style.Success, title: "Copied ID", message: lb.id });
            }}
          />
          {refreshAction}
          {horizonLink && (
            <Action
              title="Open in Browser"
              icon={Icon.Globe}
              shortcut={{ modifiers: ["cmd"], key: "o" }}
              onAction={() => open(horizonLink)}
            />
          )}
        </ActionPanel>
      }
    />
  );
}
