import "server-only";

import { z } from "zod";

import { requireActiveMember } from "@/server/account-state";
import { checkRateLimit } from "@/server/redis/rate-limit";

import {
  MessageSendError,
  persistMessageForActor,
} from "./message-store";

export { MessageSendError };

const sendMessageSchema = z
  .object({
    conversationId: z.string().min(1).max(255),
    clientMessageId: z.string().uuid(),
    body: z.string().trim().min(1).max(2000),
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

  return persistMessageForActor({
    actorUserId: session.user.id,
    conversationId: parsed.data.conversationId,
    body: parsed.data.body,
    clientMessageId: parsed.data.clientMessageId,
  });
}
