import Link from "next/link";
import { requireAccountStatusPage } from "@/server/account-state/routing";
import { configuredOwnerId } from "@/server/account-state/owner";
import { privacyEnabled } from "@/server/privacy/data-policy";
import { PrivacyDataForm } from "@/components/privacy/privacy-data-form";
export default async function AccountPrivacyPage() {
  const { session, accountState } = await requireAccountStatusPage("ACTIVE");
  return <section className="max-w-2xl space-y-4"><Link prefetch={false} href="/dashboard" className="underline">Back to dashboard</Link><h1 className="text-2xl font-semibold">Account privacy</h1>
    {privacyEnabled(process.env.IMS_PRIVACY_DATA_ENABLED) ? <PrivacyDataForm canRequestDeletion={accountState.role === "MEMBER" && session.user.id !== configuredOwnerId()} /> : <p>Self-service privacy tools are currently unavailable. Contact the network owner through a trusted channel.</p>}
  </section>;
}
