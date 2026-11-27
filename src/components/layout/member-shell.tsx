"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type KeyboardEvent } from "react";
import { LayoutDashboard, UsersRound, MessageCircle, Bell, UserRound, ShieldCheck, Search, PanelLeft, Menu, X, Settings, KeyRound, ArrowRight, Smartphone, Flag } from "lucide-react";
import { MemberAvatar } from "@/components/members/member-avatar";
import { SignOutButton } from "@/components/auth/sign-out-button";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
const primary = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/members", label: "Directory", icon: UsersRound },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/profile", label: "My profile", icon: UserRound },
];

export function MemberShell({ children, name, year, canAdmin, canRecover, userId, hasAvatar, avatarVersion }: { children: ReactNode; name: string; year: number | null; canAdmin: boolean; canRecover: boolean; userId: string; hasAvatar: boolean; avatarVersion: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const routes = [...primary, ...(canAdmin ? [{ href: "/admin", label: "Administration", icon: ShieldCheck }] : []), {href:"/moderation",label:"Safety & reports",icon:Flag}, { href: "/account-privacy", label: "Privacy & settings", icon: Settings }, { href: "/install", label: "Install app", icon: Smartphone }, ...(canRecover ? [{ href: "/account-recovery", label: "Recovery code", icon: KeyRound }] : [])];
  const term = query.trim();
  const matching = routes.filter(route => route.label.toLowerCase().includes(term.toLowerCase()));
  const current = routes.find(route => pathname === route.href || pathname.startsWith(route.href + "/"));

  const openSearch = useCallback(() => { setQuery(""); if (!dialog.current?.open) dialog.current?.showModal(); search.current?.focus(); }, []);
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openSearch(); }
      if (event.key === "Escape") setMobile(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSearch]);
  function navigateResults(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.nativeEvent.isComposing) return;
    const links = Array.from(results.current?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? []);
    if (!links.length) return;
    event.preventDefault();
    const index = links.findIndex(link => link === document.activeElement);
    if (event.key === "ArrowDown") links[(index + 1) % links.length]?.focus();
    else if (index <= 0) search.current?.focus();
    else links[index - 1]?.focus();
  }
  function go(href: string) { dialog.current?.close(); setMobile(false); router.push(href); }
  return <div className={`ims-workspace ${collapsed ? "ims-collapsed" : ""}`}>
    <a className="ims-skip" href="#member-content">Skip to content</a>
    <aside id="ims-sidebar" className={`ims-nav ${mobile ? "ims-nav-open" : ""}`}>
      <Link href="/dashboard" prefetch={false} className="ims-brand" aria-label="IMS Network dashboard" onClick={() => setMobile(false)}><span className="ims-mark" aria-hidden="true"/><span className="ims-nav-label">IMS Network<small>ESITH alumni</small></span></Link>
      <nav aria-label="Member navigation" className="ims-nav-links">
        {routes.map(({ href, label, icon: Icon }) => <Link key={href} href={href} prefetch={false} aria-current={current?.href === href ? "page" : undefined} aria-label={label} title={label} onClick={() => setMobile(false)}><Icon size={19} aria-hidden="true"/><span className="ims-nav-label">{label}</span></Link>)}
      </nav>
      <div className="ims-nav-bottom"><Link href="/profile" prefetch={false} className="ims-account" title="Edit profile" aria-label="Edit profile" onClick={() => setMobile(false)}><MemberAvatar userId={userId} displayName={name} hasAvatar={hasAvatar} version={avatarVersion} size="sm"/><span className="ims-nav-label ims-account-copy"><strong>{name}</strong><small>{year ? `Class of ${year}` : "Member profile"}</small></span></Link><SignOutButton/></div>
    </aside>
    <div className="ims-workspace-main">
      <header className="ims-topbar">
        <button type="button" className="ims-icon-button ims-desktop-toggle" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} aria-controls="ims-sidebar" onClick={() => setCollapsed(value => !value)}><PanelLeft size={19} aria-hidden="true"/></button>
        <button type="button" className="ims-icon-button ims-mobile-toggle" aria-label={mobile ? "Close navigation" : "Open navigation"} aria-expanded={mobile} aria-controls="ims-sidebar" onClick={() => setMobile(value => !value)}>{mobile ? <X size={20} aria-hidden="true"/> : <Menu size={20} aria-hidden="true"/>}</button>
        <button type="button" ref={searchTrigger} className="ims-search-trigger" onClick={openSearch} aria-label="Search and quick navigation"><Search size={18} aria-hidden="true"/><span>Search alumni or navigate…</span><kbd>Ctrl / ⌘ K</kbd></button>
        <label className="sr-only" htmlFor="ims-theme">Appearance</label><select id="ims-theme" className="ims-theme" value={mounted ? theme ?? "dark" : "dark"} onChange={event => setTheme(event.target.value)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select>
        <Link className="ims-icon-button" href="/notifications" prefetch={false} aria-label="Notifications" title="Notifications"><Bell size={19} aria-hidden="true"/></Link>
        <Link className="ims-top-profile" href="/profile" prefetch={false} aria-label="My profile"><MemberAvatar userId={userId} displayName={name} hasAvatar={hasAvatar} version={avatarVersion} size="sm"/></Link>
      </header>
      <main id="member-content" tabIndex={-1} className="ims-content">{children}</main>
    </div>
    <dialog ref={dialog} onKeyDown={navigateResults} onClose={() => searchTrigger.current?.focus()} className="ims-command" aria-labelledby="ims-command-title"><div className="ims-section-heading"><h2 id="ims-command-title">Quick navigation</h2><button type="button" className="ims-icon-button" aria-label="Close search" onClick={() => dialog.current?.close()}><X size={20} aria-hidden="true"/></button></div><form onSubmit={event => { event.preventDefault(); if (matching.length) go(matching[0].href); else if (term) go(`/members?q=${encodeURIComponent(term)}`); }}><label className="sr-only" htmlFor="ims-command-query">Find a page or alumni</label><input id="ims-command-query" ref={search} className="ims-command-input" placeholder="Find a page or alumni…" maxLength={80} value={query} onChange={event => setQuery(event.target.value)}/><button type="submit" className="sr-only">Open first result</button></form><nav ref={results} aria-label="Search results" className="ims-nav-links">{matching.map(({ href, label, icon: Icon }) => <Link key={href} href={href} prefetch={false} onClick={() => { dialog.current?.close(); setMobile(false); }}><Icon size={19} aria-hidden="true"/>{label}</Link>)}{term && <Link href={`/members?q=${encodeURIComponent(term)}`} prefetch={false} onClick={() => dialog.current?.close()}><Search size={19} aria-hidden="true"/><span className="min-w-0 truncate">Search directory for “{term}”</span><ArrowRight size={16} aria-hidden="true"/></Link>}</nav><p className="ims-command-hint">↑ ↓ or Tab to navigate · Enter to open · Esc to close</p></dialog>
  </div>;
}
