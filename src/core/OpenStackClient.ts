import { CloudConfig } from "../config/types";
import { CLIExecutor } from "./CLIExecutor";
import { ApiError, ServiceUnavailableError, extractErrorMessage } from "./errors";
import { createHttpTransport, HttpResponse, TlsSettings, tlsSettingsFor, Transport } from "./httpTransport";

const DEFAULT_TIMEOUT_MS = 30_000;
/** Re-authenticate this long before the token actually expires. */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;
/** Safety cap for paginated list calls. */
const MAX_PAGES = 50;

const TLS_ERROR_CODES = new Set([
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

/** Builds the HTTP transport for a cloud's TLS settings; injected for testability. */
export type TransportFactory = (settings: TlsSettings) => Transport;

/**
 * Microversion headers per service type.
 * compute 2.47 embeds flavor details (original_name, vcpus...) in server
 * responses, which removes the extra flavor lookups the CLI performs.
 */
const MICROVERSION_HEADERS: Record<string, Record<string, string>> = {
  compute: { "OpenStack-API-Version": "compute 2.47", "X-OpenStack-Nova-API-Version": "2.47" },
  "container-infra": { "OpenStack-API-Version": "container-infra latest" },
};

/** Version prefix appended when the catalog endpoint is unversioned. */
const VERSION_SUFFIX: Record<string, { suffix: string; pattern: RegExp }> = {
  image: { suffix: "/v2", pattern: /\/v2(\.\d+)?$/ },
  network: { suffix: "/v2.0", pattern: /\/v2\.0$/ },
  "load-balancer": { suffix: "/v2", pattern: /\/v2(\.0)?$/ },
  identity: { suffix: "/v3", pattern: /\/v3$/ },
  "container-infra": { suffix: "/v1", pattern: /\/v1$/ },
};

export interface CatalogEndpoint {
  interface: string;
  region?: string | null;
  region_id?: string | null;
  url: string;
}

export interface CatalogEntry {
  type: string;
  endpoints: CatalogEndpoint[];
}

interface Session {
  token: string;
  expiresAt: number;
  projectId?: string;
  catalog: CatalogEntry[];
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
}

/** Loads the clouds.yaml entry for this client; injected for testability. */
export type ConfigLoader = () => Promise<CloudConfig | null>;

/**
 * Minimal OpenStack REST client.
 *
 * Authenticates once against Keystone and keeps the token + service
 * catalog in memory, so every subsequent call is a single HTTPS request
 * instead of spawning the Python CLI (which re-authenticates and
 * re-discovers endpoints on every invocation).
 *
 * Auth strategy:
 * - `v3applicationcredential` with id + secret in clouds.yaml → native Keystone call
 * - anything else (password, websso, secure.yaml, ...) → `openstack token issue`
 *   via the CLI once, then plain REST with that token
 *
 * TLS follows clouds.yaml like the CLI: `insecure: true` / `verify: false`
 * disable certificate verification, `cacert` adds a CA bundle.
 *
 * The token is never persisted or logged.
 */
export class OpenStackClient {
  private session?: Session;
  private sessionPromise?: Promise<Session>;
  private config?: CloudConfig | null;
  private transport?: Transport;

  constructor(
    private readonly cloudName: string,
    private readonly loadConfig: ConfigLoader,
    private readonly cli: CLIExecutor,
    private readonly transportFactory: TransportFactory = createHttpTransport,
  ) {}

  getCloudName(): string {
    return this.cloudName;
  }

  /** Project the token is scoped to (the "current" project). */
  async getCurrentProjectId(): Promise<string | undefined> {
    return (await this.getSession()).projectId;
  }

  /**
   * Performs a single REST call against `serviceType`.
   * `path` is appended to the (versioned) catalog endpoint.
   * Retries once with a fresh token on 401.
   */
  async request<T>(serviceType: string, path: string, options: RequestOptions = {}): Promise<T> {
    return this.doRequest<T>(serviceType, path, options, false);
  }

  /**
   * Fetches every page of a list endpoint and concatenates `key` arrays.
   * Handles the pagination styles of Nova/Neutron/Octavia (`<key>_links`
   * with rel=next) and Glance/Magnum (top-level `next`).
   */
  async listAll<T>(serviceType: string, path: string, key: string): Promise<T[]> {
    const items: T[] = [];
    let nextPath: string | null = path;

    for (let page = 0; nextPath; page++) {
      if (page === MAX_PAGES) {
        throw new ApiError(`${serviceType} ${stripQuery(path)}: more than ${MAX_PAGES} pages`, null, serviceType, path);
      }
      const body: Record<string, unknown> = await this.request<Record<string, unknown>>(serviceType, nextPath);
      const pageItems = body[key];
      // A response without the list key is an API mismatch, not an empty list
      if (!Array.isArray(pageItems)) {
        throw new ApiError(
          `${serviceType} ${stripQuery(path)}: response has no '${key}' list`,
          null,
          serviceType,
          path,
        );
      }
      items.push(...(pageItems as T[]));
      const next = buildNextPath(path, findNextHref(body, key));
      nextPath = next === nextPath ? null : next;
    }

    return items;
  }

  private async doRequest<T>(serviceType: string, path: string, options: RequestOptions, isRetry: boolean): Promise<T> {
    const session = await this.getSession();
    const base = endpointFor(session.catalog, serviceType, this.config ?? undefined);
    const url = `${base}${path}`;
    const method = options.method ?? "GET";
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    let response: HttpResponse;
    try {
      response = await this.getTransport()({
        method,
        url,
        headers: {
          "X-Auth-Token": session.token,
          Accept: "application/json",
          ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(MICROVERSION_HEADERS[serviceType] ?? {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        timeoutMs,
      });
    } catch (error) {
      throw toNetworkError(error, serviceType, method, path, timeoutMs);
    }

    if (response.status === 401 && !isRetry) {
      this.invalidateSession(session.token);
      return this.doRequest<T>(serviceType, path, options, true);
    }

    const text = response.text;
    if (!isOk(response)) {
      const detail = extractErrorMessage(text) ?? response.statusText;
      throw new ApiError(
        `${serviceType} ${method} ${stripQuery(path)} failed (${response.status}): ${detail}`,
        response.status,
        serviceType,
        path,
      );
    }

    return (text ? JSON.parse(text) : undefined) as T;
  }

  /**
   * Drops the session only if it still holds `staleToken`, so parallel
   * requests failing with the same expired token trigger one re-auth.
   */
  private invalidateSession(staleToken: string): void {
    if (this.session?.token === staleToken) {
      this.session = undefined;
    }
  }

  private async getSession(): Promise<Session> {
    if (this.session && this.session.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
      return this.session;
    }
    if (!this.sessionPromise) {
      const pending: Promise<Session> = this.authenticate()
        .then((session) => {
          this.session = session;
          return session;
        })
        .finally(() => {
          if (this.sessionPromise === pending) this.sessionPromise = undefined;
        });
      this.sessionPromise = pending;
    }
    return this.sessionPromise;
  }

  private getTransport(): Transport {
    if (!this.transport) {
      this.transport = this.transportFactory(tlsSettingsFor(this.config));
    }
    return this.transport;
  }

  private async authenticate(): Promise<Session> {
    if (this.config === undefined) {
      this.config = await this.loadConfig();
    }
    const auth = this.config?.auth;
    if (
      this.config?.auth_type === "v3applicationcredential" &&
      auth?.auth_url &&
      auth.application_credential_id &&
      auth.application_credential_secret
    ) {
      return this.authenticateWithApplicationCredential(
        auth.auth_url,
        auth.application_credential_id,
        auth.application_credential_secret,
      );
    }
    return this.authenticateWithCLI();
  }

  private async authenticateWithApplicationCredential(authUrl: string, id: string, secret: string): Promise<Session> {
    const url = `${withVersion(authUrl, "identity")}/auth/tokens`;
    let response: HttpResponse;
    try {
      response = await this.getTransport()({
        method: "POST",
        url,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          auth: { identity: { methods: ["application_credential"], application_credential: { id, secret } } },
        }),
        timeoutMs: DEFAULT_TIMEOUT_MS,
      });
    } catch (error) {
      throw toNetworkError(error, "identity", "POST", "/auth/tokens", DEFAULT_TIMEOUT_MS);
    }

    const text = response.text;
    const tokenHeader = response.headers["x-subject-token"];
    const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
    if (!isOk(response) || !token) {
      const detail = extractErrorMessage(text) ?? response.statusText;
      throw new ApiError(
        `Authentication failed for '${this.cloudName}' (${response.status}): ${detail}`,
        response.status,
        "identity",
        "/auth/tokens",
      );
    }

    const body = JSON.parse(text) as {
      token: { expires_at: string; project?: { id: string }; catalog?: CatalogEntry[] };
    };
    return {
      token,
      expiresAt: parseExpiry(body.token.expires_at),
      projectId: body.token.project?.id,
      catalog: body.token.catalog ?? [],
    };
  }

  /**
   * Fallback for auth types we don't implement natively: let the CLI
   * authenticate once, then use the token for direct REST calls.
   */
  private async authenticateWithCLI(): Promise<Session> {
    const [token, catalog] = await Promise.all([
      this.cli.run<{ id: string; expires: string; project_id?: string }>(["token", "issue"]),
      this.cli.run<CatalogEntry[]>(["catalog", "list"]),
    ]);
    return {
      token: token.id,
      expiresAt: parseExpiry(token.expires),
      projectId: token.project_id,
      catalog,
    };
  }
}

/**
 * Resolves the base URL for a service from the catalog, honouring the
 * cloud's region and interface. Unversioned endpoints get a version suffix.
 */
export function endpointFor(catalog: CatalogEntry[], serviceType: string, config?: CloudConfig): string {
  const wantedInterface = (config?.interface ?? "public").replace(/URL$/, "");
  const region = config?.region_name;

  const entry = catalog.find((e) => e.type === serviceType);
  const endpoint = entry?.endpoints.find(
    (ep) => ep.interface === wantedInterface && (!region || ep.region_id === region || ep.region === region),
  );
  if (!endpoint) {
    throw new ServiceUnavailableError(serviceType);
  }
  return withVersion(endpoint.url, serviceType);
}

function withVersion(url: string, serviceType: string): string {
  const trimmed = url.replace(/\/+$/, "");
  const version = VERSION_SUFFIX[serviceType];
  if (!version || version.pattern.test(trimmed)) return trimmed;
  return `${trimmed}${version.suffix}`;
}

function findNextHref(body: Record<string, unknown>, key: string): string | null {
  const links = body[`${key}_links`];
  if (Array.isArray(links)) {
    const next = links.find((l) => (l as { rel?: string }).rel === "next") as { href?: string } | undefined;
    if (next?.href) return next.href;
  }
  if (typeof body.next === "string" && body.next) return body.next;
  return null;
}

/**
 * Builds the path for the next page. Only the query string of the `next`
 * link is used: services behind proxies often advertise internal hosts or
 * plain http in their links. Original query params not present in the
 * next link (e.g. `all_tenants`) are carried over.
 */
export function buildNextPath(originalPath: string, nextHref: string | null): string | null {
  if (!nextHref) return null;
  const [pathname, originalQuery = ""] = originalPath.split("?");
  const nextParams = new URL(nextHref, "http://placeholder").searchParams;
  if (!nextParams.has("marker")) return null;

  const merged = new URLSearchParams(nextParams);
  const original = new URLSearchParams(originalQuery);
  for (const key of new Set(original.keys())) {
    if (!merged.has(key)) {
      for (const value of original.getAll(key)) merged.append(key, value);
    }
  }
  return `${pathname}?${merged.toString()}`;
}

function parseExpiry(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isNaN(parsed) ? Date.now() + 60 * 60_000 : parsed;
}

/** 2xx only: redirects are not followed, so a 3xx is an error too. */
function isOk(response: HttpResponse): boolean {
  return response.status >= 200 && response.status < 300;
}

function stripQuery(path: string): string {
  return path.split("?")[0];
}

function toNetworkError(error: unknown, serviceType: string, method: string, path: string, timeoutMs: number) {
  const prefix = `${serviceType} ${method} ${stripQuery(path)}`;
  if (error instanceof Error && error.name === "TimeoutError") {
    return new ApiError(`${prefix} timed out after ${timeoutMs / 1000}s`, null, serviceType, path);
  }
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && TLS_ERROR_CODES.has(code)) {
    return new ApiError(
      // Drop Node's "--use-system-ca" hint: Raycast controls the Node flags
      `${prefix} failed: ${message.split(";")[0]}. Add 'cacert: <path to CA bundle>' to this cloud in clouds.yaml ` +
        `(or 'verify: false' for test environments only).`,
      null,
      serviceType,
      path,
    );
  }
  return new ApiError(`${prefix} failed: ${message}`, null, serviceType, path);
}
