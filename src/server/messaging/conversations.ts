import "server-only";

import { z } from "zod";

import { requireActiveMember } from "@/server/account-state";
import { checkRateLimit } from "@/server/redis/rate-limit";

import {
  ConversationOpenError,
  openDirectConversationForActor,
} from "./conversation-store";

export { ConversationOpenError };

const memberIdSchema = z.string().min(1).max(255);

// Public server-side entry point.
// Never trust a browser-supplied actor user ID.
export async function openDirectConversation(
  input: unknown,
) {
  const parsed = memberIdSchema.safeParse(input);

  if (!parsed.success) {
    throw new ConversationOpenError();
  }

  const { session } = await requireActiveMember();

  // Conversation creation is an abuse-sensitive operation.
  // Redis failure must not silently bypass the limit.
  const decision = await checkRateLimit(
    "conversationOpen",
    session.user.id,
    "deny",
  );

  if (!decision.allowed) {
    // Keep the external response generic.
    // Do not reveal whether the target member exists.
    throw new ConversationOpenError();
  }

  return openDirectConversationForActor(
    session.user.id,
    parsed.data,
  );
}
