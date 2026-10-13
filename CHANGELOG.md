# OpenStack Manager Changelog

## [All Projects, Load Balancers and Faster Loading] - {PR_MERGE_DATE}

- Load Balancers (Octavia): list with VIP, floating IP and status; detail view with listeners, pools, members, health monitors, amphorae and statistics
- All resource lists now show every project (admin), with project name and a project filter dropdown
- Search by ID, IP address, host and project name in addition to name
- Replaced per-call `openstack` CLI invocations with direct REST calls and a reused Keystone token; lists are prefetched in parallel when a cloud is opened
- A failed refresh no longer replaces cached data with an empty list
- Stop and reboot now ask for confirmation
- `clouds.yaml` is written with owner-only permissions (0600)
- TLS options from `clouds.yaml` are honoured (`cacert`, `verify: false`, `insecure: true`) and can be edited in Manage Configs
- Editing a config no longer drops keys the form does not manage (e.g. `interface`, TLS options)

## [Initial Version] - {PR_MERGE_DATE}

- Browse servers, flavors, images, networks, security groups, and Kubernetes clusters
- Multi-cloud support via `clouds.yaml` configuration
- Server actions: start, stop, reboot
- Persistent caching with instant loading on subsequent opens
- Generic detail views showing all fields from `openstack show` commands
- Security group rules displayed via `security group rule list`
- Horizon dashboard integration with Open in Browser action
- Copy resource ID and IP addresses
- Search filtering across all resource lists
- Manage Configs command for adding, editing, and removing cloud configurations
