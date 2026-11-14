import "server-only";

import { requireActiveMember } from "@/server/account-state";
import { requireMessagingReadBudget } from "./read-budget";

import {
  markConversationReadForActor,
  getUnreadCountForActor,
} from "./read-store";

export { MessageReadError } from "./read-store";

// Authenticated application entry points.
// Actor identity always comes from Better Auth.
export async function markConversationRead(input: unknown) {
  const { session } = await requireActiveMember();

  await requireMessagingReadBudget(
    "messageRead",
    session.user.id,
  );

  return markConversationReadForActor(
    session.user.id,
    input,
  );
}

export async function getConversationUnreadCount(
  input: unknown,
) {
  const { session } = await requireActiveMember();

  await requireMessagingReadBudget(
    "messageRead",
    session.user.id,
  );

  return getUnreadCountForActor(
    session.user.id,
    input,
  );
}
