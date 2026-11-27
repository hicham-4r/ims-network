import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminAccountsPageData } from "@/server/account-state/admin-page";
import { ADMIN_STATUSES, AdminQueryError, type AdminParams } from "@/server/account-state/admin-query";
import { AdminNav } from "../admin-nav";
import { AccountControls } from "./account-controls";
import { applicationRoleLabel } from "@/server/account-state/owner";

export default function AdminAccountsPage({ searchParams }: { searchParams: Promise<AdminParams> }) {
  return <Suspense fallback={<p role="status">Loading accounts…</p>}><AccountsContent searchParams={searchParams} /></Suspense>;
}
async function AccountsContent({ searchParams }: { searchParams: Promise<AdminParams> }) {
  const params = await searchParams;
  const data = await getAdminAccountsPageData(params).catch((error: unknown) => {
    if (error instanceof AdminQueryError) return null;
    throw error;
  });
  if (!data) return <div><p role="alert">Invalid account search or page cursor.</p><Link prefetch={false} href="/admin/accounts">Reset filters</Link></div>;
  const { session, accounts, query, nextCursor } = data;
  const filters = new URLSearchParams({ status: query.status, q: query.q });
  const next = new URLSearchParams(filters);
  if (nextCursor) next.set("cursor", nextCursor);
  return <div className="ims-admin-workspace">
    <AdminNav />
    <header className="ims-page-heading"><div><h1>Account management</h1>
      <p className="mt-2 text-sm text-muted-foreground">Email ownership is not verified automatically. Confirm eligibility independently before approval. All successful state changes are audited.</p></div></header>
    <form action="/admin/accounts" method="get" className="ims-panel flex flex-wrap items-end gap-3 p-4">
      <label className="grid gap-1 text-sm">Name or email prefix<input name="q" type="search" maxLength={80} defaultValue={query.q} className="rounded-md border bg-background p-2" /></label>
      <label className="grid gap-1 text-sm">Account status<select name="status" defaultValue={query.status} className="rounded-md border bg-background p-2">
        <option value="ALL">All accounts</option>{ADMIN_STATUSES.map(status => <option key={status}>{status}</option>)}
      </select></label><Button type="submit">Filter</Button>
      <Link href="/admin/accounts" prefetch={false} className="text-sm underline">Reset</Link>
    </form>
    <p className="text-sm text-muted-foreground">{accounts.length} accounts on this page · stable ID order</p>
    <div className="ims-admin-account-grid">{accounts.map(account => <Card key={account.userId} className="ims-admin-account-card">
      <CardHeader><CardTitle className="break-words">{account.name}</CardTitle><p className="break-all text-sm text-muted-foreground">{account.email}</p><div className="ims-account-tags"><span className="ims-account-status" data-status={account.status}>{account.status.replaceAll("_", " ")}</span><span>{applicationRoleLabel(account)}</span></div></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">Registered {account.createdAt.toISOString().slice(0, 10)}</p>
        {account.rejectionReason && <p className="break-words text-sm">Rejection reason: {account.rejectionReason}</p>}
        {account.suspensionReason && <p className="break-words text-sm">Suspension reason: {account.suspensionReason}</p>}
        <Link href={`/admin/accounts/${encodeURIComponent(account.userId)}`} prefetch={false} className="inline-block text-sm font-medium underline">Account details</Link>
        <AccountControls account={account} actorId={session.user.id} />
      </CardContent></Card>)}
      {accounts.length === 0 && <p className="rounded-md border p-5 text-sm">No accounts match these filters.</p>}
    </div>
    <nav aria-label="Account pages" className="flex gap-5 text-sm">
      {query.afterId && <Link prefetch={false} href={`/admin/accounts?${filters}`} className="underline">First page</Link>}
      {nextCursor && <Link prefetch={false} href={`/admin/accounts?${next}`} className="underline">Next page →</Link>}
    </nav>
  </div>;
}
