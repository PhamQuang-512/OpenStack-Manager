import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { ReactElement, useEffect } from "react";
import { CloudViewProps, prefetchAll } from "../index";
import ServersView from "./ServersView";
import FlavorsView from "./FlavorsView";
import ImagesView from "./ImagesView";
import NetworksView from "./NetworksView";
import SecurityGroupsView from "./SecurityGroupsView";
import ClustersView from "./ClustersView";
import LoadBalancersView from "./LoadBalancersView";

interface ServiceEntry {
  name: string;
  icon: Icon;
  render: (props: CloudViewProps) => ReactElement;
}

const SERVICES: ServiceEntry[] = [
  { name: "Servers", icon: Icon.Desktop, render: (props) => <ServersView {...props} /> },
  { name: "Load Balancers", icon: Icon.Switch, render: (props) => <LoadBalancersView {...props} /> },
  { name: "Networks", icon: Icon.Network, render: (props) => <NetworksView {...props} /> },
  { name: "Security Groups", icon: Icon.Shield, render: (props) => <SecurityGroupsView {...props} /> },
  { name: "Kubernetes Clusters", icon: Icon.ComputerChip, render: (props) => <ClustersView {...props} /> },
  { name: "Flavors", icon: Icon.MemoryChip, render: (props) => <FlavorsView {...props} /> },
  { name: "Images", icon: Icon.Document, render: (props) => <ImagesView {...props} /> },
];

export default function ServiceListView(props: CloudViewProps) {
  const { configName, binaryPath } = props;

  // Warm every list while the user picks a service
  useEffect(() => {
    prefetchAll(configName, binaryPath);
  }, [configName, binaryPath]);

  return (
    <List searchBarPlaceholder="Search services..." navigationTitle={`Services — ${configName}`}>
      {SERVICES.map((service) => (
        <List.Item
          key={service.name}
          icon={service.icon}
          title={service.name}
          subtitle="All projects"
          actions={
            <ActionPanel>
              <Action.Push title="Browse" icon={Icon.List} target={service.render(props)} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
