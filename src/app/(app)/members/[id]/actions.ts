"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  ConversationOpenError,
  openDirectConversation,
} from "@/server/messaging/conversations";

export async function startMemberConversation(
  targetMemberId: string,
) {
  let conversationId: string;

  try {
    const result = await openDirectConversation(
      targetMemberId,
    );

    conversationId = result.conversationId;
  } catch (error) {
    if (error instanceof ConversationOpenError) {
      redirect("/members?chat=unavailable");
    }

    // Unexpected failures must reach monitoring.
    throw error;
  }

  revalidatePath("/messages");

  // Fixed internal route. No user-controlled redirect URL.
  redirect(
    `/messages?c=${encodeURIComponent(conversationId)}`,
  );
}
