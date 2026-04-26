"use client";

import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";

interface Props {
  owner: string;
  repo: string;
  label?: string;
}

const CACHE_KEY_PREFIX = "gh-stars:";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CachedStars {
  count: number;
  fetchedAt: number;
}

export function GitHubStarButton({ owner, repo, label = "Star" }: Props) {
  const href = `https://github.com/${owner}/${repo}`;
  const cacheKey = `${CACHE_KEY_PREFIX}${owner}/${repo}`;
  // Read any fresh cached value during the initial render so we don't trigger
  // a second render just to display a value we already had.
  const [stars, setStars] = useState<number | null>(() => readCachedStars(cacheKey));

  useEffect(() => {
    if (stars !== null) return;
    let cancelled = false;
    fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data || typeof data.stargazers_count !== "number") {
          return;
        }
        const count = data.stargazers_count as number;
        setStars(count);
        try {
          sessionStorage.setItem(
            cacheKey,
            JSON.stringify({ count, fetchedAt: Date.now() } satisfies CachedStars),
          );
        } catch {
          // Ignore storage failures.
        }
      })
      .catch(() => {
        // Network or rate-limit failure; just leave stars null.
      });

    return () => {
      cancelled = true;
    };
  }, [owner, repo, cacheKey, stars]);

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      <GitHubMark className="size-3.5" aria-hidden />
      <span>{label}</span>
      <span className="flex items-center gap-0.5 text-muted-foreground">
        <Star className="size-3" aria-hidden />
        <span className="tabular-nums">{formatCount(stars)}</span>
      </span>
    </a>
  );
}

function formatCount(n: number | null): string {
  if (n === null) return "...";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function readCachedStars(cacheKey: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedStars;
    if (Date.now() - parsed.fetchedAt < CACHE_TTL_MS) return parsed.count;
  } catch {
    // sessionStorage unavailable or entry corrupt.
  }
  return null;
}

function GitHubMark({
  className,
  ...rest
}: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      {...rest}
    >
      <path d="M12 .5C5.73.5.75 5.48.75 11.75c0 4.97 3.22 9.18 7.69 10.67.56.1.77-.24.77-.54 0-.27-.01-.98-.02-1.93-3.13.68-3.79-1.51-3.79-1.51-.51-1.31-1.25-1.66-1.25-1.66-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.5-.29-5.13-1.25-5.13-5.57 0-1.23.44-2.24 1.16-3.03-.12-.29-.5-1.44.11-3 0 0 .94-.3 3.1 1.16a10.7 10.7 0 0 1 5.64 0c2.16-1.46 3.1-1.16 3.1-1.16.61 1.56.23 2.71.11 3 .72.79 1.16 1.8 1.16 3.03 0 4.33-2.63 5.28-5.14 5.56.4.34.76 1.02.76 2.06 0 1.49-.01 2.69-.01 3.05 0 .3.2.65.78.54 4.47-1.49 7.69-5.7 7.69-10.67C23.25 5.48 18.27.5 12 .5Z" />
    </svg>
  );
}
