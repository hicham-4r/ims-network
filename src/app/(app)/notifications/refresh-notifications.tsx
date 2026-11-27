"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
export function RefreshNotifications() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button type="button" className="ims-outline-button" disabled={pending} onClick={() => startTransition(() => router.refresh())}><RefreshCw size={15} aria-hidden="true"/>{pending ? "Refreshing…" : "Refresh view"}</button>;
}
