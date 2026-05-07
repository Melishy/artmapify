import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Strip the extension from a path/filename and slugify what's left so the
 * result is safe to embed in a download filename. Returns the fallback
 * (default empty string) when the input is empty or fully stripped.
 */
export function fileBaseName(path: string, fallback = ""): string {
  const noExt = path.replace(/\.[^.]+$/, "");
  return noExt.replace(/[^a-z0-9_-]+/gi, "_") || fallback;
}
