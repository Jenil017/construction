"use client";

import { type BeforeInstallPromptEvent, installStore } from "@/lib/pwa/install-store";
import { useEffect } from "react";

/**
 * App-wide PWA wiring (renders nothing). Mounted once near the root so it's
 * active on every route:
 *   1. Captures `beforeinstallprompt` as early as possible and stashes it in the
 *      install store — the install banner (only on /login) reads it from there.
 *   2. Registers the service worker (production only — a caching SW under `next
 *      dev` fights HMR). PWA install therefore needs a production build.
 */
export function PwaProvider() {
  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      // Stop Chrome's mini-infobar; we show our own banner on the login screen.
      event.preventDefault();
      installStore.set(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => installStore.set(null);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      const register = () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {
          // Registration failures are non-fatal — the app works without the SW.
        });
      };
      if (document.readyState === "complete") register();
      else window.addEventListener("load", register, { once: true });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return null;
}
