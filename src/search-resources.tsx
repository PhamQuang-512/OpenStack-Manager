import { getPreferenceValues } from "@raycast/api";
import { ConfigManager } from "./config/ConfigManager";
import ConfigBrowseView from "./services/views/ConfigBrowseView";

const configManager = new ConfigManager();

export default function Command() {
  const { openstackBinaryPath } = getPreferenceValues<Preferences>();
  return <ConfigBrowseView configManager={configManager} binaryPath={openstackBinaryPath} />;
}
