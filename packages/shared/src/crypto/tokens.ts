/**
 * Opaque refresh-token helpers (Web Crypto, isomorphic, server-only usage).
 *
 * Refresh tokens are random opaque strings — never JWTs. The raw token goes to
 * the client; only its SHA-256 hash is stored in the database, so a DB leak
 * cannot be replayed. See docs/architecter.md "Authentication Flow".
 */

const TOKEN_BYTES = 32;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/** Generate a cryptographically random, URL-safe opaque token. */
export function generateOpaqueToken(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

/** SHA-256 hex digest — used to store/lookup refresh tokens without the raw value. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return bytesToHex(new Uint8Array(digest));
}
