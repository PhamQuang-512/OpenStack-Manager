import GenericDetailView from "./GenericDetailView";
import { cacheKey, CloudViewProps, getServices } from "../index";

interface NetworkDetailViewProps extends CloudViewProps {
  networkId: string;
  networkName: string;
  projectName?: string;
}

export default function NetworkDetailView({
  networkId,
  networkName,
  projectName,
  horizonUrl,
  binaryPath,
  configName,
}: NetworkDetailViewProps) {
  const services = getServices(configName, binaryPath);
  return (
    <GenericDetailView
      resourceId={networkId}
      resourceName={networkName}
      cacheKey={cacheKey("network-detail", configName, networkId)}
      fetcher={() => services.networks.getNetwork(networkId)}
      horizonUrl={horizonUrl}
      horizonResourceType="networks"
      projectName={projectName}
      summaryKeys={[
        { key: "status", label: "Status" },
        { key: "subnets", label: "Subnets", format: "subnet_list" },
      ]}
    />
  );
}
