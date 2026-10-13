import { BaseService } from "./BaseService";
import { MagnumCluster } from "./types";

/**
 * Service for listing OpenStack Magnum Kubernetes clusters.
 *
 * If Magnum is not in the service catalog the client throws
 * ServiceUnavailableError, which the view renders as an empty state.
 */
export class ClusterService extends BaseService {
  /**
   * Lists clusters. Magnum returns clusters of all projects to admins.
   * `/clusters/detail` is used because the plain list omits project_id.
   */
  async listClusters(): Promise<MagnumCluster[]> {
    return this.client.listAll<MagnumCluster>("container-infra", "/clusters/detail", "clusters");
  }

  /**
   * Fetches the raw cluster document for the detail view.
   */
  async getCluster(id: string): Promise<Record<string, unknown>> {
    return this.client.request<Record<string, unknown>>("container-infra", `/clusters/${id}`);
  }
}
