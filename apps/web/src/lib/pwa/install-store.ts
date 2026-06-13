"use client";

/**
 * A tiny external store for the deferred `beforeinstallprompt` event.
 *
 * That event can fire once, early, and anywhere in the app — but our install
 * banner only renders on /login. Capturing it globally (see `PwaProvider`) and
 * stashing it here lets the banner consume it via `useSyncExternalStore`, even
 * if the event fired before the banner mounted.
 */

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt: () => Promise<void>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export const installStore = {
  set(event: BeforeInstallPromptEvent | null): void {
    deferredPrompt = event;
    emit();
  },
  get(): BeforeInstallPromptEvent | null {
    return deferredPrompt;
  },
  subscribe(callback: () => void): () => void {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },
};

/** True when the app is already running as an installed PWA (so hide the prompt). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const displayStandalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  // iOS Safari exposes navigator.standalone instead of the display-mode media query.
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayStandalone || iosStandalone;
}

/** iOS/iPadOS Safari, which has no `beforeinstallprompt` — needs manual instructions. */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIPhone = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ reports a Mac UA; distinguish it by touch support.
  const isIPadOS =
    /Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document;
  return isIPhone || isIPadOS;
}
