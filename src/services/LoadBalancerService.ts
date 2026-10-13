import { BaseService } from "./BaseService";
import {
  LBAmphora,
  LBHealthMonitor,
  LBListener,
  LBMember,
  LBPool,
  LBStats,
  LoadBalancer,
  LoadBalancerDetail,
} from "./types";

interface FloatingIp {
  floating_ip_address: string;
  port_id: string | null;
}

/**
 * Service for OpenStack Octavia load balancers.
 *
 * If Octavia is not in the service catalog the client throws
 * ServiceUnavailableError, which the view renders as an empty state.
 */
export class LoadBalancerService extends BaseService {
  /**
   * Lists load balancers in all projects (Octavia returns every project's
   * load balancers to admins) and attaches the floating IP of each VIP.
   * Floating IPs are best-effort: a Neutron failure does not fail the list.
   */
  async listLoadBalancers(): Promise<LoadBalancer[]> {
    const [loadBalancers, floatingIps] = await Promise.all([
      this.client.listAll<LoadBalancer>("load-balancer", "/lbaas/loadbalancers", "loadbalancers"),
      this.client
        .listAll<FloatingIp>("network", "/floatingips?fields=floating_ip_address&fields=port_id", "floatingips")
        .catch(() => [] as FloatingIp[]),
    ]);

    const fipByPort = new Map(
      floatingIps.filter((f) => f.port_id).map((f) => [f.port_id as string, f.floating_ip_address]),
    );
    return loadBalancers.map((lb) => ({
      ...lb,
      floating_ip: lb.vip_port_id ? fipByPort.get(lb.vip_port_id) : undefined,
    }));
  }

  /**
   * Loads everything for the detail screen in parallel: listeners, pools
   * with their members and health monitors, amphorae and stats.
   * Amphorae (admin only) and stats are optional and resolve to null on error.
   */
  async getLoadBalancerDetail(id: string): Promise<LoadBalancerDetail> {
    const lbRequest = this.client.request<{ loadbalancer: LoadBalancer }>(
      "load-balancer",
      `/lbaas/loadbalancers/${id}`,
    );
    const floatingIpRequest = lbRequest
      .then(({ loadbalancer }) =>
        loadbalancer.vip_port_id
          ? this.client.listAll<FloatingIp>(
              "network",
              `/floatingips?port_id=${loadbalancer.vip_port_id}&fields=floating_ip_address&fields=port_id`,
              "floatingips",
            )
          : [],
      )
      .catch(() => [] as FloatingIp[]);

    const [lbBody, listeners, pools, amphorae, stats, floatingIps] = await Promise.all([
      lbRequest,
      this.client.listAll<LBListener>("load-balancer", `/lbaas/listeners?loadbalancer_id=${id}`, "listeners"),
      this.client.listAll<LBPool>("load-balancer", `/lbaas/pools?loadbalancer_id=${id}`, "pools"),
      this.client
        .listAll<LBAmphora>("load-balancer", `/octavia/amphorae?loadbalancer_id=${id}`, "amphorae")
        .catch(() => null),
      this.client
        .request<{ stats: LBStats }>("load-balancer", `/lbaas/loadbalancers/${id}/stats`)
        .then((body) => body.stats)
        .catch(() => null),
      floatingIpRequest,
    ]);

    const poolsWithMembers = await Promise.all(
      pools.map(async (pool) => {
        const [members, healthMonitor] = await Promise.all([
          this.client.listAll<LBMember>("load-balancer", `/lbaas/pools/${pool.id}/members`, "members"),
          pool.healthmonitor_id
            ? this.client
                .request<{ healthmonitor: LBHealthMonitor }>(
                  "load-balancer",
                  `/lbaas/healthmonitors/${pool.healthmonitor_id}`,
                )
                .then((body) => body.healthmonitor)
                .catch(() => undefined)
            : Promise.resolve(undefined),
        ]);
        return { ...pool, members, healthMonitor };
      }),
    );

    return {
      loadBalancer: { ...lbBody.loadbalancer, floating_ip: floatingIps[0]?.floating_ip_address },
      listeners: listeners.sort((a, b) => a.protocol_port - b.protocol_port),
      pools: poolsWithMembers,
      amphorae,
      stats,
    };
  }
}
