import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requireActiveMemberPage } from "@/server/account-state/routing";
import {
  MessagingReadBudgetError,
} from "@/server/messaging/read-budget";
import {
  getConversationInbox,
  InboxError,
} from "@/server/messaging/inbox";
import {
  getConversationHistory,
  MessageHistoryError,
} from "@/server/messaging/history";

import { getActivityScope } from "@/server/messaging/activity";
import { ChatThread } from "./chat-thread";
import { ChatViewport, ConversationLink } from "./chat-viewport";

import {
  getSelectedConversationSummary,
} from "@/server/messaging/conversation-details";

import { MemberAvatar } from "@/components/members/member-avatar";

import { InboxFilter } from "./inbox-filter";
import { LocalTime } from "./local-time";
import styles from "./messages.module.css";
import MessagesLoading from "./loading";

export const metadata: Metadata = {
  title: "Messages | IMS Network",
};




type Query = {
  c?: string | string[];
  ib?: string | string[];
  mh?: string | string[];
};

function value(input: string | string[] | undefined) {
  return typeof input === "string" && input.length > 0
    ? input
    : undefined;
}

function makeHref(query: {
  c?: string;
  ib?: string;
  mh?: string;
}) {
  const parameters = new URLSearchParams();

  if (query.c) parameters.set("c", query.c);
  if (query.ib) parameters.set("ib", query.ib);
  if (query.mh) parameters.set("mh", query.mh);

  const encoded = parameters.toString();
  return encoded ? `/messages?${encoded}` : "/messages";
}

