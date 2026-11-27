"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createMessageRealtimeController } from "./realtime-client-core";

/** Mounted by the /messages layout, preserved across ?c= conversation switches. */
export function MessageRealtimeListener() {
  const router = useRouter();
  const [status, setStatus] = useState<"connecting" | "connected" | "paused" | "reconnecting" | "unavailable">("connecting");
  const [latestHref, setLatestHref] = useState<string | null>(null);

  useEffect(() => {
    // No local ws:// fallback, URL credentials, or global app socket.
    if (window.location.protocol !== "https:") return;

    const controller = createMessageRealtimeController({
      connect() {
        const ws = new WebSocket(`wss://${window.location.host}/api/ws`);
        return {
          onMessage(handler) {
            ws.addEventListener("message", (event) => handler(event.data));
          },
          onClose(handler) {
            ws.addEventListener("close", (event) => handler(event.code));
          },
          onError(handler) { ws.addEventListener("error", handler); },
          close(code, reason) { ws.close(code, reason); },
        };
      },
      schedule(callback, delayMs) { return window.setTimeout(callback, delayMs); },
      cancel(timer) { window.clearTimeout(timer); },
      onStatus: setStatus,
      onActivity: frame => window.dispatchEvent(new CustomEvent("ims-chat-activity", {detail: frame})),
      now: () => Date.now(),
      random: () => Math.random(),
      isVisible: () => document.visibilityState === "visible",
      reconcile(reason) {
        // Refresh from PostgreSQL, never from untrusted WS payloads.
        const params = new URLSearchParams(window.location.search);
        if (reason === "notice" && params.has("mh")) {
          // Do not silently move someone reading older messages.
          params.delete("mh");
          const query = params.toString();
          setLatestHref(query ? `/messages?${query}` : "/messages");
          // Reconcile inbox/unread state without changing the history cursor.
          router.refresh();
          return;
        }
        router.refresh();
      },
    });

    document.addEventListener("visibilitychange", controller.visibilityChanged);
    controller.start();
    return () => {
      document.removeEventListener("visibilitychange", controller.visibilityChanged);
      controller.stop();
    };
  }, [router]);

  return (<><div role="status" className="ims-realtime-status" data-connection={status}><span aria-hidden="true"/>{status === "connected" ? "Realtime socket connected" : status === "paused" ? "Realtime paused" : status === "unavailable" ? "Realtime unavailable · refresh manually" : status === "reconnecting" ? "Reconnecting…" : "Connecting…"}</div>{latestHref && <div role="status" className="mx-auto max-w-5xl px-4 py-3 text-sm">
      New messages may be available. {" "}
      <Link prefetch={false}
        href={latestHref}
        className="underline underline-offset-2"
        onClick={() => setLatestHref(null)}
      >
        Return to latest messages
      </Link>
    </div>}</>
  );
}
