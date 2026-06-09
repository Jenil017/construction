"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils";
import { HardHat, MapPinOff, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_ITEMS, type NavItem, SETTINGS_ITEMS } from "./nav-items";
import { SiteSwitcher } from "./site-switcher";
import { UserMenu } from "./user-menu";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Responsive app shell: static navy sidebar on desktop (md+); a hamburger-driven
 * slide-in drawer on mobile. Nav is filtered by the user's permissions (the
 * backend still enforces access).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { can, user, activeSite } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const mainItems = NAV_ITEMS.filter((i) => can(i.module, i.action));
  const settingsItems = SETTINGS_ITEMS.filter(
    (i) => (!i.ownerOnly || user?.isAppOwner) && can(i.module, i.action),
  );

  // Close the drawer when the route changes (pathname is the intended trigger).
  // biome-ignore lint/correctness/useExhaustiveDependencies: run on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll and allow Escape to close while the drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const renderLink = (item: NavItem, onNavigate?: () => void) => {
    const active = isActive(pathname, item.href);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            active
              ? "bg-sidebar-hover/70 font-semibold text-white before:absolute before:top-2 before:bottom-2 before:left-0 before:w-1 before:rounded-full before:bg-sidebar-active before:content-['']"
              : "font-medium text-sidebar-muted hover:bg-sidebar-hover/50 hover:text-sidebar-foreground",
          )}
        >
          <item.icon
            className={cn(
              "size-[1.05rem] shrink-0 transition-colors",
              active
                ? "text-sidebar-active"
                : "text-sidebar-muted group-hover:text-sidebar-foreground",
            )}
          />
          {item.label}
        </Link>
      </li>
    );
  };

  const navContent = (onNavigate?: () => void) => (
    <>
      <ul className="space-y-1">{mainItems.map((i) => renderLink(i, onNavigate))}</ul>
      {settingsItems.length > 0 ? (
        <>
          <p className="mt-5 mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
            Settings
          </p>
          <ul className="space-y-1">{settingsItems.map((i) => renderLink(i, onNavigate))}</ul>
        </>
      ) : null}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-white/5 bg-sidebar px-2 text-sidebar-foreground sm:px-4">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          className="rounded-md p-2 text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground md:hidden"
        >
          <Menu className="size-5" />
        </button>

        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 px-1 font-semibold tracking-tight text-sidebar-foreground"
        >
          <span className="flex size-7 items-center justify-center rounded-md bg-accent-solid text-[#101b2e] shadow-sm">
            <HardHat className="size-4" />
          </span>
          <span className="hidden sm:inline">Construction ERP</span>
        </Link>

        <div className="mx-1 h-6 w-px bg-sidebar-hover" />
        <SiteSwitcher />

        <div className="ml-auto">
          <UserMenu />
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-white/5 bg-[linear-gradient(180deg,#13223b_0%,#0e1828_100%)] p-3 md:block">
          {navContent()}
        </aside>

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1400px] animate-rise-in">
            {activeSite ? (
              children
            ) : (
              <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <MapPinOff className="size-8" />
                <p className="text-sm">
                  You haven't been assigned to any site yet.
                  <br />
                  Please contact your administrator.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Mobile drawer (slide-in) */}
      <div
        className={cn(
          "fixed inset-0 z-40 md:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
          className={cn(
            "absolute inset-0 cursor-default bg-foreground/40 backdrop-blur-sm transition-opacity duration-200",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <aside
          className={cn(
            "absolute top-0 left-0 flex h-full w-72 max-w-[82%] flex-col overflow-y-auto bg-[linear-gradient(180deg,#13223b_0%,#0e1828_100%)] p-3 shadow-xl transition-transform duration-200 ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="mb-3 flex items-center justify-between px-1">
            <span className="flex items-center gap-2.5 font-semibold tracking-tight text-sidebar-foreground">
              <span className="flex size-7 items-center justify-center rounded-md bg-accent-solid text-[#101b2e] shadow-sm">
                <HardHat className="size-4" />
              </span>
              Construction ERP
            </span>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="rounded-md p-1.5 text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground"
            >
              <X className="size-5" />
            </button>
          </div>
          {navContent(() => setMobileOpen(false))}
        </aside>
      </div>
    </div>
  );
}
