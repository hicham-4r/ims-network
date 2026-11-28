"use client";
import {useActionState} from "react";
import {reviewReportAction,reviewerRoleAction} from "./actions";
export function ReviewReportForm({id,escalated=false}:{id:string;escalated?:boolean}){const [state,submit,pending]=useActionState(reviewReportAction,{message:""});return <form action={submit} className="ims-report-actions"><input type="hidden" name="reportId" value={id}/><button className="ims-outline-button" name="decision" value="DISMISSED" disabled={pending}>Dismiss</button>{!escalated&&<button className="ims-outline-button" name="decision" value="ESCALATED" disabled={pending}>Escalate</button>}{state.message&&<p role="status">{state.message}</p>}</form>;}
export function ReviewerRoleForm({targetUserId, action}: {targetUserId: string; action: "GRANT" | "REVOKE"}) {
  const [state, submit, pending] = useActionState(reviewerRoleAction, {message: ""});
  const grant = action === "GRANT";
  return <form action={submit} className="space-y-3 rounded-md border p-4">
    <h2 className="font-semibold">Owner-only moderator capability</h2>
    <p className="text-sm text-muted-foreground">Review reported-message metadata only. No access to private message contents or administrator actions. Only active members can be granted access.</p>
    <input type="hidden" name="targetUserId" value={targetUserId}/>
    <input type="hidden" name="action" value={action}/>
    <label className="block text-sm">Current password<input name="password" type="password" autoComplete="current-password" required maxLength={128} className="block w-full rounded-md border bg-background p-2"/></label>
    <label className="flex gap-2 text-sm"><input type="checkbox" name="confirmed" value="yes" required/>Confirm capability change</label>
    <div className="ims-report-actions"><button type="submit" className="ims-outline-button" disabled={pending}>{pending ? "Working…" : grant ? "Grant moderator" : "Revoke moderator"}</button></div>
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}
