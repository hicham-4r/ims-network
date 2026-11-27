"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { TurnstileWidget, turnstileSiteKey } from "@/components/auth/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RecoveryCodeForm({ mode }: { mode: "issue" | "redeem" }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [issued, setIssued] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  const issue = mode === "issue";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || (!issue && (password !== confirm || (turnstileSiteKey && !token)))) {
      if (!issue && password !== confirm) setMessage("Passwords do not match.");
      return;
    }
    setPending(true); setMessage(""); setIssued(null);
    try {
      const response = await fetch("/api/recovery-code", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json", ...(token ? { "x-captcha-response": token } : {}) },
        body: JSON.stringify(issue ? { action: "issue", password } : { action: "redeem", code: code.trim(), password }),
      });
      const result: unknown = await response.json();
      if (!response.ok || !result || typeof result !== "object") {
        setMessage("Recovery request failed. Check your details and try again later."); return;
      }
      if (issue && "code" in result && typeof result.code === "string") setIssued(result.code);
      else if (!issue && "ok" in result && result.ok === true) setDone(true);
      else setMessage("Recovery request could not be completed.");
    } catch { setMessage("Recovery request could not be completed."); }
    finally { setPassword(""); setConfirm(""); setCode(""); setToken(null); setAttempt(n => n + 1); setPending(false); }
  }
  if (done) return <div className="space-y-3"><p role="status">Password changed. Your recovery code has been consumed. Sign in with the new password, then generate a replacement code.</p><Link href="/sign-in" prefetch={false} className="underline">Sign in</Link></div>;
  if (issued) return <div className="space-y-3"><p role="status">Save this code privately now. It cannot be displayed again. Any previous code is invalid.</p><p className="break-all select-all rounded border p-3 font-mono text-sm">{issued}</p><p>Use it once within 365 days. Never send it to an administrator or another person.</p><Button type="button" onClick={() => setIssued(null)}>Hide code</Button></div>;
  return <form className="space-y-4" onSubmit={submit}>
    {!issue && <div><label htmlFor="recovery-code">Recovery code</label><Input id="recovery-code" autoComplete="off" spellCheck={false} value={code} onChange={e => setCode(e.target.value)} maxLength={80} required disabled={pending} /></div>}
    <div><label htmlFor="recovery-password">{issue ? "Current password" : "New password"}</label><Input id="recovery-password" type="password" autoComplete={issue ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} minLength={8} maxLength={128} required disabled={pending} /></div>
    {!issue && <div><label htmlFor="recovery-confirm">Confirm new password</label><Input id="recovery-confirm" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} minLength={8} maxLength={128} required disabled={pending} /></div>}
    {!issue && <TurnstileWidget key={attempt} action="recovery" onToken={setToken} />}
    {message && <p role="alert">{message}</p>}
    <Button type="submit" disabled={pending || (!issue && Boolean(turnstileSiteKey && !token))}>{pending ? "Processing..." : issue ? "Generate replacement recovery code" : "Reset password"}</Button>
  </form>;
}
