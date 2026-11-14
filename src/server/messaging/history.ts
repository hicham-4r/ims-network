import "server-only";

import { requireActiveMember } from "@/server/account-state";
import { requireMessagingReadBudget } from "./read-budget";

import {
  getConversationHistoryForActor,
} from "./history-store";

export {
  MESSAGE_PAGE_SIZE,
  MessageHistoryError,
} from "./history-store";

// Authenticated application entry point.
// Never trust a browser-supplied actor user ID.
export async function getConversationHistory(input: unknown) {
  const { session } = await requireActiveMember();

  await requireMessagingReadBudget(
    "messageHistory",
    session.user.id,
  );

  return getConversationHistoryForActor(
    session.user.id,
    input,
  );
}
