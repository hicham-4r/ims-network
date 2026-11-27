"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, UsersRound, ShieldCheck, Flag, BarChart3 } from "lucide-react";
const tabs = [{ href: "/admin", label: "Overview", icon: LayoutDashboard }, { href: "/admin/accounts", label: "Accounts", icon: UsersRound }, { href: "/admin/audit", label: "Audit log", icon: ShieldCheck }, {href:"/moderation",label:"Reports",icon:Flag}, {href:"/admin/analytics",label:"Analytics",icon:BarChart3}];
export function AdminNav() {
  const pathname = usePathname();
  return <nav aria-label="Administration" className="ims-admin-nav">{tabs.map(({ href, label, icon: Icon }) => <Link key={href} prefetch={false} href={href} aria-current={pathname === href || (href !== "/admin" && pathname.startsWith(href + "/")) ? "page" : undefined}><Icon size={16} aria-hidden="true"/>{label}</Link>)}</nav>;
}
