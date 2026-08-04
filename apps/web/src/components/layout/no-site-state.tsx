"use client";

import { MapPin, MapPinOff } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Shown instead of a module page when there is no active site.
 *
 * Every business endpoint is site-scoped and rejects a request without an
 * `X-Site-Id` header, so rendering a module without a site produces a page of
 * failed requests and a bare "Select a site to continue." error. This replaces
 * that with the actual next step, and — because it renders *instead of* the
 * page — stops the doomed requests from being made at all.
 *
 * Two different dead ends, two different messages: an owner can fix it himself
 * by creating a site; a member cannot and has to be told whom to ask.
 */
export function NoSiteState({ isOwner }: { isOwner: boolean }) {
  const pathname = usePathname();
  // "…to start recording attendance" reads better than a generic line, and tells
  // the user the page they wanted still exists once a site does.
  const moduleLabel = MODULE_LABELS[pathname] ?? null;

  if (!isOwner) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <MapPinOff className="size-5" />
        </div>
        <div className="max-w-sm">
          <p className="text-base font-semibold">No site assigned</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You haven't been given access to a site yet. Ask your administrator to add you to one,
            then sign in again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <MapPin className="size-5" />
      </div>
      <div className="max-w-sm px-6">
        <p className="text-base font-semibold">Create your first site</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {moduleLabel
            ? `Everything in the app belongs to a site — add one to start ${moduleLabel}.`
            : "Everything in the app belongs to a site. Add your first one to get started."}
        </p>
      </div>
      <Link
        href="/sites"
        className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:h-10"
      >
        Go to Sites
      </Link>
    </div>
  );
}

/** Route → what the user was trying to do, for a message that fits the page. */
const MODULE_LABELS: Record<string, string> = {
  "/dpr": "filing daily progress reports",
  "/attendance": "marking attendance",
  "/salary": "managing salaries",
  "/inventory": "tracking materials",
  "/expenses": "recording expenses",
  "/purchases": "raising purchase orders",
  "/suppliers": "managing suppliers",
  "/invoices": "issuing invoices",
  "/selling": "recording sales",
  "/reports": "exporting reports",
  "/settings/users": "adding your team",
};
