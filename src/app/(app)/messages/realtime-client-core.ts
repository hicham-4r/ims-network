/**
 * Phase 16.19C: pure per-messaging-surface WebSocket lifecycle.
 * No React, environment secrets, PostgreSQL, or provider imports.
 * WebSocket frames are untrusted refresh hints, never message data.
 */
export type MessageSocket = {
  onMessage(handler: (data: unknown) => void): void;
  onClose(handler: (code: number) => void): void;
  onError(handler: () => void): void;
  close(code?: number, reason?: string): void;
};

export type ChatActivityFrame = {type: "chat.activity"; eventId: string; scope: string; kind: "typing" | "active"; expiresAt: number};

export type ReconcileReason = "ready" | "notice";

export type RealtimeDependencies = {
  connect(): MessageSocket;
  schedule(callback: () => void, delayMs: number): number;
  cancel(timer: number): void;
  now(): number;
  random(): number;
  isVisible(): boolean;
  reconcile(reason: ReconcileReason): void;
  onActivity?(frame: ChatActivityFrame): void;
  onStatus?(status: "connecting" | "connected" | "paused" | "reconnecting" | "unavailable"): void;
};

// An authenticated `ready` does not prove a durable connection. With the
// temporary server lifetime, resetting backoff on every `ready` creates a
// potentially unbounded rapid reconnect loop.
const MAX_BACKOFF_MS = 300_000;
const MAX_FAILURE_STREAK = 10;
const STABLE_CONNECTION_MS = 120_000;
// A transport can stall without emitting close/error. Do not leave one dead
// CONNECTING socket holding the tab's single-socket slot forever.
const HANDSHAKE_READY_TIMEOUT_MS = 15_000;
const MIN_RECONCILE_INTERVAL_MS = 1_500;
const MAX_SEEN_EVENTS = 128;
const EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRealtimeFrame(input: unknown):
  | { type: "ready" }
  | { type: "messages.changed"; eventId: string }
  | ChatActivityFrame
  | null {
  if (typeof input !== "string" || input.length > 512) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(input); } catch { return null; }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  if (record.type === "ready" && record.version === 1) {
    return { type: "ready" };
  }
  if (record.type === "messages.changed" &&
      typeof record.eventId === "string" && EVENT_ID.test(record.eventId)) {
    return { type: "messages.changed", eventId: record.eventId };
  }
  if (record.type === "chat.activity" && typeof record.eventId === "string" && EVENT_ID.test(record.eventId) && typeof record.scope === "string" && /^[A-Za-z0-9_-]{43}$/.test(record.scope) && (record.kind === "typing" || record.kind === "active") && typeof record.expiresAt === "number" && Number.isSafeInteger(record.expiresAt)) return {type: "chat.activity", eventId: record.eventId, scope: record.scope, kind: record.kind, expiresAt: record.expiresAt};
  return null;
}

