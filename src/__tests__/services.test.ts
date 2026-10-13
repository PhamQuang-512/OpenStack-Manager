// Unit tests for the REST-backed resource services

import { OpenStackClient } from "../core/OpenStackClient";
import { ApiError } from "../core/errors";
import { ServerService, toServer } from "../services/ServerService";
import { FlavorService } from "../services/FlavorService";
import { NetworkService } from "../services/NetworkService";
import { ProjectService } from "../services/ProjectService";
import { LoadBalancerService } from "../services/LoadBalancerService";

function createMockClient() {
  return {
    request: jest.fn(),
    listAll: jest.fn(),
  } as unknown as jest.Mocked<OpenStackClient>;
}

describe("ServerService", () => {
  const novaServer = {
    id: "srv-1",
    name: "web-01",
    status: "ACTIVE",
    tenant_id: "proj-a",
    flavor: { original_name: "m1.large" },
    image: { id: "img-1" },
    addresses: {
      private: [{ addr: "10.0.0.5" }, { addr: "203.0.113.10" }],
      backend: [{ addr: "10.1.0.7" }],
    },
    security_groups: [{ name: "default" }, { name: "web" }],
    "OS-EXT-SRV-ATTR:host": "compute-01",
    "OS-EXT-AZ:availability_zone": "az-1",
  };

  it("maps Nova servers to the list model", () => {
    expect(toServer(novaServer)).toMatchObject({
      id: "srv-1",
      flavor: "m1.large",
      image: "img-1",
      networks: "private=10.0.0.5, 203.0.113.10; backend=10.1.0.7",
      ips: ["10.0.0.5", "203.0.113.10", "10.1.0.7"],
      project_id: "proj-a",
      host: "compute-01",
      security_groups: "default, web",
      availability_zone: "az-1",
    });
  });

  it("lists servers of all projects", async () => {
    const client = createMockClient();
    client.listAll.mockResolvedValueOnce([novaServer]);

    const servers = await new ServerService(client).listServers();

    expect(client.listAll).toHaveBeenCalledWith("compute", "/servers/detail?all_tenants=1", "servers");
    expect(servers).toHaveLength(1);
  });

  it("falls back to the current project when all_tenants is forbidden", async () => {
    const client = createMockClient();
    client.listAll
      .mockRejectedValueOnce(new ApiError("forbidden", 403, "compute", "/servers/detail"))
      .mockResolvedValueOnce([novaServer]);

    const servers = await new ServerService(client).listServers();

    expect(client.listAll).toHaveBeenLastCalledWith("compute", "/servers/detail", "servers");
    expect(servers[0].id).toBe("srv-1");
  });

  it("propagates other errors instead of returning an empty list", async () => {
    const client = createMockClient();
    client.listAll.mockRejectedValueOnce(new ApiError("boom", 500, "compute", "/servers/detail"));

    await expect(new ServerService(client).listServers()).rejects.toThrow("boom");
  });

  it("sends power actions to the action endpoint", async () => {
    const client = createMockClient();
    client.request.mockResolvedValue(undefined);
    const service = new ServerService(client);

    await service.startServer("srv-1");
    await service.stopServer("srv-1");
    await service.rebootServer("srv-1");

    expect(client.request).toHaveBeenNthCalledWith(1, "compute", "/servers/srv-1/action", {
      method: "POST",
      body: { "os-start": null },
    });
    expect(client.request).toHaveBeenNthCalledWith(2, "compute", "/servers/srv-1/action", {
      method: "POST",
      body: { "os-stop": null },
    });
    expect(client.request).toHaveBeenNthCalledWith(3, "compute", "/servers/srv-1/action", {
      method: "POST",
      body: { reboot: { type: "SOFT" } },
    });
  });
});

