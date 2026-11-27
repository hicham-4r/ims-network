"use client";

import { useEffect, useRef, useState, useTransition, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { ArrowUp, Reply, Smile, X, ChevronDown, Check, CheckCheck, Clock, RefreshCw, Search, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { REACTIONS, quotePreview, type Reaction } from "@/lib/chat-interactions";
import { sendChatMessage, reactToChatMessage } from "./actions";
import { ActivityIndicator, useChatActivity } from "./chat-activity";
import { ReportControl } from "./report-control";
import { DeliveryTracker } from "./delivery-tracker";
import { ReadTracker } from "./chat-controls";
import { chatDayKey, chatDayLabel } from "@/lib/chat-calendar";
import { LocalTime } from "./local-time";
import { messageStatus, retryPayload, unresolvedMessage, threadRowKey, type PendingMessage, type ThreadMessage } from "./chat-thread-core";
import styles from "./messages.module.css";

const subscribeCalendar = () => () => {};
const localCalendar = () => true;
const serverCalendar = () => false;

type Props = {
  conversationId: string;
  actorId: string;
  activityScope: string | null;
  messages: ThreadMessage[];
  olderPage: boolean;
  unreadCount: number;
  historyLinks: ReactNode;
};

export function ChatThread({ conversationId, actorId, activityScope, messages, olderPage, unreadCount, historyLinks }: Props) {
  const activity = useChatActivity(conversationId, activityScope);
  const router = useRouter();
  const localDates = useSyncExternalStore(subscribeCalendar, localCalendar, serverCalendar);
  const [body, setBody] = useState("");
  const [reply, setReply] = useState<PendingMessage["reply"]>();
  const [reactionMenu, setReactionMenu] = useState<string | null>(null);
  const [reactionBusy, setReactionBusy] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const reactionLock = useRef(false);
  const [query, setQuery] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [refreshPending, startRefresh] = useTransition();
  const [pending, setPending] = useState<PendingMessage | null>(null);
  const busy = useRef(false);
  const history = useRef<HTMLDivElement>(null);
  const followBottom = useRef(true);
  const outstanding = unresolvedMessage(pending, messages, actorId);
  const term = query.trim().toLocaleLowerCase();
  const visible = term ? messages.filter(message => message.body.toLocaleLowerCase().includes(term)) : messages;
  const newest = messages.at(-1);

  useEffect(() => {
    const node = history.current;
    if (node && !olderPage && !term && followBottom.current) node.scrollTop = node.scrollHeight;
  }, [newest?.id, outstanding?.clientMessageId, outstanding?.status, olderPage, term]);

  useEffect(() => {
    const node = history.current;
    if (!node || olderPage || term || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (followBottom.current && node.clientHeight > 0) node.scrollTop = node.scrollHeight;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [olderPage, term]);

  function refresh() {
    if (!refreshPending) startRefresh(() => router.refresh());
  }

  async function submit(item: PendingMessage) {
    if (busy.current) return;
    busy.current = true;
    followBottom.current = true;
    setPending({ ...item, status: "sending", error: undefined });
    try {
      const result = await sendChatMessage(retryPayload(conversationId, item));
      if (result.ok) {
        setPending({ ...item, status: "sent", messageId: result.messageId, error: undefined });
        // The server action revalidates /messages. Do not refresh a second time.
      } else {
        setPending({ ...item, status: "rejected", error: result.message });
      }
    } catch {
      setPending({ ...item, status: "uncertain", wasUncertain: true, error: "Send not confirmed. Retry safely with the same message ID." });
    } finally {
      busy.current = false;
    }
  }

  async function react(messageId: string, reaction: Reaction | null) {
    if (reactionLock.current) return;
    reactionLock.current = true; setReactionBusy(true); setReactionMenu(null); setLocalError(null);
    try {
      const result = await reactToChatMessage({ conversationId, messageId, reaction });
      if (!result.ok) setLocalError("Reaction could not be saved. Try again shortly.");
    } catch { setLocalError("Reaction could not be confirmed. Refresh before trying again."); }
    finally { reactionLock.current = false; setReactionBusy(false); }
  }
  function selectReply(message: ThreadMessage) {
    setReply({id: message.id, body: quotePreview(message.body), own: message.senderUserId === actorId});
    composerRef.current?.focus();
  }
  function jumpToLatest() { followBottom.current = true; setAtBottom(true); if (history.current) history.current.scrollTop = history.current.scrollHeight; }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = body.trim();
    if (olderPage || outstanding || busy.current || !text || text.length > 2000) return;
    // Do not silently fall back to a weak identifier in insecure browser contexts.
    if (typeof crypto.randomUUID !== "function") { setLocalError("Use a secure connection to send messages."); return; }
    setLocalError(null);
    const item: PendingMessage = { clientMessageId: crypto.randomUUID(), body: text, createdAt: new Date().toISOString(), status: "sending", ...(reply ? {reply} : {}) };
    setReply(undefined);
    setBody("");
    setQuery("");
    void submit(item);
  }

  return <>
    {!olderPage && <DeliveryTracker conversationId={conversationId} actorId={actorId} messages={messages}/>}
    <div className={styles.threadTools}>
      <label className={styles.historySearch}><Search size={15} aria-hidden="true"/><span className="sr-only">Search loaded messages</span><input type="search" maxLength={100} value={query} onChange={event => setQuery(event.target.value)} placeholder="Find in loaded messages…"/></label>
      <button type="button" className={styles.threadButton} disabled={refreshPending} onClick={refresh} aria-label={refreshPending ? "Refreshing conversation" : "Refresh conversation"} title="Refresh conversation"><RefreshCw size={16} className={refreshPending ? styles.refreshing : undefined} aria-hidden="true"/></button>
    </div>
    <div ref={history} className={styles.history} tabIndex={0} role="region" aria-label="Conversation history" onScroll={event => { const node = event.currentTarget; followBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 90; setAtBottom(followBottom.current); }}>
      {historyLinks}
      {visible.length === 0 && !outstanding ? <div className={styles.noMessages}><h3>{term ? "No matching messages" : "Start the conversation"}</h3><p>{term ? "Search covers only the messages on this page." : "Say hello to your fellow alumnus."}</p></div> : null}
      <ol className={styles.messageList} aria-label="Messages">
        {[...visible.map((message, index) => {
          const own = message.senderUserId === actorId;
          const previous = visible[index - 1];
          const day = chatDayKey(message.createdAt, localDates);
          const newDay = !previous || chatDayKey(previous.createdAt, localDates) !== day;
          const grouped = previous && !newDay && previous.senderUserId === message.senderUserId && new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 120000;
          const status = messageStatus(message, actorId);
          return <li key={threadRowKey(message, actorId)} data-grouped={grouped ? "true" : undefined} className={own ? `${styles.messageRow} ${styles.ownRow}` : styles.messageRow}>
            {newDay && <div className={styles.dayDivider}><span>{chatDayLabel(message.createdAt, localDates)}</span></div>}
            <div className={own ? `${styles.bubble} ${styles.ownBubble}${pending?.clientMessageId === message.clientMessageId && pending ? ` ${styles.sendMotion}` : ""}` : styles.bubble}>{message.reply && <div className={styles.quote}><strong>{message.reply.own ? "You" : "Member"}</strong><span>{message.reply.body}</span></div>}<p>{message.body}</p><div className={styles.messageMeta}><LocalTime iso={message.createdAt}/>{status && <span className={styles.receipt} data-read={status === "Read"} title={status === "Read" ? "Recipient read cursor has reached this message" : status === "Delivered" ? "Recipient browser acknowledged this message" : "Saved on the server; browser delivery not confirmed"}>{status !== "Sent" ? <CheckCheck size={14} aria-hidden="true"/> : <Check size={14} aria-hidden="true"/>}<span>{status}</span></span>}</div>
            {(message.myReaction || message.peerReaction) && <div className={styles.reactionBadges}>{message.myReaction && <button type="button" disabled={reactionBusy} onClick={() => void react(message.id, null)} aria-label="Remove your reaction" title="Remove your reaction">{REACTIONS[message.myReaction]}</button>}{message.peerReaction && <span aria-label="Other member reaction">{REACTIONS[message.peerReaction]}</span>}</div>}
            <div className={styles.messageActions}>
              {!own && <ReportControl conversationId={conversationId} messageId={message.id}/>}
              {!olderPage && !outstanding && <button type="button" onClick={() => selectReply(message)} aria-label="Reply to message" title="Reply"><Reply size={15}/></button>}
              <button type="button" disabled={reactionBusy} onClick={() => setReactionMenu(reactionMenu === message.id ? null : message.id)} aria-expanded={reactionMenu === message.id} aria-label="Choose reaction" title="React"><Smile size={15}/></button>
            </div>
            {reactionMenu === message.id && <div className={styles.reactionPicker} role="group" aria-label="Choose reaction" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setReactionMenu(null); } }}>{(Object.keys(REACTIONS) as Reaction[]).map(value => <button key={value} type="button" disabled={reactionBusy} aria-label={value} aria-pressed={message.myReaction === value} onClick={() => void react(message.id, message.myReaction === value ? null : value)}>{REACTIONS[value]}</button>)}<button type="button" onClick={() => setReactionMenu(null)} aria-label="Close reactions"><X size={15}/></button></div>}
            </div>
          </li>;
        }), ...(outstanding && !term ? [<li key={`own:${outstanding.clientMessageId}`} className={`${styles.messageRow} ${styles.ownRow}`}><div className={`${styles.bubble} ${styles.ownBubble} ${styles.pendingBubble} ${styles.sendMotion}`} data-state={outstanding.status}>{outstanding.reply && <div className={styles.quote}><strong>{outstanding.reply.own ? "You" : "Member"}</strong><span>{outstanding.reply.body}</span></div>}<p>{outstanding.body}</p><div className={styles.messageMeta} role="status">{outstanding.status === "sending" ? <><Clock size={13} aria-hidden="true"/> Sending…</> : outstanding.status === "sent" ? <><Check size={13} aria-hidden="true"/> Saved · syncing</> : <><AlertCircle size={13} aria-hidden="true"/> {outstanding.status === "uncertain" ? "Unconfirmed" : "Not sent"}</>}</div></div></li>] : [])]}
      </ol>
      {!olderPage && !term && newest && <ReadTracker conversationId={conversationId} messageId={newest.id} unreadCount={unreadCount}/>}
    </div>
    <ActivityIndicator peer={activity.peer}/>
    {!atBottom && !olderPage && !term && <button type="button" className={styles.jumpLatest} onClick={jumpToLatest}><ChevronDown size={15}/> Latest messages</button>}
    {outstanding && outstanding.error && <div className={styles.retryPanel} role="alert"><span>{outstanding.error}</span><button type="button" className={styles.threadButton} onClick={() => void submit(outstanding)}>Retry same message</button>{outstanding.status === "rejected" && !outstanding.wasUncertain && <button type="button" className={styles.threadButton} onClick={() => {setBody(outstanding.body);setReply(outstanding.reply);setPending(null);}}>Edit draft</button>}</div>}
    {outstanding?.status === "sent" && <div className={styles.retryPanel} role="status">Saved. Waiting for the conversation to sync. <button type="button" className={styles.threadButton} disabled={refreshPending} onClick={refresh}>Refresh</button></div>}
    {localError && <p className={styles.retryPanel} role="alert">{localError}</p>}
    {olderPage ? <div className={styles.retryPanel}>Return to latest messages to send a reply.</div> : <form className={styles.composer} onSubmit={handleSubmit}>
      <div className={styles.composerMain}>{reply && <div className={styles.replyDraft}><div className={styles.quote}><strong>Replying to {reply.own ? "your message" : "member"}</strong><span>{reply.body}</span></div><button type="button" className={styles.threadButton} onClick={() => setReply(undefined)} aria-label="Cancel reply"><X size={15}/></button></div>}<label className="sr-only" htmlFor="ims-message-body">Write a message</label><textarea ref={composerRef} id="ims-message-body" className={styles.composerInput} value={body} disabled={Boolean(outstanding)} onChange={event => {setBody(event.target.value); if(event.target.value.trim()) activity.signal("typing");}} maxLength={2000} rows={1} placeholder="Write a message…" onKeyDown={event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {event.preventDefault();event.currentTarget.form?.requestSubmit();} }}/><div className={styles.composerMeta}><span>Ctrl / ⌘ + Enter to send</span>{activityScope && <label className={styles.activityToggle}><input type="checkbox" checked={activity.share} onChange={event => activity.toggle(event.target.checked)}/> Share typing &amp; chat activity</label>}<span>{body.length}/2000</span></div></div>
      <button type="submit" className={styles.sendButton} disabled={Boolean(outstanding) || !body.trim()}><ArrowUp size={17} className={styles.sendArrow} aria-hidden="true"/> Send</button>
    </form>}
  </>;
}
