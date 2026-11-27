import { getMessageNotificationHistory } from "@/server/messaging/notification-history";
import { Suspense } from "react";
import Link from "next/link";
import { Bell, ArrowRight } from "lucide-react";
import { requireActiveMemberPage } from "@/server/account-state/routing";
import { getConversationInbox, InboxError } from "@/server/messaging/inbox";
import { MessagingReadBudgetError } from "@/server/messaging/read-budget";
import { notFound } from "next/navigation";
import { MemberAvatar } from "@/components/members/member-avatar";
import { RefreshNotifications } from "./refresh-notifications";
import { LocalTime } from "../messages/local-time";

export const metadata = { title: "Notifications | IMS Network" };
type Props = { searchParams: Promise<{ cursor?: string | string[]; view?: string | string[]; before?: string | string[] }> };
export default function NotificationsPage(props: Props) {
  return <Suspense fallback={<p role="status" className="ims-empty">Loading notifications…</p>}><NotificationsContent {...props}/></Suspense>;
}
async function NotificationsContent({ searchParams }: Props) {
  await requireActiveMemberPage();
  const params = await searchParams;
  if (params.view === "history") {
    const before = typeof params.before === "string" ? params.before : undefined;
    let history: Awaited<ReturnType<typeof getMessageNotificationHistory>> | null=null;
    try {history=await getMessageNotificationHistory(before);} catch(error) {if(!(error instanceof MessagingReadBudgetError)) throw error;}
    return <div className="ims-overview ims-notifications"><header className="ims-page-heading"><div><h1>Notification history</h1><p>Persistent incoming message activity, without exposing message content.</p></div><RefreshNotifications/></header><section className="ims-panel"><div className="ims-notification-footer"><Link prefetch={false} href="/notifications" className="ims-outline-button">Unread conversations</Link><Link prefetch={false} href="/notifications?view=history" aria-current="page" className="ims-outline-button">Message history</Link></div>{!history ? <p className="ims-empty">Temporarily limited. Try again shortly.</p> : !history.items.length ? <p className="ims-empty">No incoming messages on this page.</p> : <div className="ims-inbox-list">{history.items.map(item=><Link prefetch={false} className="ims-inbox-row" key={item.id} href={`/messages?c=${encodeURIComponent(item.conversationId)}`}><Bell size={16} aria-hidden="true"/><div className="ims-inbox-copy"><strong>{item.name}</strong><span>{item.unread ? "Unread message" : "Message received"}</span></div><LocalTime iso={item.createdAt}/><ArrowRight size={15}/></Link>)}</div>}{history?.next && <div className="ims-notification-footer"><Link prefetch={false} href={`/notifications?view=history&before=${encodeURIComponent(history.next)}`}>Older notifications</Link></div>}</section></div>;
  }
  const showAll = params.view === "all";
  const raw = params.cursor;
  const cursor = typeof raw === "string" && raw ? raw : undefined;
  let inbox: Awaited<ReturnType<typeof getConversationInbox>> | null = null;
  try { inbox = await getConversationInbox(cursor ? { cursor } : {}); }
  catch (error) { if (error instanceof InboxError) notFound(); if (!(error instanceof MessagingReadBudgetError)) throw error; }
  const unread = inbox?.conversations.filter(item => item.unreadCount > 0) ?? [];
  const visible = showAll ? inbox?.conversations ?? [] : unread;
  const pageHref = (next?: string, all = showAll) => `/notifications?${new URLSearchParams({ ...(next ? {cursor: next} : {}), ...(all ? {view: "all"} : {}) }).toString()}`;
  return <div className="ims-overview ims-notifications"><header className="ims-page-heading"><div><h1>Notifications</h1><p>Unread conversations on the current inbox page. Opening a conversation updates its read position.</p></div><RefreshNotifications/></header>
    <section className="ims-panel"><div className="ims-section-heading"><h2>{showAll ? "Conversation activity" : "Unread messages"}</h2><Bell size={19} aria-hidden="true"/></div>
      <div className="ims-notification-footer" aria-label="Notification view"><Link href={pageHref(cursor,false)} prefetch={false} aria-current={!showAll ? "page" : undefined} className="ims-outline-button">Unread ({unread.length})</Link><Link href={pageHref(cursor,true)} prefetch={false} aria-current={showAll ? "page" : undefined} className="ims-outline-button">All on this page</Link><Link href="/notifications?view=history" prefetch={false} className="ims-outline-button">Message history</Link></div>
      {!inbox ? <p className="ims-empty" role="status">Notifications temporarily limited. Try again shortly.</p> : !visible.length ? <p className="ims-empty">{showAll ? "No conversations on this page." : "No unread conversations on this page."}</p> : <div className="ims-inbox-list">{visible.map(item => <Link className="ims-inbox-row" key={item.conversationId} href={`/messages?c=${encodeURIComponent(item.conversationId)}`} prefetch={false}><MemberAvatar userId={item.otherMember.id} displayName={item.otherMember.displayName} hasAvatar={item.otherMember.hasAvatar} version={item.otherMember.avatarVersion} size="sm"/><div className="ims-inbox-copy"><strong>{item.otherMember.displayName}</strong><span>{item.unreadCount > 0 ? `${item.unreadCount} unread ${item.unreadCount === 1 ? "message" : "messages"}` : "Up to date"}</span></div>{item.lastMessage && <span className="ims-notification-time"><LocalTime iso={item.lastMessage.createdAt} compact/></span>}<ArrowRight size={15} aria-hidden="true"/></Link>)}</div>}
      <div className="ims-notification-footer">{cursor && <Link href={pageHref()} prefetch={false} className="ims-text-link">First page</Link>}{inbox?.hasMore && inbox.nextCursor && <Link href={pageHref(inbox.nextCursor)} prefetch={false} className="ims-text-link">Older conversations</Link>}<Link href="/messages" prefetch={false} className="ims-text-link">Open inbox <ArrowRight size={14} aria-hidden="true"/></Link></div>
    </section><p className="text-sm text-muted-foreground">This view is refreshed when opened. It does not poll in the background or send push notifications.</p></div>;
}
