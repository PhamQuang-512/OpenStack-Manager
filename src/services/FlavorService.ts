import { BaseService } from "./BaseService";
import { Flavor } from "./types";

interface NovaFlavor {
  id: string;
  name: string;
  vcpus?: number;
  ram?: number;
  disk?: number;
  swap?: number | string;
  rxtx_factor?: number;
  "OS-FLV-EXT-DATA:ephemeral"?: number;
  "os-flavor-access:is_public"?: boolean;
}

/**
 * Service for listing OpenStack Nova flavors (hardware profiles).
 */
export class FlavorService extends BaseService {
  /**
   * Lists public and private flavors, sorted by vCPU count ascending.
   */
  async listFlavors(): Promise<Flavor[]> {
    const flavors = await this.client.listAll<NovaFlavor>("compute", "/flavors/detail?is_public=None", "flavors");
    return flavors
      .map((f) => ({
        id: f.id,
        name: f.name,
        vcpus: f.vcpus,
        ram: f.ram,
        disk: f.disk,
        ephemeral: f["OS-FLV-EXT-DATA:ephemeral"],
        swap: f.swap === undefined ? undefined : String(f.swap),
        rxtx_factor: f.rxtx_factor,
        is_public: f["os-flavor-access:is_public"],
      }))
      .sort((a, b) => (a.vcpus ?? 0) - (b.vcpus ?? 0));
  }

  /**
   * Fetches the raw flavor document for the detail view.
   */
  async getFlavor(id: string): Promise<Record<string, unknown>> {
    const body = await this.client.request<{ flavor: Record<string, unknown> }>("compute", `/flavors/${id}`);
    return body.flavor;
  }
}
