import { Suspense, type ReactNode } from "react";
import { getApplicationPageAccount, redirectRestrictedAccount } from "@/server/account-state";
import { MemberShell } from "@/components/layout/member-shell";

export default function MemberLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<main className="ims-loading" role="status"><span className="ims-brand"><span className="ims-mark" aria-hidden="true" />IMS Network</span><p>Loading your workspace…</p></main>}><AuthorizedMemberContent>{children}</AuthorizedMemberContent></Suspense>;
}
async function AuthorizedMemberContent({ children }: { children: ReactNode }) {
  const { accountState, session, profile } = await getApplicationPageAccount();
  redirectRestrictedAccount(accountState.status);
  return <MemberShell userId={session.user.id} hasAvatar={Boolean(profile.avatarUrl)} avatarVersion={profile.updatedAt.toISOString()} name={profile.displayName || session.user.name} year={profile.graduationYear} canAdmin={accountState.role === "ADMIN"} canRecover={accountState.role === "MEMBER" && !session.user.emailVerified && process.env.IMS_RECOVERY_CODES_ENABLED === "true"}>{children}</MemberShell>;
}
