import { Action, ActionPanel, Clipboard, Icon, List, open, showToast, Toast } from "@raycast/api";
import { useFetchWithCache } from "../../core/useFetchWithCache";
import { ServiceUnavailableError } from "../../core/errors";
import { cacheKey, CloudViewProps, getServices } from "../index";
import { LoadBalancer } from "../types";
import { getLBOperatingStatusColor, getLBProvisioningStatusColor } from "../../utils/statusColors";
import { buildHorizonLink } from "../../utils/horizonUrl";
import LoadBalancerDetailView from "./LoadBalancerDetailView";
import { projectAccessory, useProjectFilter } from "./projectFilter";

export default function LoadBalancersView({ configName, horizonUrl, binaryPath }: CloudViewProps) {
  const services = getServices(configName, binaryPath);
  const {
    data: loadBalancers,
    error,
    isLoading,
    revalidate,
  } = useFetchWithCache<LoadBalancer[]>(
    cacheKey("load-balancers", configName),
    () => services.loadBalancers.listLoadBalancers(),
    { errorTitle: "Failed to list load balancers" },
  );

  const { filtered, dropdown, projectName } = useProjectFilter(
    configName,
    binaryPath,
    loadBalancers,
    (lb) => lb.project_id,
  );

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search load balancers by name, VIP, floating IP, ID or project..."
      searchBarAccessory={dropdown}
      navigationTitle={`Load Balancers — ${configName}`}
    >
      {error instanceof ServiceUnavailableError ? (
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="Octavia Not Available"
          description="The Load Balancer (Octavia) service is not available in this region."
        />
      ) : !isLoading && filtered.length === 0 ? (
        <List.EmptyView
          icon={Icon.Switch}
          title="No Load Balancers Found"
          description="No load balancers in the selected projects."
        />
      ) : null}
      {filtered.map((lb) => {
        const horizonLink = buildHorizonLink(horizonUrl, "load_balancers", lb.id);
        const project = projectName(lb.project_id);
        const name = lb.name || lb.id;
        const addresses = [lb.vip_address, lb.floating_ip].filter((a): a is string => Boolean(a));
        return (
          <List.Item
            key={lb.id}
            icon={Icon.Switch}
            title={name}
            subtitle={lb.vip_address ?? ""}
            keywords={[lb.id, ...addresses, project, lb.provider ?? ""].filter(Boolean)}
            accessories={[
              ...projectAccessory(project),
              ...(lb.floating_ip ? [{ icon: Icon.Globe, text: lb.floating_ip, tooltip: "Floating IP" }] : []),
              { text: `L:${lb.listeners?.length ?? 0} P:${lb.pools?.length ?? 0}`, tooltip: "Listeners / Pools" },
              ...(lb.provisioning_status !== "ACTIVE"
                ? [
                    {
                      tag: {
                        value: lb.provisioning_status,
                        color: getLBProvisioningStatusColor(lb.provisioning_status),
                      },
                      tooltip: "Provisioning status",
                    },
                  ]
                : []),
              {
                tag: { value: lb.operating_status, color: getLBOperatingStatusColor(lb.operating_status) },
                tooltip: "Operating status",
              },
            ]}
            actions={
              <ActionPanel>
                <Action.Push
                  title="View Details"
                  icon={Icon.Eye}
                  target={
                    <LoadBalancerDetailView
                      loadBalancerId={lb.id}
                      loadBalancerName={name}
                      projectName={project}
                      horizonUrl={horizonUrl}
                      binaryPath={binaryPath}
                      configName={configName}
                    />
                  }
                />
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
                <Action
                  title="Copy Id"
                  icon={Icon.Clipboard}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                  onAction={() => {
                    Clipboard.copy(lb.id);
                    showToast({ style: Toast.Style.Success, title: "Copied ID", message: lb.id });
                  }}
                />
                {horizonLink && (
                  <Action
                    title="Open in Browser"
                    icon={Icon.Globe}
                    shortcut={{ modifiers: ["cmd"], key: "o" }}
                    onAction={() => open(horizonLink)}
                  />
                )}
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                  onAction={revalidate}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
