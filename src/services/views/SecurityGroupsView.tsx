import { Action, ActionPanel, Clipboard, Icon, List, open, showToast, Toast } from "@raycast/api";
import { useFetchWithCache } from "../../core/useFetchWithCache";
import { cacheKey, CloudViewProps, getServices } from "../index";
import { SecurityGroup } from "../types";
import { buildHorizonLink } from "../../utils/horizonUrl";
import SecurityGroupDetailView from "./SecurityGroupDetailView";
import { projectAccessory, useProjectFilter } from "./projectFilter";

export default function SecurityGroupsView({ configName, horizonUrl, binaryPath }: CloudViewProps) {
  const services = getServices(configName, binaryPath);
  const {
    data: groups,
    isLoading,
    revalidate,
  } = useFetchWithCache<SecurityGroup[]>(
    cacheKey("security-groups", configName),
    () => services.securityGroups.listSecurityGroups(),
    { errorTitle: "Failed to list security groups" },
  );

  const { filtered, dropdown, projectName } = useProjectFilter(configName, binaryPath, groups, (g) => g.project_id);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search security groups by name, ID or project..."
      searchBarAccessory={dropdown}
      navigationTitle={`Security Groups — ${configName}`}
    >
      {!isLoading && filtered.length === 0 && (
        <List.EmptyView
          icon={Icon.Shield}
          title="No Security Groups Found"
          description="No security groups in the selected projects."
        />
      )}
      {filtered.map((group) => {
        const horizonLink = buildHorizonLink(horizonUrl, "security_groups", group.id);
        const project = projectName(group.project_id);
        return (
          <List.Item
            key={group.id}
            icon={Icon.Shield}
            title={group.name}
            subtitle={group.description ?? ""}
            keywords={[group.id, project].filter(Boolean)}
            accessories={projectAccessory(project)}
            actions={
              <ActionPanel>
                <Action.Push
                  title="View Details"
                  icon={Icon.Eye}
                  target={
                    <SecurityGroupDetailView
                      securityGroupId={group.id}
                      securityGroupName={group.name}
                      projectName={project}
                      horizonUrl={horizonUrl}
                      binaryPath={binaryPath}
                      configName={configName}
                    />
                  }
                />
                <Action
                  title="Copy Id"
                  icon={Icon.Clipboard}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                  onAction={() => {
                    Clipboard.copy(group.id);
                    showToast({ style: Toast.Style.Success, title: "Copied ID", message: group.id });
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
