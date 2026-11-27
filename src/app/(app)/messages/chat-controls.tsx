"use client";

import { useEffect, useRef } from "react";
import { markChatRead } from "./actions";
import styles from "./messages.module.css";

// Update the read position only when the latest
// message area actually becomes visible on screen.
export function ReadTracker({
  conversationId,
  messageId,
  unreadCount,
}: {
  conversationId: string;
  messageId: string;
  unreadCount: number;
}) {
  const elementRef = useRef<HTMLSpanElement | null>(null);
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (unreadCount <= 0) {
      return;
    }

    const element = elementRef.current;

    if (!element) {
      return;
    }

    const key = `${conversationId}:${messageId}`;

    let cancelled = false;
    let inFlight = false;
    let canTryOnEntry = true;

    let visible = false;
    const tryRead = () => {

        if (!visible) {
          // A later visibility entry may retry a failed request.
          canTryOnEntry = true;
          return;
        }

        if (
          document.visibilityState !== "visible" ||
          !canTryOnEntry ||
          inFlight ||
          attempted.current === key
        ) {
          return;
        }

        canTryOnEntry = false;
        inFlight = true;
        attempted.current = key;

        void markChatRead({
          conversationId,
          messageId,
        })
          .then((result) => {
            if (cancelled) {
              return;
            }

            if (result.ok) {
              observer.disconnect();
              return;
            }

            // Failed requests may be retried on the
            // next visibility entry, not in a busy loop.
            if (attempted.current === key) {
              attempted.current = null;
            }
          })
          .catch(() => {
            if (
              !cancelled &&
              attempted.current === key
            ) {
              attempted.current = null;
            }
          })
          .finally(() => {
            inFlight = false;
          });
    };
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      tryRead();
    }, { threshold: 0.1 });
    document.addEventListener("visibilitychange", tryRead);

    observer.observe(element);

    return () => {
      cancelled = true;
      observer.disconnect();
      document.removeEventListener("visibilitychange", tryRead);
    };
  }, [
    conversationId,
    messageId,
    unreadCount,
  ]);
  return (
    <span
      ref={elementRef}
      className={styles.readSentinel}
      aria-hidden="true"
    />
  );
}
