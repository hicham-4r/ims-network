"use client";
import { useEffect, useRef, useState } from "react";
import { signalChatActivity } from "./actions";
import type { ChatActivityFrame } from "./realtime-client-core";
import styles from "./messages.module.css";
export function useChatActivity(conversationId: string, scope: string | null) {
  const [share, setShare] = useState(false);
  const [peer, setPeer] = useState<"typing" | "active" | null>(null);
  const lastTyping = useRef(0);
  const lastActive = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!scope) return;
    let timer: number | undefined;
    let latestExpiry = 0;
    function receive(event: Event) {
      const frame = (event as CustomEvent<ChatActivityFrame>).detail;
      if (!frame || frame.scope !== scope || frame.expiresAt <= Date.now() || frame.expiresAt < latestExpiry && frame.kind !== "typing") return;
      if (timer !== undefined) window.clearTimeout(timer);
      latestExpiry = frame.expiresAt;
      setPeer(frame.kind);
      timer = window.setTimeout(() => setPeer(null), Math.max(0, frame.expiresAt - Date.now()));
    }
    function visibility() { if (document.visibilityState !== "visible") { if (timer !== undefined) window.clearTimeout(timer); setPeer(null); latestExpiry = 0; } }
    window.addEventListener("ims-chat-activity", receive);
    document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("ims-chat-activity", receive); document.removeEventListener("visibilitychange", visibility); if (timer !== undefined) window.clearTimeout(timer); };
  }, [scope]);
  function signal(kind: "typing" | "active", enabled = share) {
    const last = kind === "typing" ? lastTyping : lastActive;
    if (!scope || !enabled || inFlight.current || document.visibilityState !== "visible" || Date.now() - last.current < (kind === "typing" ? 10_000 : 45_000)) return;
    last.current = Date.now(); inFlight.current = true;
    void signalChatActivity({conversationId, kind}).catch(() => {}).finally(() => {inFlight.current = false;});
  }
  return {share, toggle(value: boolean) {setShare(value); if(value) signal("active", true);}, signal, peer};
}
export function ActivityIndicator({peer}: {peer: "typing" | "active" | null}) {
  if (!peer) return null;
  return <div className={styles.activityIndicator} role="status">{peer === "typing" ? <><span className={styles.typingDots} aria-hidden="true"><i/><i/><i/></span> Member is typing…</> : <><span className={styles.activityDot} aria-hidden="true"/> Recently active in this chat</>}</div>;
}
