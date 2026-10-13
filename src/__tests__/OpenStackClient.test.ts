import { buildNextPath, CatalogEntry, endpointFor, OpenStackClient } from "../core/OpenStackClient";
import { HttpRequest, HttpResponse, tlsSettingsFor } from "../core/httpTransport";
import { CLIExecutor } from "../core/CLIExecutor";
import { ApiError, ServiceUnavailableError, extractErrorMessage } from "../core/errors";
import { CloudConfig } from "../config/types";

const CATALOG: CatalogEntry[] = [
  {
    type: "compute",
    endpoints: [
      { interface: "public", region_id: "RegionOne", url: "https://nova.example.com/v2.1/" },
      { interface: "internal", region_id: "RegionOne", url: "http://nova.internal:8774/v2.1" },
      { interface: "public", region_id: "RegionTwo", url: "https://nova2.example.com/v2.1" },
    ],
  },
  { type: "network", endpoints: [{ interface: "public", region_id: "RegionOne", url: "https://neutron.example.com" }] },
  { type: "image", endpoints: [{ interface: "public", region_id: "RegionOne", url: "https://glance.example.com/" }] },
  {
    type: "load-balancer",
    endpoints: [{ interface: "public", region_id: "RegionOne", url: "https://octavia.example.com" }],
  },
];

const CONFIG: CloudConfig = {
  name: "test-cloud",
  auth_type: "v3applicationcredential",
  auth: {
    auth_url: "https://keystone.example.com:5000",
    application_credential_id: "fake-cred-id",
    application_credential_secret: "fake-cred-secret",
  },
  region_name: "RegionOne",
  interface: "public",
  identity_api_version: 3,
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): HttpResponse {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    statusText: "",
    headers: { "content-type": "application/json", ...lower },
    text: JSON.stringify(body),
  };
}

function tokenResponse(token = "tok-1"): HttpResponse {
  return jsonResponse(
    {
      token: { expires_at: new Date(Date.now() + 3600_000).toISOString(), project: { id: "proj-1" }, catalog: CATALOG },
    },
    201,
    { "X-Subject-Token": token },
  );
}

/** Mocked HTTP transport: receives the request, returns an HttpResponse. */
const fetchMock = jest.fn<Promise<HttpResponse>, [HttpRequest]>();

function createClient(config: CloudConfig | null = CONFIG, cli?: Partial<CLIExecutor>) {
  return new OpenStackClient(
    "test-cloud",
    async () => config,
    (cli ?? {}) as CLIExecutor,
    () => fetchMock,
  );
}

describe("endpointFor", () => {
  it("picks the endpoint matching interface and region and trims trailing slashes", () => {
    expect(endpointFor(CATALOG, "compute", CONFIG)).toBe("https://nova.example.com/v2.1");
    expect(endpointFor(CATALOG, "compute", { ...CONFIG, region_name: "RegionTwo" })).toBe(
      "https://nova2.example.com/v2.1",
    );
    expect(endpointFor(CATALOG, "compute", { ...CONFIG, interface: "internal" })).toBe(
      "http://nova.internal:8774/v2.1",
    );
  });

  it("appends the API version to unversioned endpoints", () => {
    expect(endpointFor(CATALOG, "network", CONFIG)).toBe("https://neutron.example.com/v2.0");
    expect(endpointFor(CATALOG, "image", CONFIG)).toBe("https://glance.example.com/v2");
    expect(endpointFor(CATALOG, "load-balancer", CONFIG)).toBe("https://octavia.example.com/v2");
  });

  it("throws ServiceUnavailableError when the service is not in the catalog", () => {
    expect(() => endpointFor(CATALOG, "container-infra", CONFIG)).toThrow(ServiceUnavailableError);
  });
});

describe("buildNextPath", () => {
  it("keeps the original path and carries over params missing from the next link", () => {
    const next = buildNextPath(
      "/servers/detail?all_tenants=1",
      "http://internal-host:8774/v2.1/servers/detail?limit=1000&marker=abc",
    );
    expect(next).toBe("/servers/detail?limit=1000&marker=abc&all_tenants=1");
  });

  it("handles Glance-style relative next links", () => {
    expect(buildNextPath("/images?limit=1000", "/v2/images?marker=img-9&limit=1000")).toBe(
      "/images?marker=img-9&limit=1000",
    );
  });

  it("preserves repeated query params", () => {
    expect(buildNextPath("/security-groups?fields=id&fields=name", "/v2.0/security-groups?marker=m1")).toBe(
      "/security-groups?marker=m1&fields=id&fields=name",
    );
  });

  it("returns null when there is no next link or no marker", () => {
    expect(buildNextPath("/servers/detail", null)).toBeNull();
    expect(buildNextPath("/servers/detail", "/servers/detail?limit=10")).toBeNull();
  });
});

