import { AwsClient } from "aws4fetch";
import type { Env } from "../../env";

/**
 * R2 file storage via the S3-compatible API. Files never proxy through the
 * Worker (see docs/architecter.md "File Upload Flow"): the client uploads
 * directly to R2 with a presigned PUT URL, and reads via a short-lived
 * presigned GET URL. Only the object key + metadata are stored in the DB.
 */
export interface R2Config {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Read R2 config from the environment, or null if it isn't configured yet. */
export function r2ConfigFromEnv(env: Env["Bindings"]): R2Config | null {
  const { R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = env;
  if (!R2_ACCOUNT_ID || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null;
  return {
    accountId: R2_ACCOUNT_ID,
    bucket: R2_BUCKET,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  };
}

function objectUrl(cfg: R2Config, key: string): string {
  const path = key
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${path}`;
}

function client(cfg: R2Config): AwsClient {
  return new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: "s3",
    region: "auto",
  });
}

/** Response header overrides baked into a presigned GET URL (S3 `response-*`). */
export interface GetResponseOverrides {
  /** e.g. `attachment; filename="report.csv"` to force a download. */
  contentDisposition?: string;
  contentType?: string;
}

async function presign(
  cfg: R2Config,
  key: string,
  method: "PUT" | "GET",
  expiresSec: number,
  overrides?: GetResponseOverrides,
): Promise<string> {
  const url = new URL(objectUrl(cfg, key));
  url.searchParams.set("X-Amz-Expires", String(expiresSec));
  if (overrides?.contentDisposition) {
    url.searchParams.set("response-content-disposition", overrides.contentDisposition);
  }
  if (overrides?.contentType) {
    url.searchParams.set("response-content-type", overrides.contentType);
  }
  const signed = await client(cfg).sign(url.toString(), {
    method,
    aws: { signQuery: true },
  });
  return signed.url;
}

/** Presigned PUT URL for a direct browser upload (short-lived). */
export function presignPutUrl(cfg: R2Config, key: string, expiresSec = 300): Promise<string> {
  return presign(cfg, key, "PUT", expiresSec);
}

/**
 * Presigned GET URL for displaying/downloading a stored object. Pass `overrides`
 * to force a download with a friendly filename (used by report exports).
 */
export function presignGetUrl(
  cfg: R2Config,
  key: string,
  expiresSec = 3600,
  overrides?: GetResponseOverrides,
): Promise<string> {
  return presign(cfg, key, "GET", expiresSec, overrides);
}

/**
 * Upload bytes to R2 from the Worker (server-side PUT). This is the one case
 * where bytes flow through the Worker rather than a direct browser upload — the
 * background report consumer generates the file in-isolate and stores it. User
 * file uploads still use the presigned-PUT flow (see docs/architecter.md).
 */
export async function putObject(
  cfg: R2Config,
  key: string,
  body: Uint8Array | ArrayBuffer | string,
  contentType: string,
): Promise<void> {
  const res = await client(cfg).fetch(objectUrl(cfg, key), {
    method: "PUT",
    body,
    headers: { "content-type": contentType },
  });
  if (!res.ok) {
    throw new Error(`R2 PUT failed (${res.status}) for ${key}`);
  }
}

/** Delete an object (server-side S3 DELETE; small/rare, so a direct call is fine). */
export async function deleteObject(cfg: R2Config, key: string): Promise<void> {
  await client(cfg).fetch(objectUrl(cfg, key), { method: "DELETE" });
}

/**
 * Fetch an object's bytes server-side (S3 GET). Returns null if the object is
 * missing or the read fails, so callers can degrade gracefully — e.g. skip a
 * single image when generating a PDF rather than failing the whole job. This is
 * the other case (besides {@link putObject}) where bytes flow through the Worker.
 */
export async function getObject(cfg: R2Config, key: string): Promise<Uint8Array | null> {
  try {
    const res = await client(cfg).fetch(objectUrl(cfg, key), { method: "GET" });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}
