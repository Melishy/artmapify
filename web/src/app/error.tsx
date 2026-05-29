"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <TriangleAlert className="text-destructive size-8" />
      <div className="space-y-1.5">
        <h1 className="text-lg font-semibold">Something broke</h1>
        <p className="text-muted-foreground max-w-md text-sm">
          ArtMapify hit an unexpected error. Your image never leaves the
          browser, so nothing was sent anywhere. Try again, and if it keeps
          happening, reload the page.
        </p>
        {error.digest ? (
          <p className="text-muted-foreground font-mono text-xs">
            ref: {error.digest}
          </p>
        ) : null}
      </div>
      <Button onClick={reset} variant="outline">
        <RotateCw />
        Try again
      </Button>
    </main>
  );
}
