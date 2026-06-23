"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { Check, ChevronsUpDown, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Active-site selector in the top bar. Shows the current site; for users with
 * more than one accessible site, opens a dropdown to switch. Switching re-scopes
 * all data (the auth context clears the query cache).
 */
export function SiteSwitcher() {
  const { user, activeSite, switchSite } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!user || !activeSite) return null;
  const sites = user.sites;
  const multi = sites.length > 1;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => multi && setOpen((o) => !o)}
        aria-haspopup={multi}
        aria-expanded={open}
        className="flex min-h-10 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-hover disabled:cursor-default disabled:hover:bg-transparent"
        disabled={!multi}
      >
        <MapPin className="size-4 shrink-0 text-sidebar-muted" />
        <span className="max-w-[30vw] truncate font-medium sm:max-w-[9rem]">{activeSite.name}</span>
        {multi ? <ChevronsUpDown className="size-4 text-sidebar-muted" /> : null}
      </button>

      {open && multi ? (
        <div className="absolute left-0 z-40 mt-1 w-56 max-w-[calc(100vw-1rem)] rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Switch site
          </p>
          {sites.map((site) => (
            <button
              key={site.id}
              type="button"
              onClick={() => {
                switchSite(site.id);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-2.5 text-sm transition-colors hover:bg-accent"
            >
              <span className="flex min-w-0 flex-col text-left">
                <span className="truncate">{site.name}</span>
                <span className="truncate text-xs text-muted-foreground capitalize">
                  {site.role}
                </span>
              </span>
              {site.id === activeSite.id ? <Check className="size-4 text-primary" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
