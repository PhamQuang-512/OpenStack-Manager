import { Action, ActionPanel, Clipboard, Icon, List, showToast, Toast } from "@raycast/api";
import { useFetchWithCache } from "../../core/useFetchWithCache";
import { cacheKey, CloudViewProps, getServices } from "../index";
import { Image } from "../types";
import { getImageStatusColor } from "../../utils/statusColors";
import ImageDetailView from "./ImageDetailView";
import { projectAccessory, useProjectFilter } from "./projectFilter";

export default function ImagesView({ configName, horizonUrl, binaryPath }: CloudViewProps) {
  const services = getServices(configName, binaryPath);
  const {
    data: images,
    isLoading,
    revalidate,
  } = useFetchWithCache<Image[]>(cacheKey("images", configName), () => services.images.listImages(), {
    errorTitle: "Failed to list images",
  });

  const { filtered, dropdown, projectName } = useProjectFilter(configName, binaryPath, images, (i) => i.owner);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search images by name, ID or project..."
      searchBarAccessory={dropdown}
      navigationTitle={`Images — ${configName}`}
    >
      {!isLoading && filtered.length === 0 && (
        <List.EmptyView
          icon={Icon.Document}
          title="No Images Found"
          description="No images in the selected projects."
        />
      )}
      {filtered.map((image) => {
        const sizeDisplay = image.size != null && image.size > 0 ? `${(image.size / 1024 / 1024).toFixed(1)} MB` : "";
        const project = projectName(image.owner);
        return (
          <List.Item
            key={image.id}
            icon={Icon.Document}
            title={image.name ?? image.id}
            subtitle={image.disk_format ?? ""}
            keywords={[image.id, project].filter(Boolean)}
            accessories={[
              ...projectAccessory(project),
              ...(sizeDisplay ? [{ text: sizeDisplay }] : []),
              ...(image.visibility ? [{ text: image.visibility }] : []),
              { tag: { value: image.status ?? "unknown", color: getImageStatusColor(image.status ?? "") } },
            ]}
            actions={
              <ActionPanel>
                <Action.Push
                  title="View Details"
                  icon={Icon.Eye}
                  target={
                    <ImageDetailView
                      imageId={image.id}
                      imageName={image.name ?? image.id}
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
                    Clipboard.copy(image.id);
                    showToast({ style: Toast.Style.Success, title: "Copied ID", message: image.id });
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
        );
      })}
    </List>
  );
}
