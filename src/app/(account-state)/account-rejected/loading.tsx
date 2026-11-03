import { Skeleton } from "@/components/ui/skeleton";

export default function AccountStateLoading() {
  return (
    <div className="w-full rounded-xl border bg-background p-6 shadow-sm">
      <div className="space-y-4">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-4/5" />

        <div className="pt-4">
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}
