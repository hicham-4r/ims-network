import Link from "next/link";
import { requireAccountStatusPage } from "@/server/account-state/routing";
import { configuredOwnerId } from "@/server/account-state/owner";
import { recoveryEnabled, recoveryEligible } from "@/server/auth/recovery-code-core";
import { RecoveryCodeForm } from "@/components/auth/recovery-code-form";

export default async function AccountRecoveryPage() {
  const { session, accountState } = await requireAccountStatusPage("ACTIVE");
  const eligible = recoveryEligible({ userId: session.user.id, status: accountState.status, role: accountState.role,
    emailVerified: session.user.emailVerified }, configuredOwnerId());
  return <section className="max-w-lg space-y-4"><Link prefetch={false} href="/dashboard" className="underline">Back to dashboard</Link><h1 className="text-2xl font-semibold">Account recovery</h1>
    {eligible && recoveryEnabled(process.env.IMS_RECOVERY_CODES_ENABLED) ? <><p>Save a private recovery code before losing access to your account. Generating a new code replaces the old one. Codes expire after 365 days and are invalidated by password or account-state changes.</p><RecoveryCodeForm mode="issue" /></> : <p>Recovery codes are currently unavailable for this account. They are intended for approved ordinary members with unverified email addresses.</p>}
  </section>;
}
