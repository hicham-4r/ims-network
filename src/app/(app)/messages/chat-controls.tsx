"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import type { FormEvent } from "react";

import { useRouter } from "next/navigation";

import {
  markChatRead,
  sendChatMessage,
} from "./actions";

import styles from "./messages.module.css";

export function MessageComposer({
  conversationId,
}: {
  conversationId: string;
}) {
  const router = useRouter();

  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Keep the same UUID if a network failure makes
  // the client uncertain whether a send succeeded.
  const retryId = useRef<string | null>(null);

  // Synchronous guard against repeated submissions
  // before React updates the pending state.
  const inFlight = useRef(false);

  function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const text = body.trim();

    if (
      inFlight.current ||
      text.length < 1 ||
      text.length > 2000
    ) {
      return;
    }

    inFlight.current = true;
    setError(null);

    const clientMessageId =
      retryId.current ?? crypto.randomUUID();

    retryId.current = clientMessageId;

    startTransition(async () => {
      try {
        const result = await sendChatMessage({
          conversationId,
          body: text,
          clientMessageId,
        });

        if (!result.ok) {
          setError(result.message);
          return;
        }

        retryId.current = null;
        setBody("");

        // Return to the latest-message page after sending.
        router.replace(
          `/messages?c=${encodeURIComponent(conversationId)}`,
        );

        router.refresh();
      } catch {
        // Preserve the draft and UUID for a safe retry.
        setError(
          "The message could not be confirmed. Please retry.",
        );
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <form
      className={styles.composer}
      onSubmit={handleSubmit}
    >
      <div className={styles.composerMain}>
        <label
          htmlFor="ims-message-body"
          className={styles.composerLabel}
        >
          Write a message
        </label>

        <textarea
          id="ims-message-body"
          className={styles.composerInput}
          value={body}
          onChange={(event) => {
            if (!inFlight.current) {
              retryId.current = null;
              setBody(event.target.value);
              setError(null);
            }
          }}
          maxLength={2000}
          rows={2}
          disabled={isPending}
          placeholder="Write a message to this IMS member..."
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? "ims-message-error" : undefined
          }
        />

        <div className={styles.composerMeta}>
          <span>
            Private conversation
          </span>
          <span>{body.length}/2000</span>
        </div>

        {error && (
          <p
            id="ims-message-error"
            role="alert"
            className={styles.composerError}
          >
            {error}
          </p>
        )}
      </div>

      <button
        type="submit"
        className={styles.sendButton}
        disabled={isPending || body.trim().length === 0}
      >
        {isPending ? "Sending..." : "Send"}
      </button>
    </form>
  );
}

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
  const router = useRouter();
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

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some(
          (entry) => entry.isIntersecting,
        );

        if (!visible) {
          // A later visibility entry may retry a failed request.
          canTryOnEntry = true;
          return;
        }

        if (
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
              router.refresh();
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
      },
      { threshold: 0.1 },
    );

    observer.observe(element);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [
    conversationId,
    messageId,
    unreadCount,
    router,
  ]);
  return (
    <span
      ref={elementRef}
      className={styles.readSentinel}
      aria-hidden="true"
    />
  );
}
