import { BaseService } from "./BaseService";
import { Project } from "./types";
import { ApiError } from "../core/errors";

/**
 * Service for Keystone projects, used to show project names next to
 * resources listed across all projects.
 */
export class ProjectService extends BaseService {
  /**
   * Lists every project (admin). Falls back to the projects the
   * credential has access to when the full list is forbidden.
   */
  async listProjects(): Promise<Project[]> {
    try {
      const body = await this.client.request<{ projects: Project[] }>("identity", "/projects");
      return body.projects;
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        const body = await this.client.request<{ projects: Project[] }>("identity", "/auth/projects");
        return body.projects;
      }
      throw error;
    }
  }
}
