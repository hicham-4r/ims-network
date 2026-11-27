import "server-only";
import { randomUUID } from "node:crypto";
import { publishMessageNotice } from "@/server/realtime/stream-publisher";

const receiptOrigin = randomUUID();

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

  const result = await markConversationReadForActor(session.user.id, input);
  // Cursor is committed. Send only a refresh hint to the authorized peer.
  // Never expose read position or user identity in the WebSocket payload.
  if (result.advanced && result.peerUserId && result.peerUserId !== session.user.id) {
    try {
      await publishMessageNotice({ recipientUserId: result.peerUserId, eventId: randomUUID(), originInstanceId: receiptOrigin });
    } catch { /* best effort; reconciliation remains authoritative */ }
  }
  return { conversationId: result.conversationId, lastReadSequence: result.lastReadSequence };
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
