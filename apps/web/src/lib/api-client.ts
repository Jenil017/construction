import { type ApiResponse, ERROR_CODES } from "@construction-erp/shared";
import { siteStore, tokenStore } from "./auth/token-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

/** Thrown when the API returns the standard error envelope. */
export class ApiError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

export interface ApiFetchOptions extends RequestInit {
  /** Skip the Authorization header and the auto-refresh retry (login/refresh/logout). */
  skipAuth?: boolean;
  /**
   * Send an `Idempotency-Key` header so the backend treats this as exactly-once
   * (for payments, salary generation, stock movements, purchases, exports). A key
   * is generated per call and stays stable across the internal token-refresh
   * retry, so a retried request is not applied twice.
   */
  idempotent?: boolean;
  /** Override the generated idempotency key (rarely needed). */
  idempotencyKey?: string;
}

// Single-flight refresh: concurrent 401s share one refresh attempt.
let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  const attempt = (async () => {
    const refreshToken = tokenStore.getRefresh();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      const json = (await res.json()) as ApiResponse<{ accessToken: string; refreshToken: string }>;
      if (!json.success) return false;
      tokenStore.set(json.data.accessToken, json.data.refreshToken);
      return true;
    } catch {
      return false;
    }
  })();
  refreshInFlight = attempt;
  attempt.finally(() => {
    if (refreshInFlight === attempt) refreshInFlight = null;
  });
  return attempt;
}

function redirectToLogin(): void {
  tokenStore.clear();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

async function request<T>(path: string, options: ApiFetchOptions, retry: boolean): Promise<T> {
  const { skipAuth, headers, ...init } = options;
  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string>),
  };
  if (!skipAuth) {
    const token = tokenStore.getAccess();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
    // Scope every authed request to the active site.
    const siteId = siteStore.get();
    if (siteId) finalHeaders["X-Site-Id"] = siteId;
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers: finalHeaders });
  const json = (await res.json()) as ApiResponse<T>;

  if (!json.success) {
    if (!skipAuth && retry && json.error.code === ERROR_CODES.TOKEN_EXPIRED) {
      if (await tryRefresh()) return request<T>(path, options, false);
      redirectToLogin();
    }
    // The active site was revoked/removed mid-session: drop it and reload so the
    // app re-fetches /auth/me and picks a site the user can still access.
    if (json.error.code === ERROR_CODES.SITE_ACCESS_REVOKED) {
      siteStore.clear();
      if (typeof window !== "undefined") window.location.reload();
    }
    throw new ApiError(json.error.code, json.error.message, json.error.details);
  }
  return json.data;
}

/**
 * Typed fetch wrapper. Attaches the Bearer token, unwraps the success envelope,
 * and on an expired access token transparently refreshes once and retries. Module
 * hooks (useUsers, useRoles, …) call this rather than fetching inline.
 */
export function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { idempotent, idempotencyKey, ...rest } = options;
  if (idempotent) {
    // Generate the key once here so the refresh-retry reuses it (exactly-once).
    const key = idempotencyKey ?? crypto.randomUUID();
    rest.headers = { ...(rest.headers as Record<string, string>), "Idempotency-Key": key };
  }
  return request<T>(path, rest, true);
}
