/**
 * Data types for OpenStack resources, mapped from the REST API responses.
 * List views work across all projects, so most resources carry `project_id`.
 */

/** Keystone project (tenant). */
export interface Project {
  id: string;
  name: string;
  domain_id?: string;
  enabled?: boolean;
  description?: string;
}

/** Nova compute instance (virtual machine). */
export interface Server {
  id: string;
  name: string;
  status: string;
  flavor: string;
  image: string;
  /** Display string in CLI style: "net1=10.0.0.5, 1.2.3.4; net2=10.1.0.7" */
  networks: string;
  ips?: string[];
  project_id?: string;
  host?: string;
  security_groups?: string;
  availability_zone?: string;
  key_name?: string | null;
  created?: string;
  updated?: string;
}

/** Nova hardware profile defining vCPU, RAM, and disk for a Server. */
export interface Flavor {
  id: string;
  name: string;
  vcpus?: number;
  ram?: number; // MB
  disk?: number; // GB
  ephemeral?: number;
  swap?: string;
  rxtx_factor?: number;
  is_public?: boolean;
}

/** Glance disk image used to boot a Server. */
export interface Image {
  id: string;
  name: string;
  status: string;
  disk_format?: string;
  container_format?: string;
  size?: number | null; // bytes
  min_disk?: number;
  min_ram?: number;
  visibility?: string;
  owner?: string;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
}

/** Neutron virtual network. */
export interface Network {
  id: string;
  name: string;
  status?: string;
  admin_state_up?: boolean;
  shared?: boolean;
  router_external?: boolean;
  subnets?: string[];
  provider_network_type?: string;
  provider_segmentation_id?: number;
  project_id?: string;
}

/** Neutron security group. */
export interface SecurityGroup {
  id: string;
  name: string;
  description?: string;
  project_id?: string;
  project_name?: string;
  security_group_rules?: SecurityGroupRule[];
}

/** A single rule within a SecurityGroup. */
export interface SecurityGroupRule {
  id: string;
  direction: "ingress" | "egress";
  protocol: string | null;
  port_range_min: number | null;
  port_range_max: number | null;
  remote_ip_prefix: string | null;
  remote_group_id: string | null;
  ethertype: "IPv4" | "IPv6";
  description?: string | null;
}

/** Magnum Kubernetes cluster. */
export interface MagnumCluster {
  uuid: string;
  name: string;
  status: string;
  status_reason?: string | null;
  health_status?: string | null;
  cluster_template_id?: string;
  master_count?: number;
  node_count?: number;
  keypair?: string | null;
  api_address?: string | null;
  discovery_url?: string | null;
  created_at?: string;
  updated_at?: string | null;
  labels?: Record<string, string>;
  coe_version?: string | null;
  project_id?: string;
}

/** Octavia load balancer. */
export interface LoadBalancer {
  id: string;
  name: string;
  description?: string;
  project_id?: string;
  vip_address?: string;
  vip_port_id?: string;
  vip_subnet_id?: string;
  vip_network_id?: string;
  provisioning_status: string;
  operating_status: string;
  provider?: string;
  flavor_id?: string | null;
  availability_zone?: string | null;
  admin_state_up?: boolean;
  listeners?: { id: string }[];
  pools?: { id: string }[];
  created_at?: string;
  updated_at?: string | null;
  /** Floating IP attached to the VIP port, resolved from Neutron. */
  floating_ip?: string;
}

export interface LBListener {
  id: string;
  name: string;
  protocol: string;
  protocol_port: number;
  default_pool_id?: string | null;
  provisioning_status: string;
  operating_status: string;
  connection_limit?: number;
  allowed_cidrs?: string[] | null;
  timeout_client_data?: number;
  timeout_member_data?: number;
  insert_headers?: Record<string, string>;
  default_tls_container_ref?: string | null;
}

export interface LBPool {
  id: string;
  name: string;
  protocol: string;
  lb_algorithm: string;
  provisioning_status: string;
  operating_status: string;
  healthmonitor_id?: string | null;
  session_persistence?: { type: string; cookie_name?: string | null } | null;
  listeners?: { id: string }[];
}

export interface LBMember {
  id: string;
  name: string;
  address: string;
  protocol_port: number;
  weight?: number;
  backup?: boolean;
  subnet_id?: string | null;
  provisioning_status: string;
  operating_status: string;
  admin_state_up?: boolean;
}

export interface LBHealthMonitor {
  id: string;
  name?: string;
  type: string;
  delay: number;
  timeout: number;
  max_retries: number;
  max_retries_down?: number;
  http_method?: string | null;
  url_path?: string | null;
  expected_codes?: string | null;
  operating_status?: string;
}

export interface LBAmphora {
  id: string;
  role?: string | null;
  status: string;
  compute_id?: string | null;
  lb_network_ip?: string | null;
  vrrp_ip?: string | null;
  ha_ip?: string | null;
  image_id?: string | null;
  cert_expiration?: string | null;
}

export interface LBStats {
  active_connections: number;
  total_connections: number;
  bytes_in: number;
  bytes_out: number;
  request_errors: number;
}

/** Everything shown on the load balancer detail screen, fetched in parallel. */
export interface LoadBalancerDetail {
  loadBalancer: LoadBalancer;
  listeners: LBListener[];
  pools: (LBPool & { members: LBMember[]; healthMonitor?: LBHealthMonitor })[];
  /** null when the caller is not allowed to list amphorae (admin only) or the provider has none. */
  amphorae: LBAmphora[] | null;
  stats: LBStats | null;
}