/** One instance per mounted /messages layout, not per conversation. */
export function createMessageRealtimeController(deps: RealtimeDependencies) {
  let started = false;
  let permanentlyRejected = false;
  let socket: MessageSocket | null = null;
  let reconnectTimer: number | null = null;
  let handshakeTimer: number | null = null;
  let reconcileTimer: number | null = null;
  let pendingReason: ReconcileReason | null = null;
  let shortConnectionStreak = 0;
  let lastReconcileAt = Number.NEGATIVE_INFINITY;
  const seen = new Set<string>();

  function cancelReconnect() {
    if (reconnectTimer !== null) {
      deps.cancel(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function cancelHandshake() {
    if (handshakeTimer !== null) {
      deps.cancel(handshakeTimer);
      handshakeTimer = null;
    }
  }

  function cancelReconcile() {
    if (reconcileTimer !== null) {
      deps.cancel(reconcileTimer);
      reconcileTimer = null;
    }
    pendingReason = null;
  }

  function closeCurrent() {
    cancelHandshake();
    const previous = socket;
    socket = null; // Stale close/message events must be ignored.
    if (previous) {
      try { previous.close(1000, "Messaging surface inactive"); } catch { /* ignore */ }
    }
  }

  function scheduleReconciliation(reason: ReconcileReason) {
    if (!started || !deps.isVisible()) return;
    // If a real notice follows a ready frame, don't lose its new-message hint.
    pendingReason = pendingReason === "notice" || reason === "notice"
      ? "notice"
      : "ready";
    if (reconcileTimer !== null) return;
    const elapsed = deps.now() - lastReconcileAt;
    const delay = Math.max(250, MIN_RECONCILE_INTERVAL_MS - elapsed);
    reconcileTimer = deps.schedule(() => {
      reconcileTimer = null;
      if (!started || !deps.isVisible()) {
        pendingReason = null;
        return;
      }
      const current = pendingReason;
      pendingReason = null;
      if (!current) return;
      lastReconcileAt = deps.now();
      deps.reconcile(current);
    }, delay);
  }

  function recordShortConnection() {
    // Saturate the counter: no overflow, no tight reconnect loop during outages.
    shortConnectionStreak = Math.min(
      MAX_FAILURE_STREAK,
      shortConnectionStreak + 1,
    );
  }

  function retry() {
    if (!started || permanentlyRejected || !deps.isVisible() ||
        socket !== null || reconnectTimer !== null) return;

    const exponential = Math.min(
      MAX_BACKOFF_MS,
      1_000 * (2 ** Math.max(0, shortConnectionStreak - 1)),
    );
    const jitter = 0.8 + Math.min(1, Math.max(0, deps.random())) * 0.4;
    const delay = Math.round(exponential * jitter);
    reconnectTimer = deps.schedule(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function connect() {
    if (!started || permanentlyRejected || !deps.isVisible() ||
        socket !== null) return;
    deps.onStatus?.("connecting");
    let next: MessageSocket;
    try {
      next = deps.connect();
    } catch {
      recordShortConnection();
      deps.onStatus?.("reconnecting");
      retry();
      return;
    }
    socket = next;
    let readyAt: number | null = null;

    next.onMessage((data) => {
      if (!started || socket !== next || !deps.isVisible()) return;
      const frame = parseRealtimeFrame(data);
      if (!frame) return;
      if (frame.type === "ready") {
        if (readyAt === null) readyAt = deps.now();
        cancelHandshake();
        deps.onStatus?.("connected");
        // PostgreSQL remains authoritative after initial connect/reconnect.
        // Do NOT reset the failure streak merely because auth succeeded.
        scheduleReconciliation("ready");
        return;
      }
      if (seen.has(frame.eventId)) return;
      seen.add(frame.eventId);
      if (seen.size > MAX_SEEN_EVENTS) {
        const oldest = seen.values().next().value;
        if (oldest !== undefined) seen.delete(oldest);
      }
      if (frame.type === "chat.activity") {
        if (frame.expiresAt > deps.now() && frame.expiresAt <= deps.now() + 60_000) deps.onActivity?.(frame);
        return; // Temporary activity never triggers a database refresh.
      }
      scheduleReconciliation("notice");
    });
    next.onClose((code) => {
      if (socket !== next) return;
      cancelHandshake();
      socket = null;
      // 1008 is a policy/auth rejection. Do not reconnect this session.
      if (code === 1008) {
        permanentlyRejected = true;
        deps.onStatus?.("unavailable");
        cancelReconnect();
        return;
      }
      // A genuinely stable session resets the retry budget. Repeated short
      // sessions (including expected 1001 lifetime closures) back off instead
      // of constantly re-authenticating and reopening Vercel Functions.
      if (readyAt !== null && deps.now() - readyAt >= STABLE_CONNECTION_MS) {
        shortConnectionStreak = 0;
      } else {
        recordShortConnection();
      }
      deps.onStatus?.("reconnecting");
      retry();
    });
    next.onError(() => {
      // Browsers normally follow onerror with onclose; no parallel socket.
      // If the transport never emits close, the handshake watchdog recovers.
    });
    // Start only after listeners are installed. A stalled handshake must not
    // block the messaging tab indefinitely; replace only after a bounded delay.
    if (socket === next && readyAt === null) {
      handshakeTimer = deps.schedule(() => {
        handshakeTimer = null;
        if (!started || socket !== next || readyAt !== null) return;
        socket = null; // Ignore any subsequent late frames/close callbacks.
        try { next.close(1000, "Handshake timeout"); } catch { /* best effort */ }
        recordShortConnection();
        deps.onStatus?.("reconnecting");
        retry();
      }, HANDSHAKE_READY_TIMEOUT_MS);
    }
  }

  return {
    start() {
      if (started) return;
      started = true;
      if (deps.isVisible()) connect(); else deps.onStatus?.("paused");
    },
    visibilityChanged() {
      if (!started || permanentlyRejected) return;
      if (!deps.isVisible()) {
        cancelReconnect();
        cancelReconcile();
        closeCurrent();
        deps.onStatus?.("paused");
        shortConnectionStreak = 0;
      } else {
        connect(); // 'ready' reconciles missed events from PostgreSQL.
      }
    },
    stop() {
      started = false;
      cancelReconnect();
      cancelReconcile();
      closeCurrent();
      seen.clear();
    },
  };
}
