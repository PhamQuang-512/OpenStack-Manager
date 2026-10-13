import { Action, ActionPanel, Alert, Clipboard, confirmAlert, Icon, List, open, showToast, Toast } from "@raycast/api";
import { useCallback } from "react";
import { invalidateShared, useFetchWithCache } from "../../core/useFetchWithCache";
import { cacheKey, CloudViewProps, getServices } from "../index";
import { Server } from "../types";
import { getServerStatusColor } from "../../utils/statusColors";
import { buildHorizonLink } from "../../utils/horizonUrl";
import ServerDetailView from "./ServerDetailView";
import { projectAccessory, useProjectFilter } from "./projectFilter";

type ServerAction = "start" | "stop" | "reboot";

const ACTION_LABELS: Record<ServerAction, { verb: string; pending: string; done: string }> = {
  start: { verb: "Start", pending: "Starting", done: "Start requested for" },
  stop: { verb: "Stop", pending: "Stopping", done: "Stop requested for" },
  reboot: { verb: "Reboot", pending: "Rebooting", done: "Reboot requested for" },
};

export default function ServersView({ configName, horizonUrl, binaryPath }: CloudViewProps) {
  const services = getServices(configName, binaryPath);
  const {
    data: servers,
    isLoading,
    revalidate,
  } = useFetchWithCache<Server[]>(cacheKey("servers", configName), () => services.servers.listServers(), {
    errorTitle: "Failed to list servers",
  });

  const { filtered, dropdown, projectName } = useProjectFilter(configName, binaryPath, servers, (s) => s.project_id);

  const runAction = useCallback(
    async (server: Server, action: ServerAction) => {
      const labels = ACTION_LABELS[action];
      // Stop and reboot interrupt workloads, possibly in another team's project: always confirm
      if (action !== "start") {
        const confirmed = await confirmAlert({
          title: `${labels.verb} ${server.name}?`,
          message: `Cloud: ${configName}\nProject: ${projectName(server.project_id) || "unknown"}\nID: ${server.id}`,
          primaryAction: { title: labels.verb, style: Alert.ActionStyle.Destructive },
        });
        if (!confirmed) return;
      }

      try {
        await showToast({ style: Toast.Style.Animated, title: `${labels.pending} ${server.name}...` });
        if (action === "start") await services.servers.startServer(server.id);
        if (action === "stop") await services.servers.stopServer(server.id);
        if (action === "reboot") await services.servers.rebootServer(server.id);
        await showToast({ style: Toast.Style.Success, title: `${labels.done} ${server.name}` });
        invalidateShared(cacheKey("server-detail", configName, server.id));
        await revalidate();
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: `Failed to ${action} ${server.name}`,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [services, revalidate, configName, projectName],
  );

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search servers by name, IP, ID, host or project..."
      searchBarAccessory={dropdown}
      navigationTitle={`Servers — ${configName}`}
    >
      {!isLoading && filtered.length === 0 && (
        <List.EmptyView
          icon={Icon.Desktop}
          title="No Servers Found"
          description="No servers in the selected projects."
        />
      )}
      {filtered.map((server) => {
        const horizonLink = buildHorizonLink(horizonUrl, "servers", server.id);
        const project = projectName(server.project_id);
        const ips = server.ips ?? [];
        return (
          <List.Item
            key={server.id}
            icon={Icon.Desktop}
            title={server.name}
            subtitle={server.flavor ?? ""}
            keywords={[server.id, ...ips, project, server.host ?? ""].filter(Boolean)}
            accessories={[
              ...projectAccessory(project),
              { text: ips.join(", "), tooltip: server.networks },
              { tag: { value: server.status ?? "UNKNOWN", color: getServerStatusColor(server.status ?? "") } },
            ]}
            actions={
              <ActionPanel>
                <Action.Push
                  title="View Details"
                  icon={Icon.Eye}
                  target={
                    <ServerDetailView
                      serverId={server.id}
                      serverName={server.name}
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
                    Clipboard.copy(server.id);
                    showToast({ style: Toast.Style.Success, title: "Copied ID", message: server.id });
                  }}
                />
                {ips.length > 0 && (
                  <Action
                    title="Copy All Ips"
                    icon={Icon.Network}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "i" }}
                    onAction={() => {
                      Clipboard.copy(ips.join(", "));
                      showToast({ style: Toast.Style.Success, title: "Copied IPs", message: ips.join(", ") });
                    }}
                  />
                )}
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
                <ActionPanel.Section title="Power">
                  {(server.status ?? "") === "SHUTOFF" && (
                    <Action
                      title="Start"
                      icon={{ source: Icon.Play, tintColor: "#00ff00" }}
                      onAction={() => runAction(server, "start")}
                    />
                  )}
                  {(server.status ?? "") === "ACTIVE" && (
                    <Action
                      title="Stop"
                      icon={{ source: Icon.Stop, tintColor: "#ff0000" }}
                      style={Action.Style.Destructive}
                      onAction={() => runAction(server, "stop")}
                    />
                  )}
                  <Action
                    title="Reboot"
                    icon={Icon.RotateAntiClockwise}
                    style={Action.Style.Destructive}
                    onAction={() => runAction(server, "reboot")}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
