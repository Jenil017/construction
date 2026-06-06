"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils";
import { HardHat } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, type NavItem, SETTINGS_ITEMS } from "./nav-items";
import { UserMenu } from "./user-menu";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Responsive app shell: navy sidebar on desktop, scrollable top nav on mobile.
 * Nav is filtered by the user's permissions (the backend still enforces access).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { can } = useAuth();

  const mainItems = NAV_ITEMS.filter((i) => can(i.module, i.action));
  const settingsItems = SETTINGS_ITEMS.filter((i) => can(i.module, i.action));
  const mobileItems = [...mainItems, ...settingsItems];

  const sidebarLink = (item: NavItem) => {
    const active = isActive(pathname, item.href);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            active
              ? "bg-sidebar-hover text-sidebar-foreground"
              : "text-sidebar-muted hover:bg-sidebar-hover/60 hover:text-sidebar-foreground",
          )}
        >
          <item.icon className="size-4 shrink-0" />
          {item.label}
        </Link>
      </li>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card px-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-md bg-sidebar text-sidebar-foreground">
            <HardHat className="size-4" />
          </span>
          <span className="hidden sm:inline">Construction ERP</span>
        </Link>
        <div className="ml-auto">
          <UserMenu />
        </div>
      </header>

      {/* Mobile nav */}
      <nav className="flex gap-1 overflow-x-auto border-b bg-card px-2 py-2 md:hidden">
        {mobileItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto bg-sidebar p-3 md:block">
          <ul className="space-y-1">{mainItems.map(sidebarLink)}</ul>
          {settingsItems.length > 0 ? (
            <>
              <p className="mt-5 mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
                Settings
              </p>
              <ul className="space-y-1">{settingsItems.map(sidebarLink)}</ul>
            </>
          ) : null}
        </aside>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
