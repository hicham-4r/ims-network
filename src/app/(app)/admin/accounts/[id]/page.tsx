import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminAccountDetail } from "@/server/account-state/admin-page";
import { AdminNav } from "../../admin-nav";
import { AccountControls } from "../account-controls";
import { ReviewerRoleForm } from "../../../moderation/forms";
import { RoleForm } from "../role-form";
import { configuredOwnerId, applicationRoleLabel } from "@/server/account-state/owner";
import { canChangeRole } from "@/server/account-state/owner-policy";

export default function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<p role="status">Loading account…</p>}><Detail params={params} /></Suspense>;
}
async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getAdminAccountDetail(id);
  if (!data) notFound();
  const { account, session, accountState } = data;
  const roleAction = account.role === "ADMIN" ? "DEMOTE" : "PROMOTE";
  const canManageRole = canChangeRole(configuredOwnerId(), { ...accountState, userId: session.user.id }, account, roleAction);
  const details = [
    ["Email (ownership not automatically verified)", account.email], ["Account status", account.status], ["Role", applicationRoleLabel(account)],
    ["User ID", account.userId], ["Display name", account.displayName], ["Program", account.program],
    ["Department", account.department], ["Graduation year", account.graduationYear],
    ["Registered (UTC)", account.createdAt.toISOString()], ["Last updated (UTC)", account.updatedAt.toISOString()],
    ["Approved (UTC)", account.approvedAt?.toISOString()], ["Approved by ID", account.approvedBy],
    ["Rejected (UTC)", account.rejectedAt?.toISOString()], ["Rejection reason", account.rejectionReason],
    ["Suspended (UTC)", account.suspendedAt?.toISOString()], ["Suspension reason", account.suspensionReason],
  ] as const;
  return <div className="ims-admin-workspace"><AdminNav /><header className="ims-page-heading"><div><p>Account details</p><h1 className="break-words">{account.name}</h1></div><span className="ims-role-label">{account.status.replaceAll("_", " ")}</span></header>
    <Card><CardHeader><CardTitle>Account details</CardTitle></CardHeader><CardContent className="space-y-5">
      <dl className="grid gap-4 sm:grid-cols-2">{details.map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value ?? "—"}</dd></div>)}</dl>
      <Link prefetch={false} href={`/admin/audit?target=${encodeURIComponent(account.userId)}`} className="inline-block text-sm underline">Account audit history</Link>
      <AccountControls account={account} actorId={session.user.id} />
      {configuredOwnerId() === session.user.id && account.userId !== session.user.id && <ReviewerRoleForm targetUserId={account.userId}/>}
      {canManageRole && <RoleForm key={`${account.userId}:${account.role}`} targetUserId={account.userId} action={roleAction} />}
    </CardContent></Card></div>;
}
