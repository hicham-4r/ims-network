import { relayDiagnostic } from "./relay-diagnostics";

import {
  parseRelayFields,
  RELAY_BATCH_SIZE,
  RELAY_BLOCK_MS,
} from "./relay-protocol";

import {
  emptyReadDelayMs,
  failureRetryDelayMs,
} from "./relay-pacing";

export type StreamReadClient = {
  read(
    streamKey: string,
    afterId: string,
    blockMs: number,
    count: number,
  ): Promise<unknown>;
  disconnect(): void;
};

export type StreamReadFactory = () => Promise<StreamReadClient>;

/** Per-Function, in-memory counters; not provider-billed usage measurements. */
export type StreamReaderCounters = Readonly<{
  connectAttempts: number;
  openedConnections: number;
  readAttempts: number;
  emptyReplies: number;
  forwardedNotices: number;
  failedOperations: number;
  activeSubscriptions: number;
}>;

import type { ReceivedRelayNotice as Notice } from "./local-relay-router";

const streamIdPattern = /^[0-9]+-[0-9]+$/;
const recipientPattern = /^[A-Za-z0-9_-]{43}$/;

function idGreaterThan(a: string, b: string) {
  if (b === "$") return true;
  const [am, as] = a.split("-").map(BigInt);
  const [bm, bs] = b.split("-").map(BigInt);
  return am > bm || (am === bm && as > bs);
}

/** Redis XREAD reply: [[stream, [[id, [field, value, ...]], ...]]] */
export function decodeStreamRead(
  reply: unknown,
  expectedStream: string,
  afterId: string,
): { nextId: string; notices: Notice[] } {
  if (reply == null) {
    return { nextId: afterId, notices: [] };
  }

  if (!Array.isArray(reply) || reply.length !== 1) {
    throw new Error("Unexpected Redis stream response.");
  }

  const stream = reply[0];
  if (
    !Array.isArray(stream) ||
    stream.length !== 2 ||
    stream[0] !== expectedStream ||
    !Array.isArray(stream[1]) ||
    stream[1].length > RELAY_BATCH_SIZE
  ) {
    throw new Error("Invalid Redis stream batch.");
  }

  let nextId = afterId;
  const notices: Notice[] = [];

  for (const item of stream[1]) {
    if (
      !Array.isArray(item) ||
      item.length !== 2 ||
      typeof item[0] !== "string" ||
      !streamIdPattern.test(item[0]) ||
      !idGreaterThan(item[0], nextId) ||
      !Array.isArray(item[1])
    ) {
      throw new Error("Invalid Redis stream entry.");
    }

    nextId = item[0];

    // A malformed notification is skipped, but its stream ID is consumed.
    // The durable message remains available from PostgreSQL.
    const fields = parseRelayFields(item[1]);
    if (fields) {
      const activity = fields.c && fields.k && fields.x ? { scope: fields.c, kind: fields.k, expiresAt: Number(fields.x) } : undefined;
      if (!activity || (activity.expiresAt > Date.now() && activity.expiresAt <= Date.now() + 60_000)) notices.push({ recipientKey: fields.r, eventId: fields.e, ...(activity ? {activity} : {}) });
    }
  }

  return { nextId, notices };
}

/**
 * One instance of this class per Function module, not per WebSocket.
 * No network traffic occurs until the first trusted recipient subscribes.
 */
export class SharedStreamReader {
  private readonly subscribers = new Map<string, number>();
  private activeSubscriptions = 0;
  private generation = 0;
  private task: Promise<void> | null = null;
  private activeClient: StreamReadClient | null = null;
  private interruptBackoff: (() => void) | null = null;
  private connectAttempts = 0;
  private openedConnections = 0;
  private readAttempts = 0;
  private emptyReplies = 0;
  private forwardedNotices = 0;
  private failedOperations = 0;

  constructor(
    private readonly streamKey: string,
    private readonly connect: StreamReadFactory,
    private readonly onNotice: (notice: Notice) => void,
  ) {
    if (!/^ims-network:v1:(development|preview|production):realtime:events$/.test(streamKey)) {
      throw new Error("Unexpected realtime stream key.");
    }
  }

  subscribe(recipientKey: string): () => void {
    if (!recipientPattern.test(recipientKey)) {
      throw new Error("Invalid recipient relay key.");
    }

    this.subscribers.set(
      recipientKey,
      (this.subscribers.get(recipientKey) ?? 0) + 1,
    );
    this.activeSubscriptions++;
    this.ensureRunning();

    let released = false;
    return () => {
      if (released) return;
      released = true;

      const count = this.subscribers.get(recipientKey);
      if (count === 1) this.subscribers.delete(recipientKey);
      else if (count !== undefined) this.subscribers.set(recipientKey, count - 1);

      this.activeSubscriptions--;
      if (this.activeSubscriptions === 0) this.stop();
    };
  }

