"use client";

import { useEffect, useRef } from "react";

/**
 * Opens a create form when the page is reached with `?<param>=1` — used by the
 * dashboard Quick Actions for one-tap entry (fewer clicks before typing). Runs
 * once, then strips the param from the URL so a refresh doesn't reopen the form.
 */
export function useOpenOnParam(param: string, enabled: boolean, open: () => void): void {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current || !enabled || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get(param) === "1") {
      ran.current = true;
      open();
      url.searchParams.delete(param);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [param, enabled, open]);
}
