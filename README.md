<p align="center">
  <img src="assets/extension-icon.png" width="128" height="128" alt="OpenStack Manager Icon" />
</p>

# OpenStack Manager

A Raycast extension for browsing and managing OpenStack cloud resources. Access servers, load balancers, flavors, images, networks, security groups, and Kubernetes clusters across all projects and multiple cloud configurations — all from Raycast.

## Features

- **Multi-Cloud Support**: Manage multiple OpenStack clouds from a single interface
- **All Projects**: Every list shows resources from all projects (admin credentials), with the owning project name and a project filter dropdown
- **Resource Browsing**: Browse servers, load balancers, flavors, images, networks, security groups, and Magnum clusters
- **Load Balancers (Octavia)**: VIP and floating IP, listeners, pools, members (resolved to server names), health monitors, amphorae and statistics
- **Server Actions**: Start, stop, and reboot servers directly from Raycast (stop/reboot ask for confirmation)
- **Fast Loading**: Direct REST calls with a reused Keystone token; all lists are prefetched in parallel when a cloud is opened
- **Persistent Caching**: Resources load instantly on subsequent opens with background refresh
- **Detail Views**: Full resource details with all fields displayed
- **Security Group Rules**: View firewall rules for each security group
- **Horizon Integration**: Open any resource in your Horizon dashboard with one shortcut
- **Copy IPs**: Copy all IP addresses from a server with `Cmd+Shift+I`
- **Search & Filter**: Search by name, ID, IP address, host or project name

## Prerequisites

- At least one cloud configured in `~/.config/openstack/clouds.yaml`
- [OpenStack CLI](https://docs.openstack.org/python-openstackclient/latest/) (`python-openstackclient`) — only required for clouds that do not use application credentials (see [How It Works](#how-it-works))
- Admin role to see resources of all projects; non-admin credentials see their own project only

Install the CLI:

```bash
pip install python-openstackclient
```

## Setup

1. Install the extension in Raycast
2. Set the **OpenStack CLI Path** in extension preferences (default: `openstack`). If the CLI is in a virtualenv or non-standard location, use the full path (e.g., `/opt/homebrew/bin/openstack`)
3. Add a cloud configuration via the **Manage Configs** command, or create `~/.config/openstack/clouds.yaml` manually

### Cloud Configuration

Each cloud config uses [application credentials](https://docs.openstack.org/keystone/latest/user/application_credentials.html) for authentication:

```yaml
clouds:
  my-cloud:
    auth_type: v3applicationcredential
    auth:
      auth_url: https://keystone.example.com:5000/v3
      application_credential_id: <your-credential-id>
      application_credential_secret: <your-credential-secret>
    region_name: RegionOne
    interface: public
    identity_api_version: 3
```

You can optionally add a `horizon_url` field to enable "Open in Browser" actions:

```yaml
clouds:
  my-cloud:
    # ... auth fields ...
    horizon_url: https://horizon.example.com
```

## Commands

### Search OpenStack Resources

The main entry point. Flow:

1. **Select a cloud config** from your `clouds.yaml`
2. **Pick a service** (Servers, Load Balancers, Networks, Security Groups, Kubernetes Clusters, Flavors, Images)
3. **Browse resources** across all projects, filter by project with the dropdown, search by name / ID / IP
4. **View details** with full metadata

### Manage Configs

Add, edit, and remove cloud configurations. Configs are stored in the standard `~/.config/openstack/clouds.yaml` format.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | View details / Browse |
| `Cmd+Shift+C` | Copy resource ID |
| `Cmd+Shift+I` | Copy all IP addresses (servers) / VIP and floating IP (load balancers) |
| `Cmd+Shift+M` | Copy member addresses (load balancer detail) |
| `Cmd+R` | Refresh / Reload from CLI |
| `Cmd+O` | Open in Horizon dashboard |

## How It Works

The extension talks to the OpenStack REST APIs (Keystone, Nova, Neutron, Glance, Octavia, Magnum) directly:

- **Application credentials** (`auth_type: v3applicationcredential` with id and secret in `clouds.yaml`): the extension authenticates against Keystone itself.
- **Any other auth type** (password, websso, secrets in `secure.yaml`, ...): the extension runs `openstack token issue` and `openstack catalog list` once, then uses that token for REST calls.

The token and service catalog are kept in memory only (never written to disk) and reused for every request while the command is open. Endpoints are resolved from the catalog using the cloud's `region_name` and `interface`.

Resource lists are cached in Raycast's LocalStorage for instant loading on subsequent opens, and refreshed in the background. A failed refresh keeps showing the cached data. Detail views are cached per resource ID.

### TLS / private CA

Raycast runs extensions on its own Node.js, which only trusts the public (Mozilla) CA bundle — not certificates installed in the macOS Keychain. TLS options in `clouds.yaml` are honoured with the same meaning as in the `openstack` CLI:

```yaml
clouds:
  my-cloud:
    # Preferred for endpoints signed by a private/corporate CA:
    cacert: ~/.config/openstack/my-ca.pem
    # Test environments only — disables certificate verification:
    # verify: false        (or: insecure: true)
```

To export a CA from the macOS System keychain: `security find-certificate -a -c "<CA name>" -p /Library/Keychains/System.keychain > ~/.config/openstack/my-ca.pem`. Both options can also be set from **Manage Configs**; clouds with verification disabled are marked "TLS verify off".

## Feedback & Issues

Found a bug, have a feature request, or need help setting up your cloud configurations? 

Please feel free to [open an issue](https://github.com/PhamQuang-512/OpenStack-Manager/issues) on GitHub. Contributions, suggestions, and feedback are always welcome!