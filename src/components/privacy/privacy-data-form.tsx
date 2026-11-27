"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PrivacyDataForm({ canRequestDeletion }: { canRequestDeletion: boolean }) {
  const [pending, setPending] = useState(false);
  const [before, setBefore] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  async function post(body: unknown) {
    return fetch("/api/privacy-data", { method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }
  async function download() {
    if (pending || finished) return;
    setPending(true); setMessage("");
    try {
      const response = await post({ action: "export", before });
      if (!response.ok) throw new Error("Export failed");
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || !("nextBefore" in data) ||
        (data.nextBefore !== null && typeof data.nextBefore !== "string")) throw new Error("Invalid export");
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      try {
        const link = document.createElement("a");
        link.href = url; link.download = `ims-personal-data-${before ?? "first"}.json`;
        document.body.appendChild(link); link.click(); link.remove();
      } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
      setBefore(data.nextBefore); setFinished(data.nextBefore === null);
      setMessage(data.nextBefore === null ? "Export page downloaded. No more message, reaction or report records." : "Export page downloaded. Download the next page to continue.");
    } catch { setMessage("Export failed or rate limited. Try again later."); }
    finally { setPending(false); }
  }
  async function requestDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !confirmed) return;
    setPending(true); setMessage("");
    try {
      const response = await post({ action: "request-deletion", password, confirmed });
      if (!response.ok) throw new Error("Request failed");
      setMessage("Deletion request recorded for review. Your account and messages have not been deleted.");
    } catch { setMessage("Request failed. Check your password or try again later."); }
    finally { setPassword(""); setConfirmed(false); setPending(false); }
  }
  return <div className="space-y-6">
    <section className="space-y-3 rounded border p-4"><h2 className="text-lg font-semibold">Export your information</h2>
      <p>Download your account and profile fields and up to 100 related message, reaction or report records per JSON file. This does not include received messages, avatar files or credentials. New messages sent during an export may require restarting it. Keep downloaded files private.</p>
      <Button type="button" disabled={pending || finished} onClick={download}>{before ? "Download next page" : "Download my data"}</Button>
      {finished && <Button type="button" variant="outline" disabled={pending} onClick={() => { setBefore(null); setFinished(false); setMessage(""); }}>Restart export</Button>}
    </section>
    {canRequestDeletion && <form className="space-y-3 rounded border p-4" onSubmit={requestDeletion}><h2 className="text-lg font-semibold">Request account deletion</h2>
      <p>This submits a request for manual review. It does not close or erase your account immediately. Conversation history and backups require separate handling.</p>
      <label htmlFor="privacy-password">Current password</label><Input id="privacy-password" type="password" autoComplete="current-password" maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} disabled={pending} />
      <label className="flex gap-2 items-start"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={pending} required />I confirm I want to request deletion of my account.</label>
      <Button type="submit" variant="outline" disabled={pending || !confirmed}>Submit deletion request</Button>
    </form>}
    {message && <p role="status">{message}</p>}
  </div>;
}
