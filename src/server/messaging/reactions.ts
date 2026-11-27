import "server-only";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { z } from "zod";
import { requireActiveMember } from "@/server/account-state";
import { serverEnv } from "@/server/env";
import { checkRateLimit } from "@/server/redis/rate-limit";
import { publishMessageNotice } from "@/server/realtime/stream-publisher";
const origin = randomUUID();
const schema = z.object({ conversationId: z.string().min(1).max(255), messageId: z.string().min(1).max(255), reaction: z.enum(["like", "love", "laugh", "wow", "sad", "fire"]).nullable() }).strict();
export async function setMessageReaction(input: unknown): Promise<boolean> {
  const { session } = await requireActiveMember();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return false;
  const actor = session.user.id;
  const { conversationId, messageId, reaction } = parsed.data;
  if (!(await checkRateLimit("messageReaction", actor, "deny")).allowed) return false;
  const sql = neon(serverEnv.DATABASE_URL_POOLED);
  const rows = await sql`
    WITH authorized AS MATERIALIZED (
      SELECT c."id", CASE WHEN c."low_user_id" = ${actor} THEN c."high_user_id" ELSE c."low_user_id" END AS peer
      FROM "conversations" c
      JOIN "conversation_members" am ON am."conversation_id" = c."id" AND am."user_id" = ${actor}
      JOIN "conversation_members" pm ON pm."conversation_id" = c."id" AND pm."user_id" = CASE WHEN c."low_user_id" = ${actor} THEN c."high_user_id" ELSE c."low_user_id" END
      JOIN "application_user_state" a ON a."user_id" = am."user_id" AND a."status" = 'ACTIVE'
      JOIN "application_user_state" b ON b."user_id" = pm."user_id" AND b."status" = 'ACTIVE'
      WHERE c."id" = ${conversationId} AND ${actor} IN (c."low_user_id", c."high_user_id")
      AND (SELECT count(*) FROM "conversation_members" cm WHERE cm."conversation_id" = c."id") = 2
    ), changed AS (
      UPDATE "messages" m SET
        "sender_reaction" = CASE WHEN m."sender_user_id" = ${actor} THEN ${reaction}::text ELSE m."sender_reaction" END,
        "peer_reaction" = CASE WHEN m."sender_user_id" = ${actor} THEN m."peer_reaction" ELSE ${reaction}::text END
      FROM authorized a WHERE m."id" = ${messageId} AND m."conversation_id" = a."id"
        AND (CASE WHEN m."sender_user_id" = ${actor} THEN m."sender_reaction" ELSE m."peer_reaction" END) IS DISTINCT FROM ${reaction}::text
      RETURNING a.peer
    ) SELECT a.peer, EXISTS(SELECT 1 FROM changed) AS changed
      FROM authorized a JOIN "messages" m ON m."conversation_id" = a."id" AND m."id" = ${messageId}`;
  if (rows.length !== 1 || typeof rows[0].peer !== "string") return false;
  if (rows[0].changed === true) await publishMessageNotice({ recipientUserId: rows[0].peer, eventId: randomUUID(), originInstanceId: origin });
  return true;
}
