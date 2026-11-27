/**
 * Pure message-notification boundary. No database, Redis, or server-only
 * imports. The store supplies the conversation pair from PostgreSQL.
 */
export function resolveDirectMessageRecipient(
  actorUserId: string,
  lockedConversation: Readonly<Record<string, unknown>>,
): string {
  const low = lockedConversation["low_user_id"];
  const high = lockedConversation["high_user_id"];
  if (
    typeof actorUserId !== "string" ||
    !actorUserId.trim() ||
    typeof low !== "string" ||
    !low.trim() ||
    typeof high !== "string" ||
    !high.trim() ||
    low === high
  ) {
    throw new Error("Invalid locked conversation participants.");
  }

  if (actorUserId === low) return high;
  if (actorUserId === high) return low;
  throw new Error("Actor is not a locked conversation participant.");
}

export type CommittedMessageNotice = Readonly<{
  insertedNewMessage: boolean;
  recipientUserId: string;
  messageId: string;
  originInstanceId: string;
}>;

export type MessageNoticePublisher = (
  notice: Readonly<{
    recipientUserId: string;
    eventId: string;
    originInstanceId: string;
  }>,
) => Promise<boolean>;

/**
 * Invoke only after a successful COMMITTED insert. No notification is
 * published for a retry that returned an existing idempotent message.
 * A Redis failure cannot turn a committed send into a failed send.
 */
export async function emitCommittedMessageNotice(
  result: CommittedMessageNotice,
  publish: MessageNoticePublisher,
): Promise<boolean> {
  if (!result.insertedNewMessage) return false;

  try {
    return await publish({
      recipientUserId: result.recipientUserId,
      eventId: result.messageId,
      originInstanceId: result.originInstanceId,
    });
  } catch {
    // Never log private message details or credentials here.
    return false;
  }
}
