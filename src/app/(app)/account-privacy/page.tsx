import Link from "next/link";
import { requireAccountStatusPage } from "@/server/account-state/routing";
import { configuredOwnerId } from "@/server/account-state/owner";
import { privacyEnabled } from "@/server/privacy/data-policy";
import { PasswordChangeForm } from "@/components/auth/password-change-form";
import { Card, CardHeader, CardContent, CardDescription } from "@/components/ui/card";
import { PrivacyDataForm } from "@/components/privacy/privacy-data-form";
export default async function AccountPrivacyPage() {
  const { session, accountState } = await requireAccountStatusPage("ACTIVE");
  return <section className="max-w-2xl space-y-6"><Link prefetch={false} href="/dashboard" className="text-sm text-muted-foreground underline underline-offset-4">Back to dashboard</Link>
    <header className="space-y-1"><h1 className="text-2xl font-semibold tracking-tight">Account &amp; Security</h1><p className="text-sm text-muted-foreground">Manage access to your account and your personal information.</p></header>
    <Card><CardHeader><h2 className="text-base font-semibold">Change password</h2><CardDescription>Protect your account with a password only you know.</CardDescription></CardHeader><CardContent><PasswordChangeForm /></CardContent></Card>
    <section className="space-y-3" aria-labelledby="privacy-heading"><h2 id="privacy-heading" className="text-lg font-semibold">Account privacy</h2>
    {privacyEnabled(process.env.IMS_PRIVACY_DATA_ENABLED) ? <PrivacyDataForm canRequestDeletion={accountState.role === "MEMBER" && session.user.id !== configuredOwnerId()} /> : <p>Self-service privacy tools are currently unavailable. Contact the network owner through a trusted channel.</p>}
    </section>
  </section>;
}
