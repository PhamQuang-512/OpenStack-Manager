import { LocalStorage } from "@raycast/api";
import { ConfigManager } from "../config/ConfigManager";
import { CLIExecutor } from "../core/CLIExecutor";
import { OpenStackClient } from "../core/OpenStackClient";
import { fetchShared } from "../core/useFetchWithCache";
import { ClusterService } from "./ClusterService";
import { FlavorService } from "./FlavorService";
import { ImageService } from "./ImageService";
import { LoadBalancerService } from "./LoadBalancerService";
import { NetworkService } from "./NetworkService";
import { ProjectService } from "./ProjectService";
import { SecurityGroupService } from "./SecurityGroupService";
import { ServerService } from "./ServerService";

/** Props shared by every resource view of a cloud. */
export interface CloudViewProps {
  configName: string;
  horizonUrl?: string;
  binaryPath: string;
}

export interface Services {
  client: OpenStackClient;
  projects: ProjectService;
  servers: ServerService;
  flavors: FlavorService;
  images: ImageService;
  networks: NetworkService;
  securityGroups: SecurityGroupService;
  clusters: ClusterService;
  loadBalancers: LoadBalancerService;
}

/** One client per cloud for the lifetime of the command, so the token is reused across views. */
const registry = new Map<string, Services>();

export function getServices(configName: string, binaryPath: string): Services {
  const key = `${configName}\u0000${binaryPath}`;
  let services = registry.get(key);
  if (!services) {
    const configManager = new ConfigManager();
    const client = new OpenStackClient(
      configName,
      () => configManager.getConfig(configName),
      new CLIExecutor(binaryPath, configName),
    );
    services = {
      client,
      projects: new ProjectService(client),
      servers: new ServerService(client),
      flavors: new FlavorService(client),
      images: new ImageService(client),
      networks: new NetworkService(client),
      securityGroups: new SecurityGroupService(client),
      clusters: new ClusterService(client),
      loadBalancers: new LoadBalancerService(client),
    };
    registry.set(key, services);
  }
  return services;
}

export type ResourceKind =
  | "projects"
  | "servers"
  | "flavors"
  | "images"
  | "networks"
  | "security-groups"
  | "clusters"
  | "load-balancers";

/**
 * LocalStorage / in-memory cache key. The "v2" prefix separates the
 * all-projects REST data from the old per-project CLI cache entries.
 */
export function cacheKey(kind: string, configName: string, id?: string): string {
  return ["v2", kind, configName, id].filter(Boolean).join(":");
}

/** The list fetcher behind each resource kind, shared by views and prefetch. */
export function listFetcher(services: Services, kind: ResourceKind): () => Promise<unknown[]> {
  switch (kind) {
    case "projects":
      return () => services.projects.listProjects();
    case "servers":
      return () => services.servers.listServers();
    case "flavors":
      return () => services.flavors.listFlavors();
    case "images":
      return () => services.images.listImages();
    case "networks":
      return () => services.networks.listNetworks();
    case "security-groups":
      return () => services.securityGroups.listSecurityGroups();
    case "clusters":
      return () => services.clusters.listClusters();
    case "load-balancers":
      return () => services.loadBalancers.listLoadBalancers();
  }
}

const PREFETCH_KINDS: ResourceKind[] = [
  "projects",
  "servers",
  "load-balancers",
  "networks",
  "security-groups",
  "clusters",
  "flavors",
  "images",
];

/**
 * Warms every list in the background as soon as a cloud is opened, so the
 * service the user picks next is usually already loaded. Views opened while
 * a prefetch is in flight share the same request.
 */
export function prefetchAll(configName: string, binaryPath: string): void {
  const services = getServices(configName, binaryPath);
  for (const kind of PREFETCH_KINDS) {
    fetchShared(cacheKey(kind, configName), listFetcher(services, kind)).catch(() => {
      // Errors are surfaced when the corresponding view is opened
    });
  }
}

/** Key prefixes written by the CLI-based versions (per-project data). */
const LEGACY_CACHE_KEY = /^(servers|flavors|images|networks|security-groups|clusters|detail|current-project-id):/;
const CACHE_VERSION_KEY = "cacheVersion";

/**
 * One-time removal of cache entries from the CLI-based versions, which
 * held current-project-only data under unversioned keys.
 */
export async function clearLegacyCache(): Promise<void> {
  try {
    if ((await LocalStorage.getItem<string>(CACHE_VERSION_KEY)) === "2") return;
    const keys = Object.keys(await LocalStorage.allItems());
    await Promise.all(keys.filter((k) => LEGACY_CACHE_KEY.test(k)).map((k) => LocalStorage.removeItem(k)));
    await LocalStorage.setItem(CACHE_VERSION_KEY, "2");
  } catch {
    // Best-effort cleanup
  }
}
