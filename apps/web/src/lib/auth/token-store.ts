/**
 * Token storage. Per the chosen split-domain model (web on Vercel, API on
 * Workers), the access token lives in localStorage and is sent as a Bearer
 * header; the refresh token also lives here and is sent in the refresh request
 * body. The database remains the source of truth for refresh-token validity
 * (rotation + reuse detection). Hardening against XSS is a Phase 9 task.
 */
const ACCESS_KEY = "erp.accessToken";
const REFRESH_KEY = "erp.refreshToken";

const isBrowser = () => typeof window !== "undefined";

export const tokenStore = {
  getAccess(): string | null {
    return isBrowser() ? window.localStorage.getItem(ACCESS_KEY) : null;
  },
  getRefresh(): string | null {
    return isBrowser() ? window.localStorage.getItem(REFRESH_KEY) : null;
  },
  set(accessToken: string, refreshToken: string): void {
    if (!isBrowser()) return;
    window.localStorage.setItem(ACCESS_KEY, accessToken);
    window.localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear(): void {
    if (!isBrowser()) return;
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
  },
};
