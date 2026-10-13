import { BaseService } from "./BaseService";
import { Network } from "./types";
import { normalizeKeys } from "../core/normalizeKeys";

/**
 * Service for listing OpenStack Neutron networks.
 */
export class NetworkService extends BaseService {
  /**
   * Lists networks in all projects (Neutron returns every project's
   * networks to admins). Keys like `router:external` are normalized.
   */
  async listNetworks(): Promise<Network[]> {
    const networks = await this.client.listAll<unknown>("network", "/networks", "networks");
    return normalizeKeys<Network[]>(networks);
  }

  /**
   * Fetches the raw network document for the detail view.
   */
  async getNetwork(id: string): Promise<Record<string, unknown>> {
    const body = await this.client.request<{ network: Record<string, unknown> }>("network", `/networks/${id}`);
    return body.network;
  }
}
