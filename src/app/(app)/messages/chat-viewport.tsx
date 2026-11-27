"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, MessageCircle } from "lucide-react";
import styles from "./messages.module.css";

const OpenConversation = createContext<() => void>(() => {});

export function ConversationLink({ href, active, className, children }: { href: string; active: boolean; className: string; children: ReactNode }) {
  const open = useContext(OpenConversation);
  return <Link href={href} prefetch={false} className={className} aria-current={active ? "page" : undefined} onClick={event => {if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) open();}}>{children}</Link>;
}

export function ChatViewport({ children, hasConversation, initiallyChat }: { children: ReactNode; hasConversation: boolean; initiallyChat: boolean }) {
  const [chat, setChat] = useState(initiallyChat && hasConversation);
  return <OpenConversation.Provider value={() => setChat(true)}><div className={styles.mobileViewport} data-chat={chat && hasConversation ? "true" : "false"}>
    {hasConversation && <div className={styles.mobileThreadSwitch}><button type="button" className={styles.threadButton} onClick={() => setChat(value => !value)}>{chat ? <ArrowLeft size={17} aria-hidden="true"/> : <MessageCircle size={17} aria-hidden="true"/>}{chat ? "Back to inbox" : "Open conversation"}</button></div>}
    {children}
  </div></OpenConversation.Provider>;
}
