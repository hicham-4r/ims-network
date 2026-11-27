"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
        <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <AlertTriangle className="size-5" aria-hidden="true" />
        </div>

        <h1 className="text-xl font-semibold">
          Something went wrong
        </h1>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The page could not be loaded correctly. You can try the request
          again.
        </p>

        <Button
          className="mt-6"
          onClick={reset}
        >
          Try again
        </Button>
      </div>
    </main>
  );
}