function ReadBudgetNotice() {
  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>IMS NETWORK</p>
          <h1>Messaging temporarily limited</h1>
          <p className={styles.subtitle} role="alert">
            Too many requests or temporary service unavailability.
            Please try again shortly.
          </p>
          <Link prefetch={false} href="/members" className={styles.navigationLink}>
            Return to alumni directory
          </Link>
        </div>
      </div>
    </main>
  );
}
async function MessagesContent({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const parameters = await searchParams;
  const requestedConversation = value(parameters.c);
  const inboxCursor = value(parameters.ib);
  const historyCursor = value(parameters.mh);

  const { session } = await requireActiveMemberPage();

  let inbox: Awaited<ReturnType<typeof getConversationInbox>>;

  try {
    inbox = await getConversationInbox(
      inboxCursor ? { cursor: inboxCursor } : {},
    );
  } catch (error) {
    if (error instanceof MessagingReadBudgetError) {
      return <ReadBudgetNotice />;
    }
    if (error instanceof InboxError) notFound();
    throw error;
  }

  const selectedId =
    requestedConversation ??
    inbox.conversations[0]?.conversationId;

  const selectedFromInbox = inbox.conversations.find(
    (entry) => entry.conversationId === selectedId,
  );

  // A newly created conversation may not appear
  // on the current paginated inbox page.
  const selected = selectedFromInbox ??
    (selectedId
      ? await getSelectedConversationSummary(selectedId)
      : null);

  if (selectedId && !selected) {
    notFound();
  }

  let history:
    | Awaited<ReturnType<typeof getConversationHistory>>
    | null = null;

  if (selectedId) {
    try {
      history = await getConversationHistory({
        conversationId: selectedId,
        ...(historyCursor ? { cursor: historyCursor } : {}),
      });
    } catch (error) {
      if (error instanceof MessagingReadBudgetError) {
        return <ReadBudgetNotice />;
      }
      if (error instanceof MessageHistoryError) notFound();
      throw error;
    }
  }

  const chronological = history
    ? [...history.messages].reverse()
    : [];

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <div>
          <h1>Messages</h1>
          <p className={styles.subtitle}>
            Your conversations with IMS alumni. <Link prefetch={false} href="/privacy" className="underline">Messaging privacy</Link>
          </p>
        </div>
        <span className={styles.privacy}>
          Private member messaging
        </span>
      </div>

      <ChatViewport key={`${requestedConversation ?? "inbox"}:${inboxCursor ?? ""}`} hasConversation={Boolean(selectedId)} initiallyChat={Boolean(requestedConversation)}>
      <div className={styles.shell}>
        <aside className={styles.sidebar} aria-label="Conversations">
          <div className={styles.sidebarHeader}>
            <div>
              <h2>Inbox</h2>
              <p>Recent conversations</p>
            </div>
            <span className={styles.pageCount}>
              {inbox.conversations.length}
            </span>
          </div>

          <InboxFilter empty={(
              <div className={styles.emptySidebar}>
                <div className={styles.emptyIcon}>✉</div>
                <strong>No conversations on this page</strong>
                <p>
                  Your conversations will appear here
                  when you connect with another member.
                </p>
              </div>
            )} entries={inbox.conversations.map((conversation) => {
                const active =
                  conversation.conversationId === selectedId;

                const name = conversation.otherMember.displayName;
                const preview = conversation.lastMessage;

                return { id: conversation.conversationId, name, content: (
                  <ConversationLink active={active}
                    key={conversation.conversationId}
                    href={makeHref({
                      c: conversation.conversationId,
                      ib: inboxCursor,
                    })}
                    className={
                      active
                        ? `${styles.conversation} ${styles.active}`
                        : styles.conversation
                    }
                  >
                    <MemberAvatar
                      userId={conversation.otherMember.id}
                      displayName={name}
                      hasAvatar={conversation.otherMember.hasAvatar}
                      version={conversation.otherMember.avatarVersion}
                      size="sm"
                    />
                    <span className={styles.conversationText}>
                      <span className={styles.conversationTop}>
                        <strong>{name}</strong>
                        {preview && (
                          <small><LocalTime iso={preview.createdAt} compact/></small>
                        )}
                      </span>
                      <span className={styles.conversationBottom}>
                        <span className={styles.preview}>
                          {preview
                            ? preview.senderUserId === session.user.id
                              ? `You: ${preview.body}`
                              : preview.body
                            : "No messages yet"}
                        </span>
                        {conversation.unreadCount > 0 && (
                          <span
                            className={styles.unread}
                            aria-label={`${conversation.unreadCount} unread`}
                          >
                            {conversation.unreadCount > 99
                              ? "99+"
                              : conversation.unreadCount}
                          </span>
                        )}
                      </span>
                    </span>
                  </ConversationLink>
                ) };
              })}/>

          <div className={styles.sidebarFooter}>
            {inboxCursor && (
              <Link prefetch={false} href="/messages" className={styles.navigationLink}>
                First inbox page
              </Link>
            )}
            {inbox.hasMore && inbox.nextCursor && (
              <Link prefetch={false}
                href={makeHref({
                  c: selectedId,
                  ib: inbox.nextCursor,
                })}
                className={styles.navigationLink}
              >
                Older conversations
              </Link>
            )}
          </div>
        </aside>

        <section className={styles.chat} aria-label="Message history">
          {!selectedId ? (
            <div className={styles.emptyChat}>
              <div className={styles.emptyIconLarge}>✉</div>
              <h2>Your conversations start here</h2>
              <p>
                Select an existing conversation to read your messages.
                Start a conversation from an alumni profile.
              </p>
            </div>
          ) : (
            <>
              <header className={styles.chatHeader}>
                {selected && (
                  <MemberAvatar
                    userId={selected.otherMember.id}
                    displayName={selected.otherMember.displayName}
                    hasAvatar={selected.otherMember.hasAvatar}
                    version={selected.otherMember.avatarVersion}
                    size="sm"
                  />
                )}
                <div className={styles.chatTitle}>
                  <strong>
                    {selected?.otherMember.displayName ?? "Conversation"}
                  </strong>
                  <small>Private conversation</small>
                </div>
                <span className={styles.secureLabel}>Members only</span>
              </header>

              <ChatThread key={`${selectedId}:${historyCursor ?? "latest"}`} conversationId={selectedId} activityScope={getActivityScope(selectedId, session.user.id)} actorId={session.user.id} messages={chronological} olderPage={Boolean(historyCursor)} unreadCount={selected?.unreadCount ?? 0} historyLinks={<>
                {historyCursor && (
                  <Link prefetch={false}
                    className={styles.navigationLink}
                    href={makeHref({
                      c: selectedId,
                      ib: inboxCursor,
                    })}
                  >
                    Return to latest messages
                  </Link>
                )}

                {history?.hasMore && history.nextCursor && (
                  <Link prefetch={false}
                    className={styles.olderMessages}
                    href={makeHref({
                      c: selectedId,
                      ib: inboxCursor,
                      mh: history.nextCursor,
                    })}
                  >
                    View older messages
                  </Link>
                )}

              </>}/>

            </>
          )}
        </section>
      </div>
      </ChatViewport>
    </main>
  );
}

export default function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  return (
    <Suspense
      fallback={<MessagesLoading/>}
    >
      <MessagesContent searchParams={searchParams} />
    </Suspense>
  );
}
