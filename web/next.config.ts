import type { NextConfig } from "next";
import path from "node:path";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  basePath,
  // Pin Turbopack's root to the monorepo root (the only place a
  // package-lock.json should live). This silences Next's "multiple
  // lockfiles" warning and lets it walk up to find @artmapify/core.
  
  // Module resolution still works because Next walks node_modules
  // upward from web/, finding both web/node_modules/tailwindcss and
  // root node_modules/@artmapify/core.
  turbopack: {
    root: path.join(__dirname, ".."),
  },
  transpilePackages: ["@artmapify/core"],
};

export default nextConfig;
