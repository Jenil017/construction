import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Shared workspace package ships TypeScript source; let Next transpile it.
  transpilePackages: ["@construction-erp/shared"],
};

export default nextConfig;
