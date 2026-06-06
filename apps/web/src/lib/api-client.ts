import { type ApiResponse, ERROR_CODES } from "@construction-erp/shared";
import { tokenStore } from "./auth/token-store";

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
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers: finalHeaders });
  const json = (await res.json()) as ApiResponse<T>;

  if (!json.success) {
    if (!skipAuth && retry && json.error.code === ERROR_CODES.TOKEN_EXPIRED) {
      if (await tryRefresh()) return request<T>(path, options, false);
      redirectToLogin();
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
  return request<T>(path, options, true);
}