describe("FlavorService", () => {
  it("maps extension keys and sorts by vCPU count", async () => {
    const client = createMockClient();
    client.listAll.mockResolvedValueOnce([
      { id: "f2", name: "large", vcpus: 8, ram: 16384, disk: 80, "os-flavor-access:is_public": false },
      { id: "f1", name: "small", vcpus: 1, ram: 1024, disk: 10, "os-flavor-access:is_public": true },
    ]);

    const flavors = await new FlavorService(client).listFlavors();

    expect(flavors.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(flavors[1].is_public).toBe(false);
  });
});

describe("NetworkService", () => {
  it("normalizes provider and router keys", async () => {
    const client = createMockClient();
    client.listAll.mockResolvedValueOnce([
      { id: "n1", name: "ext", "router:external": true, "provider:network_type": "vlan", project_id: "proj-a" },
    ]);

    const [network] = await new NetworkService(client).listNetworks();

    expect(network).toMatchObject({ router_external: true, provider_network_type: "vlan", project_id: "proj-a" });
  });
});

describe("ProjectService", () => {
  it("falls back to /auth/projects when listing all projects is forbidden", async () => {
    const client = createMockClient();
    client.request
      .mockRejectedValueOnce(new ApiError("forbidden", 403, "identity", "/projects"))
      .mockResolvedValueOnce({ projects: [{ id: "p1", name: "mine" }] });

    const projects = await new ProjectService(client).listProjects();

    expect(client.request).toHaveBeenLastCalledWith("identity", "/auth/projects");
    expect(projects).toEqual([{ id: "p1", name: "mine" }]);
  });
});

describe("LoadBalancerService", () => {
  it("attaches the floating IP of each VIP port", async () => {
    const client = createMockClient();
    client.listAll.mockImplementation(async (service: string) =>
      service === "network"
        ? [{ floating_ip_address: "198.51.100.5", port_id: "port-1" }]
        : [
            { id: "lb1", name: "a", vip_port_id: "port-1", provisioning_status: "ACTIVE", operating_status: "ONLINE" },
            { id: "lb2", name: "b", vip_port_id: "port-2", provisioning_status: "ACTIVE", operating_status: "ONLINE" },
          ],
    );

    const lbs = await new LoadBalancerService(client).listLoadBalancers();

    expect(lbs.find((lb) => lb.id === "lb1")?.floating_ip).toBe("198.51.100.5");
    expect(lbs.find((lb) => lb.id === "lb2")?.floating_ip).toBeUndefined();
  });

  it("still lists load balancers when floating IPs cannot be fetched", async () => {
    const client = createMockClient();
    client.listAll.mockImplementation(async (service: string) => {
      if (service === "network") throw new ApiError("down", 503, "network", "/floatingips");
      return [{ id: "lb1", name: "a", provisioning_status: "ACTIVE", operating_status: "ONLINE" }];
    });

    await expect(new LoadBalancerService(client).listLoadBalancers()).resolves.toHaveLength(1);
  });

  it("assembles listeners, pools with members and health monitors, amphorae and stats", async () => {
    const client = createMockClient();
    client.request.mockImplementation(async (_service: string, path: string) => {
      if (path === "/lbaas/loadbalancers/lb1") {
        return {
          loadbalancer: {
            id: "lb1",
            name: "web",
            vip_port_id: "port-1",
            provisioning_status: "ACTIVE",
            operating_status: "ONLINE",
          },
        };
      }
      if (path === "/lbaas/loadbalancers/lb1/stats") {
        return {
          stats: { active_connections: 1, total_connections: 10, bytes_in: 5, bytes_out: 6, request_errors: 0 },
        };
      }
      if (path === "/lbaas/healthmonitors/hm1") {
        return { healthmonitor: { id: "hm1", type: "HTTP", delay: 5, timeout: 3, max_retries: 3 } };
      }
      throw new Error(`unexpected ${path}`);
    });
    client.listAll.mockImplementation(async (_service: string, path: string) => {
      if (path.startsWith("/lbaas/listeners")) {
        return [
          { id: "l2", protocol: "HTTPS", protocol_port: 443 },
          { id: "l1", protocol: "HTTP", protocol_port: 80 },
        ];
      }
      if (path.startsWith("/lbaas/pools?")) return [{ id: "p1", healthmonitor_id: "hm1" }];
      if (path === "/lbaas/pools/p1/members") return [{ id: "m1", address: "10.0.0.5", protocol_port: 8080 }];
      if (path.startsWith("/octavia/amphorae")) throw new ApiError("forbidden", 403, "load-balancer", path);
      if (path.startsWith("/floatingips")) return [{ floating_ip_address: "198.51.100.5", port_id: "port-1" }];
      throw new Error(`unexpected ${path}`);
    });

    const detail = await new LoadBalancerService(client).getLoadBalancerDetail("lb1");

    expect(detail.loadBalancer.floating_ip).toBe("198.51.100.5");
    expect(detail.listeners.map((l) => l.protocol_port)).toEqual([80, 443]);
    expect(detail.pools[0].members).toHaveLength(1);
    expect(detail.pools[0].healthMonitor?.type).toBe("HTTP");
    expect(detail.amphorae).toBeNull();
    expect(detail.stats?.total_connections).toBe(10);
  });
});
