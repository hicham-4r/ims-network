/**
 * A read-only, fail-closed access decision for an already authenticated
 * WebSocket session. No polling, timers, cookies, or DB connections here.
 */
export type SocketSessionIdentity = Readonly<{
  userId: string;
  sessionId: string;
}>;

export type SocketAccessRecord = Readonly<{
  userId: string;
  sessionId: string;
  expiresAt: Date;
  accountStatus: string;
}>;

export type SocketAccessLookup = (
  identity: SocketSessionIdentity,
) => Promise<SocketAccessRecord | null>;

function validId(value: string) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 255 &&
    value.trim() === value;
}

export async function checkSocketSessionAccess(
  identity: SocketSessionIdentity,
  lookup: SocketAccessLookup,
  now: Date = new Date(),
): Promise<boolean> {
  if (
    !identity ||
    !validId(identity.userId) ||
    !validId(identity.sessionId) ||
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime())
  ) {
    return false;
  }

  try {
    const record = await lookup(identity);
    return record !== null &&
      record.userId === identity.userId &&
      record.sessionId === identity.sessionId &&
      record.accountStatus === "ACTIVE" &&
      record.expiresAt instanceof Date &&
      Number.isFinite(record.expiresAt.getTime()) &&
      record.expiresAt.getTime() > now.getTime();
  } catch {
    // Database failure must not authorize a revoked connection.
    return false;
  }
}
