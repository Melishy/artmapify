import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-3 p-8">
      <Loader2 className="text-muted-foreground size-7 animate-spin" />
      <p className="text-muted-foreground text-sm">Loading ArtMapify...</p>
    </main>
  );
}
