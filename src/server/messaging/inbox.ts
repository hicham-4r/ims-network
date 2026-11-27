import "server-only";

import { requireActiveMember } from "@/server/account-state";
import { requireMessagingReadBudget } from "./read-budget";

import {
  getConversationInboxForActor,
} from "./inbox-store";

export {
  INBOX_PAGE_SIZE,
  InboxError,
} from "./inbox-store";

// Authenticated application entry point.
// Never accept an actor user ID from the browser.
export async function getConversationInbox(
  input: unknown = {},
) {
  const { session } = await requireActiveMember();

  await requireMessagingReadBudget(
    "conversationInbox",
    session.user.id,
  );

  return getConversationInboxForActor(
    session.user.id,
    input,
  );
}
