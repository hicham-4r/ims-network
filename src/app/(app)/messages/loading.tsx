import { Skeleton } from "@/components/ui/skeleton";
import styles from "./messages.module.css";

export default function MessagesLoading() {
  return <div className={styles.page} role="status" aria-label="Loading private messages">
    <div className={styles.heading}><div><Skeleton className="h-8 w-40 max-w-full"/><Skeleton className="mt-2 h-4 w-56 max-w-full"/></div></div>
    <div className={styles.loadingShell} aria-hidden="true">
      <div className={styles.loadingInbox}><Skeleton className="h-8 w-24"/>{[0,1,2,3].map(i => <Skeleton key={i} className="h-16 w-full"/>)}</div>
      <div className={styles.loadingThread}><Skeleton className="h-10 w-44 max-w-full"/><div className={styles.loadingBubbles}><Skeleton className="h-12 w-2/3"/><Skeleton className="ml-auto h-12 w-1/2"/><Skeleton className="h-12 w-1/2"/></div><Skeleton className="h-12 w-full"/></div>
    </div>
  </div>;
}
