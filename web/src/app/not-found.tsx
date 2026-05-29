import { MapPinOff } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <MapPinOff className="text-muted-foreground size-8" />
      <div className="space-y-1.5">
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="text-muted-foreground max-w-md text-sm">
          That route doesn&apos;t exist. The map maker is back at home.
        </p>
      </div>
      <Button nativeButton={false} render={<Link href="/" />} variant="outline">
        Back to ArtMapify
      </Button>
    </main>
  );
}
