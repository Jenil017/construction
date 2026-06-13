import type { MetadataRoute } from "next";

/**
 * Web app manifest (served at /manifest.webmanifest, auto-linked by Next). Makes
 * the ERP installable as a PWA. `start_url` is /login — the app's entry point;
 * an already-signed-in user is bounced straight to /dashboard from there. The
 * brand colours mirror the login screen (deep ink navy) so the splash/status bar
 * match the app shell.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Construction ERP",
    short_name: "Construction ERP",
    description: "Site tracking, inventory, DPR, attendance, salary, and reports in one platform.",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    background_color: "#101b2e",
    theme_color: "#101b2e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
