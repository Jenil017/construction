"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { ChevronDown, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Top-bar account menu with sign-out (custom dropdown — no radix dependency). */
export function UserMenu() {
  const { user, activeSite, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!user) return null;

  const onSignOut = async () => {
    setOpen(false);
    await logout();
    router.replace("/login");
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-10 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-hover"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {initialsOf(user.name)}
        </span>
        <span className="hidden max-w-[10rem] truncate sm:inline">{user.name}</span>
        <ChevronDown className="size-4 text-sidebar-muted" />
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-1 w-60 max-w-[calc(100vw-1rem)] rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          <div className="px-2 py-1.5">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            {activeSite ? (
              <p className="mt-1 truncate text-xs text-muted-foreground capitalize">
                {activeSite.name} · {user.isAppOwner ? "owner" : activeSite.role}
              </p>
            ) : null}
          </div>
          <div className="my-1 border-t" />
          <button
            type="button"
            onClick={onSignOut}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-2.5 text-sm text-danger transition-colors hover:bg-accent"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