describe("extractErrorMessage", () => {
  it("extracts messages from each service's error envelope", () => {
    expect(extractErrorMessage('{"itemNotFound": {"message": "Instance not found", "code": 404}}')).toBe(
      "Instance not found",
    );
    expect(extractErrorMessage('{"NeutronError": {"type": "X", "message": "Network not found"}}')).toBe(
      "Network not found",
    );
    expect(extractErrorMessage('{"faultcode": "Client", "faultstring": "Load Balancer not found"}')).toBe(
      "Load Balancer not found",
    );
    expect(extractErrorMessage('{"errors": [{"title": "Not Found", "detail": "Cluster missing"}]}')).toBe(
      "Cluster missing",
    );
    expect(extractErrorMessage("<html><body><h1>503 Service Unavailable</h1></body></html>")).toBe(
      "503 Service Unavailable",
    );
  });
});

describe("OpenStackClient", () => {
  beforeEach(() => fetchMock.mockReset());

  it("authenticates with the application credential once and reuses the token", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({ servers: [{ id: "s1" }] }))
      .mockResolvedValueOnce(jsonResponse({ flavors: [] }));

    const client = createClient();
    await client.request("compute", "/servers/detail");
    await client.request("compute", "/flavors/detail");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [auth] = fetchMock.mock.calls[0];
    expect(auth.url).toBe("https://keystone.example.com:5000/v3/auth/tokens");
    expect(JSON.parse(auth.body ?? "").auth.identity.application_credential).toEqual({
      id: "fake-cred-id",
      secret: "fake-cred-secret",
    });

    const [call] = fetchMock.mock.calls[1];
    expect(call.url).toBe("https://nova.example.com/v2.1/servers/detail");
    expect(call.headers["X-Auth-Token"]).toBe("tok-1");
    expect(call.headers["OpenStack-API-Version"]).toBe("compute 2.47");
  });

  it("shares a single authentication between concurrent requests", async () => {
    fetchMock.mockImplementation(async ({ url }) =>
      url.endsWith("/auth/tokens") ? tokenResponse() : jsonResponse({ ok: true }),
    );

    const client = createClient();
    await Promise.all([
      client.request("compute", "/a"),
      client.request("network", "/b"),
      client.request("image", "/c"),
    ]);

    const authCalls = fetchMock.mock.calls.filter(([req]) => req.url.endsWith("/auth/tokens"));
    expect(authCalls).toHaveLength(1);
  });

  it("re-authenticates once on 401 and retries the request", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse("tok-old"))
      .mockResolvedValueOnce(jsonResponse({ error: { message: "expired" } }, 401))
      .mockResolvedValueOnce(tokenResponse("tok-new"))
      .mockResolvedValueOnce(jsonResponse({ networks: [] }));

    const client = createClient();
    await expect(client.request("network", "/networks")).resolves.toEqual({ networks: [] });
    expect(fetchMock.mock.calls[3][0].headers["X-Auth-Token"]).toBe("tok-new");
  });

  it("throws ApiError with the service's error message", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({ forbidden: { message: "Policy doesn't allow", code: 403 } }, 403));

    const client = createClient();
    const error = await client
      .request<never>("compute", "/servers/detail?all_tenants=1")
      .catch((e: unknown) => e as ApiError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
    expect(error.message).toContain("Policy doesn't allow");
    expect(error.message).not.toContain("all_tenants");
  });

  it("follows pagination links across pages", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        jsonResponse({
          servers: [{ id: "s1" }, { id: "s2" }],
          servers_links: [{ rel: "next", href: "http://internal/v2.1/servers/detail?marker=s2" }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ servers: [{ id: "s3" }] }));

    const client = createClient();
    const servers = await client.listAll<{ id: string }>("compute", "/servers/detail?all_tenants=1", "servers");

    expect(servers.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(fetchMock.mock.calls[2][0].url).toBe("https://nova.example.com/v2.1/servers/detail?marker=s2&all_tenants=1");
  });

  it("falls back to the CLI for auth types without native support", async () => {
    const cli = {
      run: jest.fn(async (args: string[]) =>
        args[0] === "token"
          ? { id: "cli-token", expires: new Date(Date.now() + 3600_000).toISOString(), project_id: "proj-2" }
          : CATALOG,
      ),
    };
    fetchMock.mockResolvedValueOnce(jsonResponse({ loadbalancers: [] }));

    const client = createClient(null, cli as unknown as CLIExecutor);
    await client.request("load-balancer", "/lbaas/loadbalancers");

    expect(cli.run).toHaveBeenCalledWith(["token", "issue"]);
    expect(cli.run).toHaveBeenCalledWith(["catalog", "list"]);
    expect(fetchMock.mock.calls[0][0].url).toBe("https://octavia.example.com/v2/lbaas/loadbalancers");
    expect(fetchMock.mock.calls[0][0].headers["X-Auth-Token"]).toBe("cli-token");
    await expect(client.getCurrentProjectId()).resolves.toBe("proj-2");
  });

  it("reports authentication failures without leaking the credential secret", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { message: "The request you have made requires authentication." } }, 401),
    );

    const client = createClient();
    const error = await client.request<never>("compute", "/servers/detail").catch((e: unknown) => e as ApiError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toContain("Authentication failed for 'test-cloud'");
    expect(error.message).not.toContain("fake-cred-secret");
  });
});

