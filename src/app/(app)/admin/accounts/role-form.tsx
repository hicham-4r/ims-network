"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { changeRoleAction } from "./role-actions";

export function RoleForm({ targetUserId, action }: { targetUserId: string; action: "PROMOTE" | "DEMOTE" }) {
  const [state, submit, pending] = useActionState(changeRoleAction, { message: "" });
  const promote = action === "PROMOTE";
  return <form action={submit} className="space-y-3 rounded-md border p-4">
    <h2 className="font-semibold">Owner-only role management</h2>
    <p className="text-sm text-muted-foreground">{promote ? "Grant account approval and moderation privileges. Confirm this person's identity independently." : "Remove administrator privileges. Member access is retained if the account is active."} Existing sessions will be revoked.</p>
    <input type="hidden" name="targetUserId" value={targetUserId} />
    <input type="hidden" name="action" value={action} />
    <label className="block space-y-1 text-sm">Your current password<input name="password" type="password" autoComplete="current-password" required maxLength={128} className="block w-full rounded-md border bg-background p-2" /></label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmed" value="yes" required className="mt-1" />I confirm this privilege change and session revocation.</label>
    <Button type="submit" disabled={pending} variant={promote ? "default" : "destructive"}>{pending ? "Working…" : promote ? "Promote to administrator" : "Remove administrator privileges"}</Button>
    {state.message && <p role="status" className="text-sm">{state.message}</p>}
  </form>;
}
