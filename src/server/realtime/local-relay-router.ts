import type { ActivityNotice, RealtimeNotice } from "./local-hub";
import { recipientRelayKey } from "./relay-protocol";

export type ReceivedRelayNotice = Readonly<{
  recipientKey: string;
  eventId: string;
  activity?: Omit<ActivityNotice, "type" | "eventId">;
}>;

type RecipientState = {
  userId: string;
  references: number;
  unsubscribe: () => void;
  seenIds: Set<string>;
};

export type RelayRouterDependencies = {
  prefix: string;
  secret: string;
  subscribeToRelay: (recipientKey: string) => () => void;
  deliverToUser: (
    userId: string,
    notice: RealtimeNotice,
  ) => number;
};

const EVENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECIPIENT_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_RECENT_EVENT_IDS = 64;

/**
 * Connects pseudonymous Redis recipient keys to local, authenticated users.
 *
 * Call attach() only AFTER Better Auth + ACTIVE-account checks and a
 * successful local WebSocket registration. Never accept a user ID from a
 * client frame. One Redis subscription is retained per local member, not
 * per socket. This module does not open a network connection itself.
 */
export class LocalRelayRouter {
  private readonly recipients = new Map<string, RecipientState>();
  private referenceCount = 0;

  constructor(private readonly deps: RelayRouterDependencies) {
    // Validate configuration before accepting any subscriber.
    recipientRelayKey("configuration-check", deps.prefix, deps.secret);
  }

  attach(userId: string): () => void {
    const key = recipientRelayKey(
      userId,
      this.deps.prefix,
      this.deps.secret,
    );
    const existing = this.recipients.get(key);

    if (existing && existing.userId !== userId) {
      // A collision must never route events across accounts.
      throw new Error("Relay recipient collision.");
    }

    if (existing) {
      existing.references++;
    } else {
      // subscribeToRelay may throw: only register state after success.
      const unsubscribe = this.deps.subscribeToRelay(key);
      this.recipients.set(key, {
        userId,
        references: 1,
        unsubscribe,
        seenIds: new Set(),
      });
    }

    this.referenceCount++;
    let released = false;

    return () => {
      if (released) return;
      released = true;

      const state = this.recipients.get(key);
      if (!state) return;
      this.referenceCount--;
      state.references--;
      if (state.references !== 0) return;

      this.recipients.delete(key);
      // No delivered event can find this member after the entry is removed.
      try {
        state.unsubscribe();
      } catch {
        // Reader cleanup is best effort; never retain an authorization map.
      }
    };
  }

  /** Called exclusively by the server-side validated Redis Stream reader. */
  onNotice(notice: ReceivedRelayNotice): number {
    if (
      !notice ||
      typeof notice.recipientKey !== "string" ||
      typeof notice.eventId !== "string" ||
      !RECIPIENT_KEY_PATTERN.test(notice.recipientKey) ||
      !EVENT_ID_PATTERN.test(notice.eventId)
    ) {
      return 0;
    }

    if (notice.activity && (!RECIPIENT_KEY_PATTERN.test(notice.activity.scope) || !["typing", "active"].includes(notice.activity.kind) || !Number.isSafeInteger(notice.activity.expiresAt) || notice.activity.expiresAt <= Date.now() || notice.activity.expiresAt > Date.now() + 60_000)) return 0;
    const state = this.recipients.get(notice.recipientKey);
    if (!state || state.seenIds.has(notice.eventId)) return 0;

    // Bounded per-recipient duplicate suppression. Delivery is an advisory
    // signal only; PostgreSQL reconciliation recovers missed notifications.
    state.seenIds.add(notice.eventId);
    if (state.seenIds.size > MAX_RECENT_EVENT_IDS) {
      const oldest = state.seenIds.values().next().value;
      if (oldest !== undefined) state.seenIds.delete(oldest);
    }

    try {
      return this.deps.deliverToUser(state.userId, notice.activity ? { type: "chat.activity", eventId: notice.eventId, ...notice.activity } : { type: "messages.changed", eventId: notice.eventId });
    } catch {
      return 0;
    }
  }

  activeMemberCount(): number {
    return this.recipients.size;
  }

  activeReferenceCount(): number {
    return this.referenceCount;
  }
}
