import { Suspense } from "react";
import DashboardLoading from "./loading";
import Link from "next/link";
import { ArrowRight, UsersRound, MessageCircle, UserRound, ShieldCheck } from "lucide-react";
import { requireActiveMemberPage } from "@/server/account-state/routing";
import { listActiveMembers } from "@/server/members";
import { MemberDirectoryRateLimitError } from "@/server/members/search-rate-limit";
import { getConversationInbox } from "@/server/messaging/inbox";
import { MessagingReadBudgetError } from "@/server/messaging/read-budget";
import { MemberAvatar } from "@/components/members/member-avatar";
import { MemberDirectoryTable } from "@/components/members/member-directory-table";

type DashboardProps = { searchParams: Promise<{ snapshot?: string | string[] }> };
export default function DashboardPage(props: DashboardProps) {
  return <Suspense fallback={<DashboardLoading/>}><DashboardContent {...props}/></Suspense>;
}
async function DashboardContent({ searchParams }: DashboardProps) {
  const { session, profile } = await requireActiveMemberPage();
  // One bounded directory and inbox service call per normal render, no background refresh.
  // Compact mode is available when a user wants to minimize hosted reads.
  const snapshot = (await searchParams).snapshot !== "0";
  const [directory, inbox] = snapshot ? await Promise.all([
    listActiveMembers({}).catch((error: unknown) => { if (error instanceof MemberDirectoryRateLimitError) return null; throw error; }),
    getConversationInbox().catch((error: unknown) => { if (error instanceof MessagingReadBudgetError) return null; throw error; }),
  ]) : [null, null];
  const members = directory?.members ?? [];
  const conversations = inbox?.conversations ?? [];
  const fields = [profile.displayName, profile.program, profile.graduationYear, profile.bio];
  const professional = [profile.jobTitle, profile.company, profile.location, profile.skills];
  const professionalCompleted = professional.filter(value => value != null && String(value).trim() !== "").length;
  const completed = fields.filter(value => value !== null && String(value).trim() !== "").length;
  const percent = Math.round(completed / fields.length * 100);
  const unread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const years = new Map<number, number>();
  for (const member of members) if (member.graduationYear !== null) years.set(member.graduationYear, (years.get(member.graduationYear) ?? 0) + 1);
  const cohorts = [...years.entries()].sort(([a], [b]) => a - b);
  const max = Math.max(1, ...cohorts.map(([, count]) => count));
  const stats = [
    { label: "Alumni in view", value: directory ? members.length : "—", hint: snapshot ? "Current directory page" : "Compact view", icon: UsersRound },
    { label: "Conversations", value: inbox ? conversations.length : "—", hint: snapshot ? "Current inbox page" : "Compact view", icon: MessageCircle },
    { label: "Unread messages", value: inbox ? unread : "—", hint: snapshot ? "On this inbox page" : "Compact view", icon: MessageCircle },
    { label: "Profile completion", value: `${percent}%`, hint: `${completed} of 4 profile fields`, icon: UserRound },
  ];
  return <div className="ims-overview">
    <header className="ims-page-heading"><div><h1>Community overview</h1><p>Welcome, {profile.displayName || session.user.name}. Connect with the ESITH IMS alumni community.</p></div><Link href="/members" prefetch={false} className="ims-outline-button">Explore directory <ArrowRight size={15} aria-hidden="true"/></Link></header>
    <div className="ims-snapshot-toolbar"><p>{snapshot ? "Community snapshot · no background refresh" : "Compact view · no directory or inbox reads."}</p><Link href={snapshot ? "/dashboard?snapshot=0" : "/dashboard"} prefetch={false} className="ims-outline-button">{snapshot ? "Compact view" : "Load community snapshot"} <ArrowRight size={14} aria-hidden="true"/></Link></div>
    <div className="ims-overview-grid">
      <div className="ims-overview-main">
        <section className="ims-metrics" aria-label="Workspace snapshot">{stats.map(({ label,value,hint,icon:Icon }) => <div className="ims-metric" key={label}><div className="ims-metric-label">{label}<Icon size={18} aria-hidden="true"/></div><strong>{value}</strong><small>{hint}</small></div>)}</section>
        <section className="ims-panel" aria-labelledby="cohort-heading"><div className="ims-section-heading"><div><h2 id="cohort-heading">Alumni by graduation year</h2><p>Distribution within the current directory page</p></div><Link href="/members" prefetch={false} className="ims-text-link">Directory <ArrowRight size={14} aria-hidden="true"/></Link></div>{cohorts.length ? <div className="ims-chart" role="group" aria-label="Graduation year counts">{cohorts.map(([year,count]) => <div className="ims-chart-row" key={year}><span>{year}</span><div className="ims-chart-track"><div className="ims-chart-bar" style={{width:`${count/max*100}%`}}/></div><strong>{count}</strong></div>)}</div> : <p className="ims-empty">{directory ? "Graduation years will appear as members complete their profiles." : snapshot ? "Directory snapshot temporarily unavailable." : "Load the community snapshot to see graduation-year distribution."}</p>}</section>
        <section aria-labelledby="discovery-heading"><div className="ims-section-heading ims-section-outside"><div><h2 id="discovery-heading">Professional alumni discovery</h2><p>Explore fellow graduates across programs and generations.</p></div><Link href="/members" prefetch={false} className="ims-text-link">View directory <ArrowRight size={14} aria-hidden="true"/></Link></div>{directory ? <MemberDirectoryTable members={members.slice(0,5)} showAvatars={true}/> : <div className="ims-panel ims-empty">{snapshot ? "Directory temporarily limited. Try again shortly." : "Browse the directory for alumni, or load the community snapshot for a compact preview."}</div>}</section>
      </div>
      <aside className="ims-overview-side" aria-label="Your workspace activity">
        <section className="ims-panel"><div className="ims-section-heading"><h2>Messages</h2><Link href="/messages" prefetch={false} className="ims-text-link">View all <ArrowRight size={14} aria-hidden="true"/></Link></div>{!inbox ? <p className="ims-empty">{snapshot ? "Inbox temporarily limited." : "Open Messages for your conversations, or load the community snapshot for a preview."}</p> : !conversations.length ? <p className="ims-empty">No conversations yet. Start from a member profile.</p> : <div className="ims-inbox-list">{conversations.slice(0,5).map(c => <Link key={c.conversationId} href={`/messages?c=${encodeURIComponent(c.conversationId)}`} prefetch={false} className="ims-inbox-row"><MemberAvatar userId={c.otherMember.id} displayName={c.otherMember.displayName} hasAvatar={c.otherMember.hasAvatar} version={c.otherMember.avatarVersion} size="sm"/><div className="ims-inbox-copy"><strong>{c.otherMember.displayName}</strong><span>{c.lastMessage ? `${c.lastMessage.senderUserId === session.user.id ? "You: " : ""}${c.lastMessage.body}` : "No messages yet"}</span></div>{c.unreadCount > 0 && <span className="ims-unread" aria-label={`${c.unreadCount} unread`}>{c.unreadCount}</span>}</Link>)}</div>}</section>
        <section className="ims-panel"><div className="ims-section-heading"><h2>Your profile</h2><Link href="/profile" prefetch={false} className="ims-text-link">Edit <ArrowRight size={14} aria-hidden="true"/></Link></div><div className="ims-profile-summary"><div className="ims-person"><MemberAvatar userId={profile.userId} displayName={profile.displayName} hasAvatar={Boolean(profile.avatarUrl)} version={profile.updatedAt.toISOString()} size="md"/><div className="min-w-0"><strong className="block truncate">{profile.displayName}</strong><p>{profile.program || "ESITH IMS"}{profile.graduationYear ? ` · ${profile.graduationYear}` : ""}</p></div></div><div className="ims-progress-label"><span>Profile completion</span><strong>{percent}%</strong></div><progress className="ims-progress" value={completed} max={fields.length} aria-label="Profile completion"/><p>A complete profile helps other alumni find you.</p><div className="ims-progress-label"><span>Professional details</span><strong>{professionalCompleted}/4</strong></div><progress className="ims-progress" value={professionalCompleted} max={4} aria-label="Professional details completion"/><p>Add your career and skills so members can find you.</p><Link href="/members?mentorship=open" prefetch={false} className="ims-text-link">Find a mentor <ArrowRight size={14} aria-hidden="true"/></Link></div></section>
        <section className="ims-panel"><div className="ims-section-heading"><h2>Account & privacy</h2><ShieldCheck size={18} aria-hidden="true"/></div><div className="ims-profile-summary"><p>Your account is active. Manage your information and account data.</p><Link href="/account-privacy" prefetch={false} className="ims-text-link">Privacy settings <ArrowRight size={14} aria-hidden="true"/></Link></div></section>
      </aside>
    </div>
  </div>;
}
