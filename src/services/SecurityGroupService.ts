import { BaseService } from "./BaseService";
import { SecurityGroup } from "./types";

const LIST_FIELDS = ["id", "name", "description", "project_id"];

/**
 * Service for listing OpenStack Neutron security groups.
 */
export class SecurityGroupService extends BaseService {
  /**
   * Lists security groups in all projects. Rules are excluded from the
   * list payload (they can be large) and loaded by the detail view.
   */
  async listSecurityGroups(): Promise<SecurityGroup[]> {
    const fields = LIST_FIELDS.map((f) => `fields=${f}`).join("&");
    return this.client.listAll<SecurityGroup>("network", `/security-groups?${fields}`, "security_groups");
  }

  /**
   * Fetches a security group including its embedded rules.
   */
  async getSecurityGroup(id: string): Promise<SecurityGroup & Record<string, unknown>> {
    const body = await this.client.request<{ security_group: SecurityGroup & Record<string, unknown> }>(
      "network",
      `/security-groups/${id}`,
    );
    return body.security_group;
  }
}