  subscriptionCount() {
    return this.activeSubscriptions;
  }

  /** No IDs, secrets, private content, or network calls. Counts reset on cold start. */
  counters(): StreamReaderCounters {
    return {
      connectAttempts: this.connectAttempts,
      openedConnections: this.openedConnections,
      readAttempts: this.readAttempts,
      emptyReplies: this.emptyReplies,
      forwardedNotices: this.forwardedNotices,
      failedOperations: this.failedOperations,
      activeSubscriptions: this.activeSubscriptions,
    };
  }

  private active(generation: number) {
    return this.generation === generation && this.activeSubscriptions > 0;
  }

  private stop() {
    this.generation++;
    try { this.activeClient?.disconnect(); } catch { /* close best effort */ }
    this.interruptBackoff?.();
  }

  private ensureRunning() {
    if (this.activeSubscriptions === 0 || this.task) return;

    const generation = ++this.generation;
    const task = this.run(generation);
    this.task = task;

    const finished = () => {
      if (this.task !== task) return;
      this.task = null;
      // A subscriber could have arrived while a previous reader was closing.
      if (this.activeSubscriptions > 0) this.ensureRunning();
    };

    void task.then(finished, finished);
  }

  private async backoff(milliseconds: number) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.interruptBackoff = null;
        resolve();
      }, milliseconds);
      this.interruptBackoff = () => {
        clearTimeout(timer);
        this.interruptBackoff = null;
        resolve();
      };
    });
  }

  private async run(generation: number) {
    // Read new events only. Reconnected clients must reconcile from PG.
    let cursor = "$";
    let failures = 0;

    while (this.active(generation)) {
      let client: StreamReadClient | null = null;
      try {
        this.connectAttempts++;
        client = await this.connect();
        this.openedConnections++;
        if (!this.active(generation)) break;

        this.activeClient = client;

        while (this.active(generation)) {
          // An early empty XREAD must not become a tight, quota-draining loop.
          // A normal 30-second blocked read has zero extra waiting time.
          const readStartedAt = Date.now();
          this.readAttempts++;
          relayDiagnostic("relay_stream_read_started");
          const reply = await client.read(
            this.streamKey,
            cursor,
            RELAY_BLOCK_MS,
            RELAY_BATCH_SIZE,
          );
          if (!this.active(generation)) break;

          const previousCursor = cursor;
          const batch = decodeStreamRead(reply, this.streamKey, cursor);
          cursor = batch.nextId;
          failures = 0;

          // An unexpectedly early empty response (including an empty stream
          // array) still consumes a Redis read; pace it at the block interval.
          // A batch that advanced the cursor is NOT idle, even if malformed
          // relay fields were skipped. Stop cancels this wait on last detach.
          if (batch.nextId === previousCursor) {
            this.emptyReplies++;
            relayDiagnostic("relay_stream_empty");
            const delay = emptyReadDelayMs(Date.now() - readStartedAt);
            if (delay > 0) await this.backoff(delay);
            if (!this.active(generation)) break;
          }

          if (batch.notices.length > 0) relayDiagnostic("relay_stream_batch");
          for (const notice of batch.notices) {
            if (!this.active(generation)) break;
            if (!this.subscribers.has(notice.recipientKey)) {
              relayDiagnostic("relay_notice_unmatched");
              continue;
            }
            relayDiagnostic("relay_notice_matched");
            try {
              this.onNotice(notice);
              // Forwarded to the local router, not confirmed WebSocket delivery.
              this.forwardedNotices++;
            } catch {
              // One failed local send must not terminate the Redis reader.
            }
          }
        }
      } catch {
        if (!this.active(generation)) break;
        this.failedOperations++;
        if (client) relayDiagnostic("relay_stream_read_failed");
        // Failures can be immediate (bad credentials, network failure).
        // Cap retry traffic across many Function instances; recovery remains
        // automatic and PostgreSQL remains authoritative for missed events.
        failures = Math.min(failures + 1, 16);
        await this.backoff(failureRetryDelayMs(failures));
      } finally {
        try { client?.disconnect(); } catch { /* close best effort */ }
        if (this.activeClient === client) this.activeClient = null;
      }
    }
  }
}
