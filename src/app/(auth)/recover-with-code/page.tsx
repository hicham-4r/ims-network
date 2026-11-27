import Link from "next/link";
import { RecoveryCodeForm } from "@/components/auth/recovery-code-form";
import { recoveryEnabled } from "@/server/auth/recovery-code-core";

export default function RecoverWithCodePage() {
  return <section className="space-y-4 rounded-lg border bg-background p-6"><h1 className="text-2xl font-semibold">Recover with a code</h1>
    {recoveryEnabled(process.env.IMS_RECOVERY_CODES_ENABLED) ? <><p>Use the recovery code you saved earlier. No email address is required.</p><RecoveryCodeForm mode="redeem" /></> : <p>Recovery codes are not enabled on this deployment.</p>}
    <Link href="/sign-in" className="underline">Back to sign in</Link>
  </section>;
}
