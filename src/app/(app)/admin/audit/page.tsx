import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { getAdminAuditPage } from "@/server/account-state/admin-audit";
import { AUDIT_ACTIONS, AdminQueryError, type AdminParams } from "@/server/account-state/admin-query";
import { AdminNav } from "../admin-nav";

export default function AdminAuditPage({ searchParams }: { searchParams: Promise<AdminParams> }) {
  return <Suspense fallback={<p role="status">Loading audit history…</p>}><AuditContent searchParams={searchParams} /></Suspense>;
}
async function AuditContent({ searchParams }: { searchParams: Promise<AdminParams> }) {
  const data = await getAdminAuditPage(await searchParams).catch((error: unknown) => {
    if (error instanceof AdminQueryError) return null;
    throw error;
  });
  if (!data) return <div><p role="alert">Invalid audit filters or cursor.</p><Link prefetch={false} href="/admin/audit">Reset filters</Link></div>;
  const { events, query, nextCursor } = data;
  const filters = new URLSearchParams({ action: query.action, target: query.target });
  const next = new URLSearchParams(filters); if (nextCursor) next.set("cursor", nextCursor);
  return <div className="ims-admin-workspace"><AdminNav /><header className="ims-page-heading"><div><h1>Account audit log</h1>
    <p className="mt-2 text-sm text-muted-foreground">Read-only account transition events, newest first (UTC). No message content, session tokens, or raw metadata.</p></div></header>
    <form method="get" action="/admin/audit" className="ims-panel flex flex-wrap items-end gap-3 p-4">
      <label className="grid gap-1 text-sm">Action<select name="action" defaultValue={query.action} className="rounded-md border bg-background p-2"><option value="ALL">All account actions</option>{AUDIT_ACTIONS.map(action => <option key={action}>{action}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Target user ID<input name="target" defaultValue={query.target} maxLength={255} className="rounded-md border bg-background p-2" /></label>
      <Button type="submit">Filter</Button><Link prefetch={false} href="/admin/audit" className="text-sm underline">Reset</Link>
    </form>
    <div className="ims-audit-scroll overflow-x-auto rounded-lg border" role="region" aria-label="Audit log" tabIndex={0}><table className="w-full text-left text-sm"><thead className="bg-muted"><tr>{["Timestamp (UTC)", "Action", "Actor", "Target", "Transition"].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead><tbody>{events.map(event => <tr key={event.id} className="border-t align-top">
      <td className="whitespace-nowrap p-3">{event.at.replace("T", " ")}</td><td className="p-3"><span className="ims-audit-action">{event.action}</span><div className="break-all text-xs text-muted-foreground">Event: {event.id}</div></td>
      <td className="p-3"><div>{event.actorName ?? "Deleted or system actor"}</div><div className="break-all text-xs text-muted-foreground">{event.actorId ?? "—"}</div></td>
      <td className="break-all p-3"><Link prefetch={false} href={`/admin/accounts/${encodeURIComponent(event.targetId)}`} className="underline">{event.targetId}</Link></td>
      <td className="p-3">{event.fromRole ?? event.fromStatus ?? "—"} → {event.toRole ?? event.toStatus ?? "—"}</td>
    </tr>)}</tbody></table>{events.length === 0 && <p className="p-4">No matching audit events.</p>}</div>
    <nav aria-label="Audit pages" className="flex gap-5 text-sm">{query.before && <Link prefetch={false} href={`/admin/audit?${filters}`} className="underline">First page</Link>}{nextCursor && <Link prefetch={false} href={`/admin/audit?${next}`} className="underline">Older events →</Link>}</nav>
  </div>;
}
