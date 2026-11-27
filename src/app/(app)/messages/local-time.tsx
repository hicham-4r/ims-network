"use client";
import { useSyncExternalStore } from "react";
const subscribe = () => () => {};
const client = () => true;
const server = () => false;
export function LocalTime({ iso, compact = false }: { iso: string; compact?: boolean }) {
  const mounted = useSyncExternalStore(subscribe, client, server);
  const date = new Date(iso);
  const text = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", ...(mounted ? {} : {timeZone: "UTC"}) }).format(date);
  const title = mounted ? date.toLocaleString() : date.toISOString();
  return <time dateTime={iso} title={title}>{text}{!mounted && !compact ? " UTC" : ""}</time>;
}
