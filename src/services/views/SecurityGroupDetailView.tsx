import { Action, ActionPanel, Clipboard, Detail, Icon, open, showToast, Toast } from "@raycast/api";
import { peekShared, useFetchWithCache } from "../../core/useFetchWithCache";
import { buildHorizonLink } from "../../utils/horizonUrl";
import { escapeMarkdown } from "../../utils/markdown";
import { cacheKey, CloudViewProps, getServices } from "../index";
import { SecurityGroup, SecurityGroupRule } from "../types";

interface SecurityGroupDetailViewProps extends CloudViewProps {
  securityGroupId: string;
  securityGroupName: string;
  projectName?: string;
}

/** Keys rendered elsewhere (rules table) or not useful in metadata. */
const HIDDEN_KEYS = new Set(["security_group_rules", "tenant_id", "revision_number", "tags"]);

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value || "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (value.every((v) => typeof v === "string")) return value.join(", ");
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function formatKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPortRange(rule: SecurityGroupRule): string {
  const { port_range_min: min, port_range_max: max } = rule;
  if (min == null && max == null) return "All";
  if (min === max || max == null) return String(min);
  return `${min}-${max}`;
}

/**
 * Renders rules sorted ingress-first. Remote security groups are shown by
 * name when the security group list is already loaded.
 */
function buildRulesTable(rules: SecurityGroupRule[], groupNames: Map<string, string>): string {
  if (rules.length === 0) return "No rules defined.";

  const sorted = [...rules].sort(
    (a, b) =>
      b.direction.localeCompare(a.direction) ||
      a.ethertype.localeCompare(b.ethertype) ||
      (a.port_range_min ?? 0) - (b.port_range_min ?? 0),
  );

  return (
    `| Direction | Protocol | Port Range | Ethertype | Remote | Description |\n` +
    `|-----------|----------|------------|-----------|--------|-------------|\n` +
    sorted
      .map((rule) => {
        const remote = rule.remote_group_id
          ? `SG: ${escapeMarkdown(groupNames.get(rule.remote_group_id) ?? rule.remote_group_id)}`
          : (rule.remote_ip_prefix ?? "Any");
        const description = escapeMarkdown(rule.description ?? "");
        return `| ${rule.direction} | ${rule.protocol ?? "Any"} | ${formatPortRange(rule)} | ${rule.ethertype} | ${remote} | ${description} |`;
      })
      .join("\n")
  );
}

export default function SecurityGroupDetailView({
  securityGroupId,
  securityGroupName,
  projectName,
  horizonUrl,
  binaryPath,
  configName,
}: SecurityGroupDetailViewProps) {
  const services = getServices(configName, binaryPath);
  const { data, isLoading, revalidate } = useFetchWithCache<SecurityGroup & Record<string, unknown>>(
    cacheKey("security-group-detail", configName, securityGroupId),
    () => services.securityGroups.getSecurityGroup(securityGroupId),
    { errorTitle: "Failed to load security group" },
  );

  const horizonLink = buildHorizonLink(horizonUrl, "security_groups", securityGroupId);

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
      ? `# ${escapeMarkdown(securityGroupName)}\n\nLoading security group details...`
      : `# ${escapeMarkdown(securityGroupName)}\n\nFailed to load security group details.`;
    return (
      <Detail
        isLoading={isLoading}
        navigationTitle={`Security Group: ${securityGroupName}`}
        markdown={markdown}
        actions={<ActionPanel>{refreshAction}</ActionPanel>}
      />
    );
  }

  const groupNames = new Map(
    (peekShared<SecurityGroup[]>(cacheKey("security-groups", configName)) ?? []).map((g) => [g.id, g.name]),
  );
  const rules = data.security_group_rules ?? [];
  const markdown =
    `# ${escapeMarkdown(data.name)}\n\n` +
    (projectName ? `**Project:** ${escapeMarkdown(projectName)}\n\n` : "") +
    (data.description ? `> ${escapeMarkdown(data.description)}\n\n` : "") +
    `## Rules (${rules.length})\n\n${buildRulesTable(rules, groupNames)}`;

  const entries = Object.entries(data).filter(([key]) => !HIDDEN_KEYS.has(key));

  return (
    <Detail
      isLoading={isLoading}
      navigationTitle={`Security Group: ${data.name}`}
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          {entries.map(([key, value]) => (
            <Detail.Metadata.Label key={key} title={formatKey(key)} text={formatValue(value)} />
          ))}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action
            title="Copy Id"
            icon={Icon.Clipboard}
            shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
            onAction={() => {
              Clipboard.copy(securityGroupId);
              showToast({ style: Toast.Style.Success, title: "Copied ID", message: securityGroupId });
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
