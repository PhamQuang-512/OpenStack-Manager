import { BaseService } from "./BaseService";
import { Image } from "./types";

/**
 * Service for listing OpenStack Glance images.
 */
export class ImageService extends BaseService {
  /**
   * Lists all images visible to the credential (all projects for admin).
   * Glance pages at 25 by default, so request the maximum page size.
   */
  async listImages(): Promise<Image[]> {
    return this.client.listAll<Image>("image", "/images?limit=1000", "images");
  }

  /**
   * Fetches the raw image document for the detail view.
   */
  async getImage(id: string): Promise<Record<string, unknown>> {
    return this.client.request<Record<string, unknown>>("image", `/images/${id}`);
  }
}
