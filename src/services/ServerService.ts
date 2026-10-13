import { BaseService } from "./BaseService";
import { Server } from "./types";
import { ApiError } from "../core/errors";

/** Nova server as returned by GET /servers/detail (microversion 2.47). */
interface NovaServer {
  id: string;
  name: string;
  status: string;
  tenant_id?: string;
  flavor?: { original_name?: string; id?: string };
  image?: { id?: string } | "";
  addresses?: Record<string, { addr: string }[]>;
  security_groups?: { name: string }[];
  key_name?: string | null;
  created?: string;
  updated?: string;
  "OS-EXT-AZ:availability_zone"?: string;
  "OS-EXT-SRV-ATTR:host"?: string | null;
}

/**
 * Service for managing OpenStack Nova compute instances.
 */
export class ServerService extends BaseService {
  /**
   * Lists servers in all projects. Non-admin credentials get a 403 for
   * `all_tenants`, in which case only the current project is listed.
   */
  async listServers(): Promise<Server[]> {
    let servers: NovaServer[];
    try {
      servers = await this.client.listAll<NovaServer>("compute", "/servers/detail?all_tenants=1", "servers");
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 403)) throw error;
      servers = await this.client.listAll<NovaServer>("compute", "/servers/detail", "servers");
    }
    return servers.map(toServer);
  }

  /**
   * Fetches the raw server document for the detail view.
   */
  async getServer(id: string): Promise<Record<string, unknown>> {
    const body = await this.client.request<{ server: Record<string, unknown> }>("compute", `/servers/${id}`);
    return body.server;
  }

  async startServer(id: string): Promise<void> {
    await this.serverAction(id, { "os-start": null });
  }

  async stopServer(id: string): Promise<void> {
    await this.serverAction(id, { "os-stop": null });
  }

  async rebootServer(id: string): Promise<void> {
    await this.serverAction(id, { reboot: { type: "SOFT" } });
  }

  private async serverAction(id: string, body: Record<string, unknown>): Promise<void> {
    await this.client.request<void>("compute", `/servers/${id}/action`, { method: "POST", body });
  }
}

export function toServer(server: NovaServer): Server {
  const addressGroups = Object.entries(server.addresses ?? {});
  const ips = addressGroups.flatMap(([, entries]) => entries.map((entry) => entry.addr));
  return {
    id: server.id,
    name: server.name,
    status: server.status,
    flavor: server.flavor?.original_name ?? server.flavor?.id ?? "",
    image: typeof server.image === "object" ? (server.image.id ?? "") : "",
    networks: addressGroups.map(([net, entries]) => `${net}=${entries.map((e) => e.addr).join(", ")}`).join("; "),
    ips,
    project_id: server.tenant_id,
    host: server["OS-EXT-SRV-ATTR:host"] ?? undefined,
    security_groups: server.security_groups?.map((sg) => sg.name).join(", "),
    availability_zone: server["OS-EXT-AZ:availability_zone"],
    key_name: server.key_name,
    created: server.created,
    updated: server.updated,
  };
}
