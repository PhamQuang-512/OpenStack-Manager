import GenericDetailView from "./GenericDetailView";
import { cacheKey, CloudViewProps, getServices } from "../index";

interface ServerDetailViewProps extends CloudViewProps {
  serverId: string;
  serverName: string;
  projectName?: string;
}

export default function ServerDetailView({
  serverId,
  serverName,
  projectName,
  horizonUrl,
  binaryPath,
  configName,
}: ServerDetailViewProps) {
  const services = getServices(configName, binaryPath);
  return (
    <GenericDetailView
      resourceId={serverId}
      resourceName={serverName}
      cacheKey={cacheKey("server-detail", configName, serverId)}
      fetcher={() => services.servers.getServer(serverId)}
      horizonUrl={horizonUrl}
      horizonResourceType="servers"
      projectName={projectName}
    />
  );
}
