/**
 * Error types for the openstack-manager extension.
 *
 * CLIError: Base error for all openstack CLI failures (non-zero exit, parse errors).
 * BinaryNotFoundError: Thrown when the openstack binary is not found (ENOENT).
 * ApiError: Non-2xx response (or timeout) from an OpenStack REST API.
 * ServiceUnavailableError: Thrown when a service (e.g., Magnum, Octavia) is not in the catalog.
 */

export class CLIError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number | null,
    public readonly stderr: string,
    public readonly args: string[],
  ) {
    super(message);
    this.name = "CLIError";
  }
}

export class BinaryNotFoundError extends CLIError {
  constructor(binaryPath: string) {
    super(
      `openstack CLI binary not found at '${binaryPath}'. Install it with: pip install python-openstackclient`,
      null,
      "",
      [],
    );
    this.name = "BinaryNotFoundError";
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly serviceType: string,
    public readonly path: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ServiceUnavailableError extends Error {
  constructor(public readonly serviceType: string) {
    super(`Service '${serviceType}' is not available in the active config's region`);
    this.name = "ServiceUnavailableError";
  }
}

/**
 * Extracts a human-readable message from an OpenStack error body.
 * Each service uses a different envelope:
 * - Nova:     {"itemNotFound": {"message": "..."}}
 * - Neutron:  {"NeutronError": {"message": "..."}}
 * - Keystone: {"error": {"message": "..."}}
 * - Octavia:  {"faultstring": "..."}
 * - Magnum:   {"errors": [{"detail": "..."}]}
 */
export function extractErrorMessage(body: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    const text = body
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text ? text.slice(0, 300) : null;
  }
  return findMessage(parsed, 0);
}

function findMessage(value: unknown, depth: number): string | null {
  if (depth > 3 || value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findMessage(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["message", "faultstring", "detail", "title"]) {
    if (typeof record[key] === "string" && record[key]) return record[key] as string;
  }
  for (const nested of Object.values(record)) {
    const found = findMessage(nested, depth + 1);
    if (found) return found;
  }
  return null;
}
