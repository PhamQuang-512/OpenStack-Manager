import { Action, ActionPanel, Clipboard, Icon, List, open, showToast, Toast } from "@raycast/api";
import { useFetchWithCache } from "../../core/useFetchWithCache";
import { ServiceUnavailableError } from "../../core/errors";
import { cacheKey, CloudViewProps, getServices } from "../index";
import { MagnumCluster } from "../types";
import { getClusterStatusColor } from "../../utils/statusColors";
import { buildHorizonLink } from "../../utils/horizonUrl";
import ClusterDetailView from "./ClusterDetailView";
import { projectAccessory, useProjectFilter } from "./projectFilter";

export default function ClustersView({ configName, horizonUrl, binaryPath }: CloudViewProps) {
  const services = getServices(configName, binaryPath);
  const {
    data: clusters,
    error,
    isLoading,
    revalidate,
  } = useFetchWithCache<MagnumCluster[]>(cacheKey("clusters", configName), () => services.clusters.listClusters(), {
    errorTitle: "Failed to list clusters",
  });

  const { filtered, dropdown, projectName } = useProjectFilter(configName, binaryPath, clusters, (c) => c.project_id);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search clusters by name, ID, API address or project..."
      searchBarAccessory={dropdown}
      navigationTitle={`Kubernetes Clusters — ${configName}`}
    >
      {error instanceof ServiceUnavailableError ? (
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="Magnum Not Available"
          description="The Kubernetes (Magnum) service is not available in this region."
        />
      ) : !isLoading && filtered.length === 0 ? (
        <List.EmptyView
          icon={Icon.ComputerChip}
          title="No Clusters Found"
          description="No Kubernetes clusters in the selected projects."
        />
      ) : null}
      {filtered.map((cluster) => {
        const horizonLink = buildHorizonLink(horizonUrl, "clusters", cluster.uuid);
        const project = projectName(cluster.project_id);
        return (
          <List.Item
            key={cluster.uuid}
            icon={Icon.ComputerChip}
            title={cluster.name}
            subtitle={cluster.coe_version ?? cluster.health_status ?? ""}
            keywords={[cluster.uuid, cluster.api_address ?? "", project].filter(Boolean)}
            accessories={[
              ...projectAccessory(project),
              { text: `M:${cluster.master_count ?? 0} N:${cluster.node_count ?? 0}` },
              { tag: { value: cluster.status ?? "UNKNOWN", color: getClusterStatusColor(cluster.status ?? "") } },
            ]}
            actions={
              <ActionPanel>
                <Action.Push
                  title="View Details"
                  icon={Icon.Eye}
                  target={
                    <ClusterDetailView
                      clusterId={cluster.uuid}
                      clusterName={cluster.name}
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
                    Clipboard.copy(cluster.uuid);
                    showToast({ style: Toast.Style.Success, title: "Copied ID", message: cluster.uuid });
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
