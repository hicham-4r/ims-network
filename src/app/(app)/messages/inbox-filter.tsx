"use client";
import { useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import styles from "./messages.module.css";

type Entry = { id: string; name: string; content: ReactNode };
export function InboxFilter({ entries, empty }: { entries: Entry[]; empty: ReactNode }) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLocaleLowerCase();
  const visible = term ? entries.filter(entry => entry.name.toLocaleLowerCase().includes(term)) : entries;
  return <><label className={styles.inboxSearch}><Search size={16} aria-hidden="true"/><span className="sr-only">Filter this inbox page</span><input type="search" maxLength={80} value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a conversation…"/></label><nav className={styles.conversationList} aria-label="Conversations on this page">{entries.length === 0 ? empty : visible.length === 0 ? <p className={styles.emptySidebar} role="status">No matching conversations on this page.</p> : visible.map(entry => <div key={entry.id}>{entry.content}</div>)}</nav></>;
}
