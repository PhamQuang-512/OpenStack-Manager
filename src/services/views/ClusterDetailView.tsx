import GenericDetailView from "./GenericDetailView";
import { cacheKey, CloudViewProps, getServices } from "../index";

interface ClusterDetailViewProps extends CloudViewProps {
  clusterId: string;
  clusterName: string;
  projectName?: string;
}

export default function ClusterDetailView({
  clusterId,
  clusterName,
  projectName,
  horizonUrl,
  binaryPath,
  configName,
}: ClusterDetailViewProps) {
  const services = getServices(configName, binaryPath);
  return (
    <GenericDetailView
      resourceId={clusterId}
      resourceName={clusterName}
      cacheKey={cacheKey("cluster-detail", configName, clusterId)}
      fetcher={() => services.clusters.getCluster(clusterId)}
      horizonUrl={horizonUrl}
      horizonResourceType="clusters"
      projectName={projectName}
      summaryKeys={[
        { key: "status", label: "Status" },
        { key: "health_status", label: "Health" },
        { key: "coe_version", label: "COE Version" },
        { key: "api_address", label: "API Address" },
        { key: "master_count", label: "Masters" },
        { key: "node_count", label: "Nodes" },
      ]}
    />
  );
}
