import GenericDetailView from "./GenericDetailView";
import { cacheKey, CloudViewProps, getServices } from "../index";

interface FlavorDetailViewProps extends CloudViewProps {
  flavorId: string;
  flavorName: string;
}

export default function FlavorDetailView({
  flavorId,
  flavorName,
  horizonUrl,
  binaryPath,
  configName,
}: FlavorDetailViewProps) {
  const services = getServices(configName, binaryPath);
  return (
    <GenericDetailView
      resourceId={flavorId}
      resourceName={flavorName}
      cacheKey={cacheKey("flavor-detail", configName, flavorId)}
      fetcher={() => services.flavors.getFlavor(flavorId)}
      horizonUrl={horizonUrl}
      horizonResourceType="flavors"
      summaryKeys={[
        { key: "vcpus", label: "vCPUs" },
        { key: "ram", label: "RAM (MB)" },
        { key: "disk", label: "Disk (GB)" },
        { key: "id", label: "ID" },
      ]}
    />
  );
}
