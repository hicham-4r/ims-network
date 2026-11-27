"use server";

import { acknowledgeDelivery } from "@/server/messaging/delivery";
import { publishChatActivity } from "@/server/messaging/activity";
import { setMessageReaction } from "@/server/messaging/reactions";
import { revalidatePath } from "next/cache";

import {
  MessagingReadBudgetError,
} from "@/server/messaging/read-budget";

import {
  MessageSendError,
  sendDirectMessage,
} from "@/server/messaging/messages";

import {
  MessageReadError,
  markConversationRead,
} from "@/server/messaging/reads";

export type ChatSendResult =
  | { ok: true; messageId: string }
  | { ok: false; message: string };

export async function sendChatMessage(
  input: unknown,
): Promise<ChatSendResult> {
  try {
    // Better Auth, membership validation, message length,
    // Redis rate limiting and idempotency are all enforced
    // by the existing server-side messaging service.
    const persisted = await sendDirectMessage(input);

    revalidatePath("/messages");

    return { ok: true, messageId: persisted.id };
  } catch (error) {
    if (!(error instanceof MessageSendError)) {
      throw error;
    }

    switch (error.code) {
      case "INVALID_INPUT":
        return {
          ok: false,
          message: "Enter a valid message (1–2000 characters).",
        };

      case "RATE_LIMITED":
        return {
          ok: false,
          message: "Too many messages. Please try again later.",
        };

      case "RATE_LIMIT_UNAVAILABLE":
        return {
          ok: false,
          message: "Messaging is temporarily unavailable.",
        };

      case "IDEMPOTENCY_CONFLICT":
        return {
          ok: false,
          message: "Message retry conflict. Please edit and resend.",
        };

      case "CONVERSATION_UNAVAILABLE":
        return {
          ok: false,
          message: "This conversation is unavailable.",
        };
    }

    return {
      ok: false,
      message: "Message could not be sent.",
    };
  }
}

export async function markChatRead(
  input: unknown,
): Promise<{ ok: boolean }> {
  try {
    await markConversationRead(input);

    revalidatePath("/messages");

    return { ok: true };
  } catch (error) {
    if (
      error instanceof MessageReadError ||
      error instanceof MessagingReadBudgetError
    ) {
      return { ok: false };
    }

    throw error;
  }
}

export async function reactToChatMessage(input: unknown): Promise<{ ok: boolean }> {
  try {
    const ok = await setMessageReaction(input);
    if (ok) revalidatePath("/messages");
    return { ok };
  } catch { return { ok: false }; }
}

export async function signalChatActivity(input: unknown): Promise<{ ok: boolean }> {
  try { return {ok: await publishChatActivity(input)}; } catch { return {ok:false}; }
}

export async function acknowledgeChatDelivery(input: unknown): Promise<{ok:boolean}> {
  try {return {ok:await acknowledgeDelivery(input)};} catch {return {ok:false};}
}
