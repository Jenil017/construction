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

async function presign(
  cfg: R2Config,
  key: string,
  method: "PUT" | "GET",
  expiresSec: number,
): Promise<string> {
  const url = new URL(objectUrl(cfg, key));
  url.searchParams.set("X-Amz-Expires", String(expiresSec));
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

/** Presigned GET URL for displaying/downloading a stored object. */
export function presignGetUrl(cfg: R2Config, key: string, expiresSec = 3600): Promise<string> {
  return presign(cfg, key, "GET", expiresSec);
}

/** Delete an object (server-side S3 DELETE; small/rare, so a direct call is fine). */
export async function deleteObject(cfg: R2Config, key: string): Promise<void> {
  await client(cfg).fetch(objectUrl(cfg, key), { method: "DELETE" });
}
