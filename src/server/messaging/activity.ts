import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireActiveMember } from "@/server/account-state";
import { serverEnv } from "@/server/env";
import { redisKeyPrefix } from "@/server/redis/client";
import { checkRateLimit } from "@/server/redis/rate-limit";
import { isRelayActive } from "@/server/realtime/relay-activation-policy";
import { activityConversationKey } from "@/server/realtime/relay-protocol";
import { publishMessageNotice } from "@/server/realtime/stream-publisher";
import { getSelectedConversationSummary } from "./conversation-details";
const origin = randomUUID();
const schema = z.object({ conversationId: z.string().uuid(), kind: z.enum(["typing", "active"]) }).strict();
export function activityEnabled() {
  return process.env.IMS_PHASE22_CHAT_ACTIVITY === "true" && isRelayActive(process.env, redisKeyPrefix);
}
export function getActivityScope(conversationId: string, recipient: string) {
  return activityEnabled() ? activityConversationKey(conversationId, recipient, redisKeyPrefix, serverEnv.BETTER_AUTH_SECRET) : null;
}
export async function publishChatActivity(input: unknown): Promise<boolean> {
  if (!activityEnabled()) return false;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return false;
  const {session} = await requireActiveMember();
  if (!(await checkRateLimit("chatActivity", session.user.id, "deny")).allowed) return false;
  // Existing service revalidates both ACTIVE members and exact conversation membership.
  const selected = await getSelectedConversationSummary(parsed.data.conversationId);
  if (!selected || selected.otherMember.id === session.user.id) return false;
  const kind = parsed.data.kind;
  return publishMessageNotice({ recipientUserId: selected.otherMember.id, eventId: randomUUID(), originInstanceId: origin,
    activity: { conversationId: parsed.data.conversationId, kind, expiresAt: Date.now() + (kind === "typing" ? 10_000 : 45_000) } });
}