describe("OpenStackClient hardening", () => {
  beforeEach(() => fetchMock.mockReset());

  it("re-authenticates only once when parallel requests hit 401 with the same token", async () => {
    let tokenCount = 0;
    fetchMock.mockImplementation(async ({ url, headers }) => {
      if (url.endsWith("/auth/tokens")) return tokenResponse(`tok-${++tokenCount}`);
      return headers["X-Auth-Token"] === "tok-1"
        ? jsonResponse({ error: { message: "expired" } }, 401)
        : jsonResponse({ ok: true });
    });

    const client = createClient();
    await Promise.all([
      client.request("compute", "/a"),
      client.request("network", "/b"),
      client.request("image", "/c"),
    ]);

    // One initial login (tok-1, rejected) + exactly one shared re-login (tok-2)
    const authCalls = fetchMock.mock.calls.filter(([req]) => req.url.endsWith("/auth/tokens"));
    expect(authCalls).toHaveLength(2);
    expect(tokenCount).toBe(2);
  });

  it("treats a redirect as an error instead of following it with the token", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce({
      status: 302,
      statusText: "Found",
      headers: { location: "http://elsewhere/" },
      text: "",
    });

    const error = await createClient()
      .request<never>("compute", "/servers/detail")
      .catch((e: unknown) => e as ApiError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(302);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("explains how to fix untrusted certificates", async () => {
    const tlsError = Object.assign(new Error("self-signed certificate"), { code: "DEPTH_ZERO_SELF_SIGNED_CERT" });
    fetchMock.mockRejectedValueOnce(tlsError);

    const error = await createClient()
      .request<never>("compute", "/servers/detail")
      .catch((e: unknown) => e as ApiError);
    expect(error.message).toContain("self-signed certificate");
    expect(error.message).toContain("cacert");
  });

  it("builds the transport from the cloud's TLS settings", async () => {
    const factory = jest.fn(() => fetchMock);
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse({}));

    const client = new OpenStackClient("c", async () => ({ ...CONFIG, verify: false }), {} as CLIExecutor, factory);
    await client.request("compute", "/x");

    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith({ verify: false });
  });

  it("treats a page without the list key as an error instead of an empty list", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse({ unexpected: true }));

    await expect(createClient().listAll("compute", "/servers/detail", "servers")).rejects.toThrow(
      "response has no 'servers' list",
    );
  });

  it("stops when a next link repeats the current page", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockImplementation(async () =>
        jsonResponse({ servers: [{ id: "s1" }], servers_links: [{ rel: "next", href: "/servers/detail?marker=s1" }] }),
      );

    const servers = await createClient().listAll("compute", "/servers/detail", "servers");
    expect(servers).toHaveLength(2);
  });
});

describe("tlsSettingsFor", () => {
  it("verifies by default", () => {
    expect(tlsSettingsFor(null)).toEqual({ verify: true });
    expect(tlsSettingsFor(CONFIG)).toEqual({ verify: true });
  });

  it("honours insecure and verify: false like openstacksdk", () => {
    expect(tlsSettingsFor({ ...CONFIG, insecure: true })).toEqual({ verify: false });
    expect(tlsSettingsFor({ ...CONFIG, insecure: "True" })).toEqual({ verify: false });
    expect(tlsSettingsFor({ ...CONFIG, verify: false })).toEqual({ verify: false });
    expect(tlsSettingsFor({ ...CONFIG, insecure: false })).toEqual({ verify: true });
  });

  it("uses cacert, or verify given as a path, as an extra CA bundle", () => {
    expect(tlsSettingsFor({ ...CONFIG, cacert: "~/ca.pem" })).toEqual({ verify: true, caFile: "~/ca.pem" });
    expect(tlsSettingsFor({ ...CONFIG, verify: "/etc/ssl/ca.pem" })).toEqual({
      verify: true,
      caFile: "/etc/ssl/ca.pem",
    });
  });

  it("ignores cacert when verification is disabled", () => {
    expect(tlsSettingsFor({ ...CONFIG, insecure: true, cacert: "~/ca.pem" })).toEqual({ verify: false });
  });
});
