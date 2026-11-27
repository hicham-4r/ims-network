import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { requireActiveMember } from "@/server/account-state";
import { checkRateLimit } from "@/server/redis/rate-limit";
import { publishMessageNotice } from "@/server/realtime/stream-publisher";

import {
  MessageSendError,
  persistMessageForActorWithNotice,
} from "./message-store";

import { emitCommittedMessageNotice } from "./message-notice-core";

export { MessageSendError };

// One origin ID per active Function module instance, not per message.
const noticeOriginInstanceId = randomUUID();

const sendMessageSchema = z
  .object({
    conversationId: z.string().min(1).max(255),
    clientMessageId: z.string().uuid(),
    body: z.string().trim().min(1).max(2000),
    replyToMessageId: z.string().min(1).max(255).optional(),
  })
  .strict();

// Authenticated application entry point.
// Actor identity is derived from Better Auth,
// never accepted from browser input.
export async function sendDirectMessage(input: unknown) {
  const { session } = await requireActiveMember();

  const parsed = sendMessageSchema.safeParse(input);

  if (!parsed.success) {
    throw new MessageSendError("INVALID_INPUT");
  }

  // Message sends are abuse-sensitive mutations:
  // unavailable Redis must not silently bypass limits.
  const decision = await checkRateLimit(
    "messageSend",
    session.user.id,
    "deny",
  );

  if (!decision.allowed) {
    throw new MessageSendError(
      decision.reason === "limited"
        ? "RATE_LIMITED"
        : "RATE_LIMIT_UNAVAILABLE",
      decision.retryAfterSeconds,
    );
  }

  // This resolves only after the PostgreSQL transaction commits.
  const persisted = await persistMessageForActorWithNotice({
    actorUserId: session.user.id,
    conversationId: parsed.data.conversationId,
    body: parsed.data.body,
    clientMessageId: parsed.data.clientMessageId,
    replyToMessageId: parsed.data.replyToMessageId,
  });

  // Advisory only: never roll back a durable message because Redis
  // is unavailable. An idempotent retry creates no new notice.
  await emitCommittedMessageNotice(
    {
      insertedNewMessage: persisted.insertedNewMessage,
      recipientUserId: persisted.recipientUserId,
      messageId: persisted.message.id,
      originInstanceId: noticeOriginInstanceId,
    },
    publishMessageNotice,
  );

  // Preserve the pre-existing public send result shape. No recipient
  // identifiers or internal relay metadata leave the service.
  return persisted.message;
}
