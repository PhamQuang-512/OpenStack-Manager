import GenericDetailView from "./GenericDetailView";
import { cacheKey, CloudViewProps, getServices } from "../index";

interface ImageDetailViewProps extends CloudViewProps {
  imageId: string;
  imageName: string;
  projectName?: string;
}

export default function ImageDetailView({
  imageId,
  imageName,
  projectName,
  horizonUrl,
  binaryPath,
  configName,
}: ImageDetailViewProps) {
  const services = getServices(configName, binaryPath);
  return (
    <GenericDetailView
      resourceId={imageId}
      resourceName={imageName}
      cacheKey={cacheKey("image-detail", configName, imageId)}
      fetcher={() => services.images.getImage(imageId)}
      horizonUrl={horizonUrl}
      horizonResourceType="images"
      projectName={projectName}
      summaryKeys={[
        { key: "container_format", label: "Container Format" },
        { key: "os_distro", label: "OS Distro" },
        { key: "visibility", label: "Visibility" },
        { key: "disk_format", label: "Disk Format" },
        { key: "size", label: "Size", format: "size_gib" },
      ]}
    />
  );
}
