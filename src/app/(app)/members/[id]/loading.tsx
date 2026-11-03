import { Skeleton } from "@/components/ui/skeleton";

export default function MemberDetailLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-10 w-60" />

      <div className="rounded-xl border p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-3 h-4 w-32" />

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>

        <Skeleton className="mt-10 h-24 w-full" />
      </div>
    </div>
  );
}
