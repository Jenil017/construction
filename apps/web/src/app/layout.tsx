import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// UI typeface: Hanken Grotesk — a warm, highly legible grotesk with character,
// chosen over generic system/Inter stacks. Numerals use IBM Plex Mono for crisp,
// aligned figures in tables, amounts, and KPIs.
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Construction ERP",
  description: "Site tracking, inventory, DPR, attendance, salary, and reports in one platform.",
  applicationName: "Construction ERP",
  // Lets iOS Safari launch the home-screen shortcut as a standalone app.
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Construction ERP" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#101b2e",
  width: "device-width",
  initialScale: 1,
  // Allow the app shell to extend under iOS notches/home indicator in standalone.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${mono.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
