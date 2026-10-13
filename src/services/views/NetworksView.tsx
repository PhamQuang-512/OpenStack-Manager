import { Action, ActionPanel, Clipboard, Icon, List, open, showToast, Toast } from "@raycast/api";
import { useFetchWithCache } from "../../core/useFetchWithCache";
import { cacheKey, CloudViewProps, getServices } from "../index";
import { Network } from "../types";
import { buildHorizonLink } from "../../utils/horizonUrl";
import NetworkDetailView from "./NetworkDetailView";
import { projectAccessory, useProjectFilter } from "./projectFilter";

export default function NetworksView({ configName, horizonUrl, binaryPath }: CloudViewProps) {
  const services = getServices(configName, binaryPath);
  const {
    data: networks,
    isLoading,
    revalidate,
  } = useFetchWithCache<Network[]>(cacheKey("networks", configName), () => services.networks.listNetworks(), {
    errorTitle: "Failed to list networks",
  });

  const { filtered, dropdown, projectName } = useProjectFilter(configName, binaryPath, networks, (n) => n.project_id);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search networks by name, ID or project..."
      searchBarAccessory={dropdown}
      navigationTitle={`Networks — ${configName}`}
    >
      {!isLoading && filtered.length === 0 && (
        <List.EmptyView
          icon={Icon.Network}
          title="No Networks Found"
          description="No networks in the selected projects."
        />
      )}
      {filtered.map((network) => {
        const horizonLink = buildHorizonLink(horizonUrl, "networks", network.id);
        const project = projectName(network.project_id);
        return (
          <List.Item
            key={network.id}
            icon={Icon.Network}
            title={network.name || network.id}
            subtitle={network.provider_network_type ?? ""}
            keywords={[network.id, project].filter(Boolean)}
            accessories={[
              ...projectAccessory(project),
              ...(network.router_external ? [{ tag: "External" }] : []),
              { text: network.shared != null ? (network.shared ? "Shared" : "Private") : "" },
              { text: network.admin_state_up != null ? (network.admin_state_up ? "UP" : "DOWN") : "" },
              { text: network.status ?? "" },
            ]}
            actions={
              <ActionPanel>
                <Action.Push
                  title="View Details"
                  icon={Icon.Eye}
                  target={
                    <NetworkDetailView
                      networkId={network.id}
                      networkName={network.name || network.id}
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
                    Clipboard.copy(network.id);
                    showToast({ style: Toast.Style.Success, title: "Copied ID", message: network.id });
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
