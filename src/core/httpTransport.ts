import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as os from "os";
import * as tls from "tls";
import { CloudConfig } from "../config/types";

export interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  /** Lower-cased header names, as delivered by Node. */
  headers: Record<string, string | string[] | undefined>;
  text: string;
}

export type Transport = (request: HttpRequest) => Promise<HttpResponse>;

export interface TlsSettings {
  /** false = do not verify the server certificate (clouds.yaml `insecure: true` / `verify: false`). */
  verify: boolean;
  /** Extra CA bundle (clouds.yaml `cacert`, or `verify: <path>`). */
  caFile?: string;
}

export class HttpTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`timed out after ${timeoutMs / 1000}s`);
    this.name = "TimeoutError";
  }
}

function isTrue(value: unknown): boolean {
  return value === true || (typeof value === "string" && ["true", "yes", "1"].includes(value.toLowerCase()));
}

function isFalse(value: unknown): boolean {
  return value === false || (typeof value === "string" && ["false", "no", "0"].includes(value.toLowerCase()));
}

/**
 * Resolves TLS settings from a clouds.yaml entry the same way openstacksdk
 * does: `insecure: true` or `verify: false` disable verification; otherwise
 * `cacert` (or `verify: <path>`) adds a CA bundle on top of the default roots.
 */
export function tlsSettingsFor(config?: CloudConfig | null): TlsSettings {
  if (!config) return { verify: true };
  if (isTrue(config.insecure) || isFalse(config.verify)) return { verify: false };
  const verifyPath = typeof config.verify === "string" && !isTrue(config.verify) ? config.verify : undefined;
  const caFile = config.cacert || verifyPath;
  return caFile ? { verify: true, caFile } : { verify: true };
}

function expandHome(filePath: string): string {
  return filePath.startsWith("~/") ? `${os.homedir()}${filePath.slice(1)}` : filePath;
}

/**
 * HTTP(S) transport on top of Node's `https` module (instead of `fetch`) so
 * per-cloud TLS settings from clouds.yaml can be honoured. Connections are
 * kept alive and reused. Redirects are never followed, so the auth token is
 * never forwarded to another location.
 */
export function createHttpTransport(settings: TlsSettings): Transport {
  const agent = new https.Agent({
    keepAlive: true,
    rejectUnauthorized: settings.verify,
    ...(settings.caFile
      ? { ca: [...tls.rootCertificates, fs.readFileSync(expandHome(settings.caFile), "utf-8")] }
      : {}),
  });

  return (request) =>
    new Promise<HttpResponse>((resolve, reject) => {
      const url = new URL(request.url);
      const isHttps = url.protocol === "https:";
      const req = (isHttps ? https : http).request(
        url,
        {
          method: request.method,
          headers: {
            ...request.headers,
            ...(request.body !== undefined ? { "Content-Length": Buffer.byteLength(request.body) } : {}),
          },
          ...(isHttps ? { agent } : {}),
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            clearTimeout(timer);
            resolve({
              status: res.statusCode ?? 0,
              statusText: res.statusMessage ?? "",
              headers: res.headers,
              text: Buffer.concat(chunks).toString("utf-8"),
            });
          });
          res.on("error", (error) => {
            clearTimeout(timer);
            reject(error);
          });
        },
      );

      const timer = setTimeout(() => req.destroy(new HttpTimeoutError(request.timeoutMs)), request.timeoutMs);
      req.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      if (request.body !== undefined) req.write(request.body);
      req.end();
    });
}
