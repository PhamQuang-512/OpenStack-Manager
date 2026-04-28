/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** OpenStack CLI Path - Path to the openstack CLI executable */
  "openstackBinaryPath": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `search-resources` command */
  export type SearchResources = ExtensionPreferences & {}
  /** Preferences accessible in the `manage-configs` command */
  export type ManageConfigs = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `search-resources` command */
  export type SearchResources = {}
  /** Arguments passed to the `manage-configs` command */
  export type ManageConfigs = {}
}

