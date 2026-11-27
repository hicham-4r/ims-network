export type ActivityNotice = Readonly<{ type: "chat.activity"; eventId: string; scope: string; kind: "typing" | "active"; expiresAt: number }>;
export type RealtimeNotice = Readonly<{ type: "messages.changed"; eventId: string }> | ActivityNotice;

export type LocalSocket = {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(payload: string): void;
  close(code?: number, reason?: string): void;
};

const MAX_SOCKETS_PER_USER = 3;
const MAX_SOCKETS_PER_INSTANCE = 128;
const MAX_BUFFERED_BYTES = 64 * 1024;

const socketsByUser = new Map<string, Set<LocalSocket>>();
const registeredSockets = new WeakSet<LocalSocket>();

let totalSockets = 0;

// The caller must authenticate the member before registration.
// Never accept a user ID supplied by a WebSocket frame.
export function registerLocalSocket(
  userId: string,
  socket: LocalSocket,
): (() => void) | null {
  if (!userId || userId.length > 255) {
    throw new Error("Invalid member identifier.");
  }

  if (registeredSockets.has(socket)) {
    throw new Error("Socket already registered.");
  }

  const existing = socketsByUser.get(userId);

  if (
    (existing?.size ?? 0) >= MAX_SOCKETS_PER_USER ||
    totalSockets >= MAX_SOCKETS_PER_INSTANCE
  ) {
    return null;
  }

  const group = existing ?? new Set<LocalSocket>();

  if (!existing) {
    socketsByUser.set(userId, group);
  }

  group.add(socket);
  registeredSockets.add(socket);
  totalSockets++;

  // Idempotent cleanup callback.
  return () => {
    if (!registeredSockets.delete(socket)) return;

    group.delete(socket);
    totalSockets--;

    if (group.size === 0) {
      socketsByUser.delete(userId);
    }
  };
}

// Called only by trusted server-side notification code.
// No private message content is included.
export function deliverLocalNotice(
  userId: string,
  notice: RealtimeNotice,
): number {
  if (
    !/^[0-9a-f-]{36}$/i.test(notice.eventId) ||
    (notice.type !== "messages.changed" && (notice.type !== "chat.activity" || !/^[A-Za-z0-9_-]{43}$/.test(notice.scope) || !["typing", "active"].includes(notice.kind) || !Number.isSafeInteger(notice.expiresAt) || notice.expiresAt <= Date.now() || notice.expiresAt > Date.now() + 60_000))
  ) {
    throw new Error("Invalid notification.");
  }

  const payload = JSON.stringify(notice);
  const group = socketsByUser.get(userId);

  if (!group) return 0;

  let delivered = 0;

  for (const socket of group) {
    if (socket.readyState !== 1) continue;

    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      try {
        socket.close(1013, "Slow consumer");
      } catch {
        // Connection cleanup is handled by its owner.
      }
      continue;
    }

    try {
      socket.send(payload);
      delivered++;
    } catch {
      try {
        socket.close(1011, "Delivery failed");
      } catch {
        // Connection cleanup is handled by its owner.
      }
    }
  }

  return delivered;
}

export function localSocketCount(): number {
  return totalSockets;
}