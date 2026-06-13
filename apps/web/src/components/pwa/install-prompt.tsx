"use client";

import { Button } from "@/components/ui/button";
import { installStore, isIOS, isStandalone } from "@/lib/pwa/install-store";
import { Download, HardHat, Share, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

const DISMISS_KEY = "erp.pwaInstallDismissed";

/**
 * Install-to-home-screen banner. Rendered ONLY on the login screen (mounted by
 * the login page) and fully responsive — a bottom sheet on phones, a compact
 * card on larger screens. Hidden when the app is already installed or the user
 * dismissed it this session. On Chromium it triggers the native install prompt;
 * on iOS Safari (no `beforeinstallprompt`) it shows the manual Share steps.
 */
export function InstallPrompt() {
  const deferred = useSyncExternalStore(installStore.subscribe, installStore.get, () => null);

  const [ready, setReady] = useState(false);
  const [ios, setIos] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [shown, setShown] = useState(false); // drives the slide-up transition

  useEffect(() => {
    setIos(isIOS());
    setStandalone(isStandalone());
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      // sessionStorage can throw in private mode — treat as not dismissed.
    }
    setReady(true);
  }, []);

  // Show for Chromium once we have the deferred prompt, or on iOS Safari always
  // (until installed/dismissed) since it can't be triggered programmatically.
  const canShow = ready && !standalone && !dismissed && (!!deferred || ios);

  useEffect(() => {
    if (!canShow) return;
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [canShow]);

  if (!canShow) return null;

  const dismiss = () => {
    setShown(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    // Let the slide-out play before unmounting.
    setTimeout(() => setDismissed(true), 200);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    installStore.set(null);
    if (choice.outcome === "accepted") setDismissed(true);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-3 sm:p-4">
      <div
        role="dialog"
        aria-label="Install Construction ERP"
        className={`w-full max-w-md rounded-2xl border bg-card p-4 shadow-2xl transition-all duration-200 ease-out ${
          shown ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        }`}
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-solid text-[#101b2e] shadow-sm">
            <HardHat className="size-6" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight">Install Construction ERP</p>
            {ios ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Tap the <Share className="inline size-3.5 -translate-y-px" aria-label="Share" />{" "}
                Share icon, then{" "}
                <span className="font-medium text-foreground">Add to Home Screen</span>.
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Add it to your home screen for one-tap access on site.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {!ios ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={dismiss} className="sm:w-auto">
              Not now
            </Button>
            <Button onClick={install} className="sm:w-auto">
              <Download className="size-4" />
              Install app
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
