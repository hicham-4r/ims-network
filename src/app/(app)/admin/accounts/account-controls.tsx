import { Button } from "@/components/ui/button";
import { approveAccount, rejectAccount, restoreAccount, suspendAccount } from "./actions";
import type { AdminStatus } from "@/server/account-state/admin-query";

type Account = { userId: string; role: "MEMBER" | "ADMIN"; status: AdminStatus };
function Confirmation({ label }: { label: string }) {
  return <label className="flex items-start gap-2 text-sm">
    <input type="checkbox" name="confirmed" value="yes" required className="mt-1" />{label}
  </label>;
}
function Reason({ label }: { label: string }) {
  return <label className="block space-y-1 text-sm">{label}
    <textarea name="reason" required maxLength={500} className="block min-h-20 w-full rounded-md border bg-background p-2" />
  </label>;
}
export function AccountControls({ account, actorId }: { account: Account; actorId: string }) {
  if (account.role !== "MEMBER" || account.userId === actorId) return <p className="text-sm text-muted-foreground">Administrator accounts cannot be changed here.</p>;
  const hidden = <input type="hidden" name="targetUserId" value={account.userId} />;
  if (account.status === "PENDING_APPROVAL") return <div className="grid gap-4 sm:grid-cols-2">
    <form action={approveAccount} className="space-y-3 rounded-md border p-3">{hidden}
      <Confirmation label="I independently confirmed this applicant's eligibility and intend to grant member access." />
      <Button type="submit">Approve account</Button>
    </form>
    <form action={rejectAccount} className="space-y-3 rounded-md border p-3">{hidden}
      <Reason label="Reason for rejection" />
      <Confirmation label="I confirm this rejection and understand access will be denied." />
      <Button type="submit" variant="destructive">Reject account</Button>
    </form>
  </div>;
  if (account.status === "ACTIVE") return <form action={suspendAccount} className="space-y-3">{hidden}
    <Reason label="Reason for suspension" />
    <Confirmation label="I confirm suspension and revocation of the member's sessions." />
    <Button type="submit" variant="destructive">Suspend member</Button>
  </form>;
  if (account.status === "SUSPENDED") return <form action={restoreAccount} className="space-y-3">{hidden}
    <Confirmation label="I confirm this member should regain access." />
    <Button type="submit">Restore member</Button>
  </form>;
  return <p className="text-sm text-muted-foreground">{account.status === "UNVERIFIED" ? "Legacy account; signing in moves it to pending review." : "No available state transition."}</p>;
}
