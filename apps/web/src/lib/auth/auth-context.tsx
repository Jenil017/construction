"use client";

import { apiFetch } from "@/lib/api-client";
import type { Permission, RbacAction, RbacModule } from "@construction-erp/shared";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { tokenStore } from "./token-store";

export interface AuthRole {
  id: string;
  slug: string;
  name: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  companyId: string;
  roles: AuthRole[];
  permissions: Permission[];
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
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Permission-based gate used to show/hide nav and actions (backend still enforces). */
  can: (module: RbacModule, action: RbacAction) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore the session on load from the stored access token.
  useEffect(() => {
    let active = true;
    if (!tokenStore.getAccess()) {
      setIsLoading(false);
      return;
    }
    apiFetch<AuthUser>("/auth/me")
      .then((u) => {
        if (active) setUser(u);
      })
      .catch(() => {
        tokenStore.clear();
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await apiFetch<Session>("/auth/login", {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify({ email, password }),
    });
    tokenStore.set(session.accessToken, session.refreshToken);
    setUser(session.user);
  }, []);

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
  }, []);

  const can = useCallback(
    (module: RbacModule, action: RbacAction) =>
      !!user?.permissions.some((p) => p.module === module && p.action === action),
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, login, logout, can }),
    [user, isLoading, login, logout, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
