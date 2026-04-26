// Base path the app is mounted under. Mirrors `basePath` in next.config.ts so
// runtime fetches to public assets (e.g. /palette.csv, /items/*.png) work
// when the app is hosted under a subpath like /artmapify.
//
// Next.js exposes the configured basePath via NEXT_PUBLIC_BASE_PATH at build
// time. Empty string means "served from the domain root".
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefix a root-relative public asset path with the app's basePath. */
export function withBasePath(path: string): string {
  if (!path.startsWith("/")) return path;
  return `${BASE_PATH}${path}`;
}
