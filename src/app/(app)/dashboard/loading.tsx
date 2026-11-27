import { Skeleton } from "@/components/ui/skeleton";
export default function DashboardLoading() {
  return <div className="ims-overview" role="status" aria-label="Loading community overview"><div className="ims-page-heading"><div className="space-y-2"><Skeleton className="h-8 w-64 max-w-full"/><Skeleton className="h-4 w-80 max-w-full"/></div></div><div className="ims-overview-grid"><div className="ims-overview-main"><div className="ims-metrics">{[0,1,2,3].map(i => <Skeleton key={i} className="h-24 w-full"/>)}</div><Skeleton className="h-48 w-full"/><Skeleton className="h-64 w-full"/></div><div className="ims-overview-side"><Skeleton className="h-64 w-full"/><Skeleton className="h-44 w-full"/></div></div></div>;
}
