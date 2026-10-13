import { Action, ActionPanel, Form, showToast, Toast, useNavigation } from "@raycast/api";
import { useState } from "react";
import { ConfigManager } from "../../config/ConfigManager";
import { CloudConfig } from "../../config/types";
import { tlsSettingsFor } from "../../core/httpTransport";

/** Top-level clouds.yaml keys written from form fields; everything else is preserved on edit. */
const FORM_MANAGED_KEYS = new Set(["name", "verify", "insecure", "cacert", "horizon_url"]);

interface ConfigFormViewProps {
  configManager: ConfigManager;
  editConfig?: CloudConfig;
  onSaved: () => void;
}

export default function ConfigFormView({ configManager, editConfig, onSaved }: ConfigFormViewProps) {
  const { pop } = useNavigation();
  const isEditing = !!editConfig;

  const [nameError, setNameError] = useState<string | undefined>();
  const [authUrlError, setAuthUrlError] = useState<string | undefined>();
  const [credIdError, setCredIdError] = useState<string | undefined>();
  const [credSecretError, setCredSecretError] = useState<string | undefined>();
  const [regionError, setRegionError] = useState<string | undefined>();

  function validateRequired(value: string | undefined, setter: (err: string | undefined) => void): boolean {
    if (!value || value.trim().length === 0) {
      setter("This field is required");
      return false;
    }
    setter(undefined);
    return true;
  }

  async function handleSubmit(values: {
    name: string;
    auth_url: string;
    application_credential_id: string;
    application_credential_secret: string;
    region_name: string;
    horizon_url: string;
    verify_tls: boolean;
    cacert: string;
  }) {
    const nameValid = validateRequired(values.name, setNameError);
    const authUrlValid = validateRequired(values.auth_url, setAuthUrlError);
    const credIdValid = validateRequired(values.application_credential_id, setCredIdError);
    const credSecretValid = validateRequired(values.application_credential_secret, setCredSecretError);
    const regionValid = validateRequired(values.region_name, setRegionError);

    if (!nameValid || !authUrlValid || !credIdValid || !credSecretValid || !regionValid) {
      return;
    }

    // Keep keys this form does not manage (interface, project ids, ...) when editing
    const preserved = Object.fromEntries(
      Object.entries(editConfig ?? {}).filter(([key]) => !FORM_MANAGED_KEYS.has(key)),
    ) as Partial<CloudConfig>;

    const config: CloudConfig = {
      ...preserved,
      name: values.name.trim(),
      auth_type: "v3applicationcredential",
      auth: {
        ...editConfig?.auth,
        auth_url: values.auth_url.trim(),
        application_credential_id: values.application_credential_id.trim(),
        application_credential_secret: values.application_credential_secret.trim(),
      },
      region_name: values.region_name.trim(),
      interface: editConfig?.interface ?? "public",
      identity_api_version: 3,
      ...(values.horizon_url.trim() ? { horizon_url: values.horizon_url.trim() } : {}),
      ...(values.verify_tls ? {} : { verify: false }),
      ...(values.verify_tls && values.cacert.trim() ? { cacert: values.cacert.trim() } : {}),
    };

    try {
      await configManager.addOrUpdateConfig(config);
      await showToast({
        style: Toast.Style.Success,
        title: isEditing ? "Config updated" : "Config added",
        message: config.name,
      });
      onSaved();
      pop();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to save config",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <Form
      navigationTitle={isEditing ? `Edit Config: ${editConfig.name}` : "Add New Config"}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={isEditing ? "Update Config" : "Add Config"} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Name"
        placeholder="my-cloud"
        defaultValue={editConfig?.name ?? ""}
        error={nameError}
        onChange={() => setNameError(undefined)}
      />
      <Form.TextField
        id="auth_url"
        title="Auth URL"
        placeholder="https://keystone.example.com:5000/v3"
        defaultValue={editConfig?.auth.auth_url ?? ""}
        error={authUrlError}
        onChange={() => setAuthUrlError(undefined)}
      />
      <Form.TextField
        id="application_credential_id"
        title="Application Credential ID"
        placeholder="abc123..."
        defaultValue={editConfig?.auth.application_credential_id ?? ""}
        error={credIdError}
        onChange={() => setCredIdError(undefined)}
      />
      <Form.PasswordField
        id="application_credential_secret"
        title="Application Credential Secret"
        placeholder="secret..."
        defaultValue={editConfig?.auth.application_credential_secret ?? ""}
        error={credSecretError}
        onChange={() => setCredSecretError(undefined)}
      />
      <Form.TextField
        id="region_name"
        title="Region"
        placeholder="RegionOne"
        defaultValue={editConfig?.region_name ?? ""}
        error={regionError}
        onChange={() => setRegionError(undefined)}
      />
      <Form.TextField
        id="horizon_url"
        title="Horizon URL (optional)"
        placeholder="https://horizon.example.com"
        defaultValue={editConfig?.horizon_url ?? ""}
      />
      <Form.Separator />
      <Form.Checkbox
        id="verify_tls"
        title="TLS"
        label="Verify server certificate"
        info="Unchecking writes 'verify: false' (same as 'insecure: true'). Only use this for test environments."
        defaultValue={tlsSettingsFor(editConfig).verify}
      />
      <Form.TextField
        id="cacert"
        title="CA Certificate (optional)"
        placeholder="~/.config/openstack/ca.pem"
        info="CA bundle for endpoints signed by a private CA (clouds.yaml 'cacert')."
        defaultValue={editConfig?.cacert ?? ""}
      />
    </Form>
  );
}
