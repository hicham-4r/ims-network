"use client";

import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function PasswordField({ id, label, value, onChange, pending, current = false }: {
  id: string; label: string; value: string; onChange: (value: string) => void; pending: boolean; current?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return <div className="space-y-2">
    <label className="block text-sm font-medium" htmlFor={id}>{label}</label>
    <div className="flex min-w-0 items-center gap-2">
      <Input id={id} name={id} type={visible ? "text" : "password"} className="h-11 min-w-0"
        autoComplete={current ? "current-password" : "new-password"} autoCapitalize="none" spellCheck={false}
        minLength={current ? 1 : 8} maxLength={128} required disabled={pending} value={value}
        onChange={event => onChange(event.target.value)} />
      <Button type="button" variant="outline" className="size-11 shrink-0" disabled={pending}
        aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={visible}
        onClick={() => setVisible(v => !v)}>{visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</Button>
    </div>
  </div>;
}

export function PasswordChangeForm() {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (password !== confirm) { setMessage("The new passwords do not match."); return; }
    if (password.length < 8 || password.length > 128 || password === current) {
      setMessage("Choose a different password of 8–128 characters."); return;
    }
    submitting.current = true; setPending(true); setMessage("");
    try {
      const response = await fetch("/api/auth/password-change", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: password, confirmPassword: confirm }),
      });
      const result: unknown = await response.json();
      if (response.ok && result && typeof result === "object" && "ok" in result && result.ok === true) {
        setDone(true);
        // Full document navigation drops the old authenticated router cache.
        window.location.replace("/sign-in?passwordChanged=1");
        return;
      }
      if (response.status === 429) setMessage("Too many attempts. Try again later.");
      else if (response.status === 401 || response.status === 403) setMessage("Access denied. Sign in again with an active account.");
      else if (response.status === 400) setMessage("Check your current password and choose a different new password.");
      else setMessage("Password change could not be confirmed. Try signing in before retrying.");
    } catch { setMessage("Password change could not be confirmed. Try signing in before retrying."); }
    finally { setCurrent(""); setPassword(""); setConfirm(""); setPending(false); submitting.current = false; }
  }
  if (done) return <div className="space-y-2"><p role="status">Password changed. Sign in with your new password.</p><Button type="button" onClick={() => window.location.replace("/sign-in")}>Sign in</Button></div>;
  return <form className="max-w-lg space-y-4" onSubmit={submit}>
    <PasswordField id="current-password" label="Current password" value={current} onChange={setCurrent} pending={pending} current />
    <PasswordField id="new-password" label="New password" value={password} onChange={setPassword} pending={pending} />
    <PasswordField id="confirm-password" label="Confirm new password" value={confirm} onChange={setConfirm} pending={pending} />
    <p className="text-sm text-muted-foreground">Use 8–128 characters and a unique password. All sessions, including this one, will be signed out. Any saved recovery code becomes invalid.</p>
    <div className="flex items-start gap-2 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>No email or recovery code is needed when you know your current password.</span></div>
    {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
    <Button type="submit" className="h-11 w-full sm:w-auto" disabled={pending}>{pending ? "Changing password…" : "Change password"}</Button>
  </form>;
}
