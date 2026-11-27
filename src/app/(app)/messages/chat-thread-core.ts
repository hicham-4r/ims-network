import type { Reaction } from "@/lib/chat-interactions";
// Pure client-side reconciliation. Never treat a local draft as durable.
export type ThreadMessage = {
  id: string;
  clientMessageId: string | null;
  readByPeer: boolean;
  delivered?: boolean;
  reply?: { id: string; body: string; own: boolean } | null;
  myReaction?: Reaction | null;
  peerReaction?: Reaction | null;
  sequence: number;
  senderUserId: string;
  body: string;
  createdAt: string;
};

export type PendingMessage = {
  clientMessageId: string;
  body: string;
  createdAt: string;
  status: "sending" | "sent" | "rejected" | "uncertain";
  messageId?: string;
  error?: string;
  wasUncertain?: boolean;
  reply?: { id: string; body: string; own: boolean };
};

export function unresolvedMessage(pending: PendingMessage | null, messages: readonly ThreadMessage[], actorId: string) {
  if (!pending) return null;
  return messages.some(message => message.senderUserId === actorId && (
    message.clientMessageId === pending.clientMessageId ||
    (pending.messageId !== undefined && message.id === pending.messageId)
  )) ? null : pending;
}

export function retryPayload(conversationId: string, pending: PendingMessage) {
  return { conversationId, clientMessageId: pending.clientMessageId, body: pending.body, ...(pending.reply ? {replyToMessageId: pending.reply.id} : {}) };
}

export function messageStatus(message: ThreadMessage, actorId: string): "Read" | "Delivered" | "Sent" | null {
  if (message.senderUserId !== actorId) return null;
  return message.readByPeer ? "Read" : message.delivered ? "Delivered" : "Sent";
}

export function threadRowKey(message: ThreadMessage, actorId: string) {
  return message.senderUserId === actorId && message.clientMessageId
    ? `own:${message.clientMessageId}` : `server:${message.id}`;
}
