import { Suspense, type ReactNode } from "react";
import { requireAdminPage } from "@/server/account-state/routing";
import { MemberShell } from "@/components/layout/member-shell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<main className="ims-loading" role="status">Loading administration…</main>}><AuthorizedAdminContent>{children}</AuthorizedAdminContent></Suspense>;
}
async function AuthorizedAdminContent({ children }: { children: ReactNode }) {
  const { session, profile } = await requireAdminPage();
  return <MemberShell userId={session.user.id} hasAvatar={Boolean(profile.avatarUrl)} avatarVersion={profile.updatedAt.toISOString()} name={profile.displayName || session.user.name} year={profile.graduationYear} canAdmin={true} canRecover={false}>{children}</MemberShell>;
}
