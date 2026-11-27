import { createHmac } from "node:crypto";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const recipientPattern = /^[A-Za-z0-9_-]{43}$/;

export const RELAY_BLOCK_MS = 30_000;
export const RELAY_BATCH_SIZE = 50;
export const RELAY_MAXLEN = 2_000;

export type ActivityFields = { c: string; k: "typing" | "active"; x: string };
export type RelayFields = {
  v: "1";
  e: string;
  r: string;
  o: string;
} & Partial<ActivityFields>;

function assertNamespace(prefix: string) {
  if (!/^ims-network:v1:(development|preview|production)$/.test(prefix)) {
    throw new Error("Invalid Redis namespace.");
  }
}

export function relayStreamKey(prefix: string) {
  assertNamespace(prefix);
  return `${prefix}:realtime:events`;
}

export function recipientRelayKey(
  userId: string,
  prefix: string,
  secret: string,
) {
  assertNamespace(prefix);

  if (
    !userId ||
    userId.length > 255 ||
    !userId.trim() ||
    secret.length < 32
  ) {
    throw new Error("Invalid relay recipient configuration.");
  }

  return createHmac("sha256", secret)
    .update("ims-network:relay-recipient:v1")
    .update("\0")
    .update(prefix)
    .update("\0")
    .update(userId)
    .digest("base64url");
}

// Scoped opaque conversation key: only an authorized recipient receives the matching token.
export function activityConversationKey(conversationId: string, recipientUserId: string, prefix: string, secret: string) {
  assertNamespace(prefix);
  if (!conversationId || conversationId.length > 255 || !recipientUserId || recipientUserId.length > 255 || secret.length < 32) throw new Error("Invalid activity scope");
  return createHmac("sha256", secret).update("ims-network:chat-activity:v1\0").update(prefix).update("\0").update(recipientUserId).update("\0").update(conversationId).digest("base64url");
}

export function createRelayEntry(input: {
  prefix: string;
  secret: string;
  recipientUserId: string;
  eventId: string;
  originInstanceId: string;
  activity?: { conversationId: string; kind: "typing" | "active"; expiresAt: number };
}) {
  if (
    !uuidPattern.test(input.eventId) ||
    !uuidPattern.test(input.originInstanceId)
  ) {
    throw new Error("Invalid relay event identity.");
  }

  const fields: RelayFields = {
    v: "1",
    e: input.eventId,
    r: recipientRelayKey(
      input.recipientUserId,
      input.prefix,
      input.secret,
    ),
    o: input.originInstanceId,
  };

  if (input.activity) {
    const { conversationId, kind, expiresAt } = input.activity;
    if ((kind !== "typing" && kind !== "active") || !Number.isSafeInteger(expiresAt) || expiresAt <= 0) throw new Error("Invalid activity expiry");
    fields.c = activityConversationKey(conversationId, input.recipientUserId, input.prefix, input.secret);
    fields.k = kind;
    fields.x = String(expiresAt);
  }
  return {
    streamKey: relayStreamKey(input.prefix),
    fields,
  };
}

// Decode only the expected Redis fields.
// Malformed or unexpected entries are ignored.
export function parseRelayFields(
  flat: readonly string[],
): RelayFields | null {
  if (flat.length !== 8 && flat.length !== 14) return null;

  const values: Record<string, string> = {};

  for (let i = 0; i < flat.length; i += 2) {
    const key = flat[i];
    const value = flat[i + 1];

    if (
      typeof key !== "string" ||
      typeof value !== "string" ||
      Object.prototype.hasOwnProperty.call(values, key)
    ) {
      return null;
    }

    values[key] = value;
  }

  if (
    Object.keys(values).sort().join(",") !== (flat.length === 8 ? "e,o,r,v" : "c,e,k,o,r,v,x") ||
    values.v !== "1" ||
    !uuidPattern.test(values.e) ||
    !uuidPattern.test(values.o) ||
    !recipientPattern.test(values.r)
  ) {
    return null;
  }

  if (flat.length === 14 && (!recipientPattern.test(values.c) || (values.k !== "typing" && values.k !== "active") || !/^[0-9]{13}$/.test(values.x) || !Number.isSafeInteger(Number(values.x)))) return null;
  return {
    ...(flat.length === 14 ? { c: values.c, k: values.k as "typing" | "active", x: values.x } : {}),
    v: "1",
    e: values.e,
    r: values.r,
    o: values.o,
  };
}

// Conservative idle-read projection.
// Does not include writes, caching or rate limiting.
export function projectMonthlyIdleReads(
  readerCount: number,
) {
  if (
    !Number.isSafeInteger(readerCount) ||
    readerCount < 0 ||
    readerCount > 100_000
  ) {
    throw new Error("Invalid reader count.");
  }

  return readerCount *
    Math.ceil(30 * 24 * 60 * 60 * 1000 / RELAY_BLOCK_MS);
}