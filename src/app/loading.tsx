import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main
      className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="Loading page"
    >
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-full max-w-2xl" />

        <div className="grid gap-4 pt-6 md:grid-cols-2">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    </main>
  );
}
