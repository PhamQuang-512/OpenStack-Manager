import { Action, ActionPanel, Clipboard, Icon, List, showToast, Toast } from "@raycast/api";
import { useFetchWithCache } from "../../core/useFetchWithCache";
import { cacheKey, CloudViewProps, getServices } from "../index";
import { Flavor } from "../types";
import FlavorDetailView from "./FlavorDetailView";

export default function FlavorsView({ configName, horizonUrl, binaryPath }: CloudViewProps) {
  const services = getServices(configName, binaryPath);
  const {
    data: flavors,
    isLoading,
    revalidate,
  } = useFetchWithCache<Flavor[]>(cacheKey("flavors", configName), () => services.flavors.listFlavors(), {
    errorTitle: "Failed to list flavors",
  });

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search flavors by name or ID..."
      navigationTitle={`Flavors — ${configName}`}
    >
      {!isLoading && (flavors ?? []).length === 0 && (
        <List.EmptyView icon={Icon.MemoryChip} title="No Flavors Found" description="No flavors available." />
      )}
      {(flavors ?? []).map((flavor) => (
        <List.Item
          key={flavor.id}
          icon={Icon.MemoryChip}
          title={flavor.name ?? flavor.id}
          subtitle={`${flavor.vcpus ?? 0} vCPUs`}
          keywords={[flavor.id]}
          accessories={[
            ...(flavor.is_public === false ? [{ tag: "Private" }] : []),
            { text: `${flavor.ram ?? 0} MB RAM` },
            { text: `${flavor.disk ?? 0} GB disk` },
          ]}
          actions={
            <ActionPanel>
              <Action.Push
                title="View Details"
                icon={Icon.Eye}
                target={
                  <FlavorDetailView
                    flavorId={flavor.id}
                    flavorName={flavor.name ?? flavor.id}
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
                  Clipboard.copy(flavor.id);
                  showToast({ style: Toast.Style.Success, title: "Copied ID", message: flavor.id });
                }}
              />
              <Action
                title="Refresh"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={revalidate}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
