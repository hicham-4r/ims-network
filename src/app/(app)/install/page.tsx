import Link from "next/link";
import { requireActiveMemberPage } from "@/server/account-state/routing";
import { Suspense } from "react";
import { Smartphone, MonitorDown, ShieldCheck } from "lucide-react";

export default function InstallPage() {
  return <Suspense fallback={<p role="status">Loading installation guide…</p>}><InstallContent/></Suspense>;
}
async function InstallContent() {
  await requireActiveMemberPage();
  return <div className="ims-install-page"><header className="ims-page-heading"><div><p className="ims-kicker">Workspace / Install</p><h1>Take IMS Network with you</h1><p>Open your alumni network from your home screen or desktop.</p></div></header>
    <section className="ims-panel ims-install-hero"><div className="ims-mark" aria-hidden="true"/><div><h2>IMS Network</h2><p>Install directly from your browser. No app store or paid subscription required.</p><p className="ims-installed-label">You are already using the standalone app.</p></div></section>
    <div className="ims-install-grid"><section className="ims-panel ims-install-step"><MonitorDown size={24} aria-hidden="true"/><h2>Desktop & Android</h2><p>In a supported browser, open the browser menu and choose Install app or Add to home screen. The label depends on your browser.</p></section><section className="ims-panel ims-install-step"><Smartphone size={24} aria-hidden="true"/><h2>iPhone & iPad</h2><p>Open IMS Network in Safari, tap Share, then Add to Home Screen.</p></section><section className="ims-panel ims-install-step"><ShieldCheck size={24} aria-hidden="true"/><h2>Private by design</h2><p>Messages, account pages and avatars are not stored in an offline cache. Reconnect to access your account.</p></section></div><Link href="/dashboard" prefetch={false} className="ims-outline-button">Back to overview</Link></div>;
}
