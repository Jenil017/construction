"use client";

import { apiFetch } from "@/lib/api-client";
import type { Permission, RbacAction, RbacModule } from "@construction-erp/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { siteStore, tokenStore } from "./token-store";

export interface SiteEntry {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  status: string;
  role: "owner" | "member";
  permissions: Permission[];
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  /** May create and manage sites. */
  isAppOwner: boolean;
  /** Sites the user can access (drives the switcher and permission gating). */
  sites: SiteEntry[];
}

interface Session {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** The currently selected site; null while loading or if the user has none. */
  activeSite: SiteEntry | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchSite: (siteId: string) => void;
  /** Permission gate for the active site (backend still enforces). */
  can: (module: RbacModule, action: RbacAction) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Pick a default site: the remembered one if still accessible, else the first. */
function pickDefaultSite(sites: SiteEntry[]): SiteEntry | null {
  if (sites.length === 0) return null;
  const saved = siteStore.get();
  return sites.find((s) => s.id === saved) ?? sites[0] ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeSite, setActiveSite] = useState<SiteEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applySession = useCallback((u: AuthUser) => {
    setUser(u);
    const site = pickDefaultSite(u.sites);
    setActiveSite(site);
    if (site) siteStore.set(site.id);
    else siteStore.clear();
  }, []);

  // Restore the session on load from the stored access token.
  useEffect(() => {
    let active = true;
    if (!tokenStore.getAccess()) {
      setIsLoading(false);
      return;
    }
    apiFetch<AuthUser>("/auth/me")
      .then((u) => {
        if (active) applySession(u);
      })
      .catch(() => {
        tokenStore.clear();
        if (active) {
          setUser(null);
          setActiveSite(null);
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applySession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await apiFetch<Session>("/auth/login", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({ email, password }),
      });
      tokenStore.set(session.accessToken, session.refreshToken);
      applySession(session.user);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    const refreshToken = tokenStore.getRefresh();
    try {
      if (refreshToken) {
        await apiFetch("/auth/logout", {
          method: "POST",
          skipAuth: true,
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch {
      // Best-effort: clear locally regardless of the network result.
    }
    tokenStore.clear();
    setUser(null);
    setActiveSite(null);
    queryClient.clear();
  }, [queryClient]);

  const switchSite = useCallback(
    (siteId: string) => {
      const site = user?.sites.find((s) => s.id === siteId);
      if (!site || site.id === activeSite?.id) return;
      siteStore.set(site.id);
      setActiveSite(site);
      // Drop all cached data — it belonged to the previous site.
      queryClient.clear();
    },
    [user, activeSite, queryClient],
  );

  const can = useCallback(
    (module: RbacModule, action: RbacAction) => {
      if (!activeSite) return false;
      if (activeSite.role === "owner") return true;
      return activeSite.permissions.some((p) => p.module === module && p.action === action);
    },
    [activeSite],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, activeSite, isLoading, login, logout, switchSite, can }),
    [user, activeSite, isLoading, login, logout, switchSite, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
