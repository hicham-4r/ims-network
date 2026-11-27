import "server-only";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { z } from "zod";
import { requireActiveMember } from "@/server/account-state";
import { serverEnv } from "@/server/env";
import { checkRateLimit } from "@/server/redis/rate-limit";
import { publishMessageNotice } from "@/server/realtime/stream-publisher";
const origin = randomUUID();
const schema = z.object({ conversationId: z.string().uuid(), messageIds: z.array(z.string().min(1).max(255)).min(1).max(30) }).strict();
export async function acknowledgeDelivery(input: unknown): Promise<boolean> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return false;
  const { session } = await requireActiveMember(); const actor = session.user.id;
  if (!(await checkRateLimit("messageDelivery", actor, "deny")).allowed) return false;
  const sql = neon(serverEnv.DATABASE_URL_POOLED);
  const {conversationId, messageIds} = parsed.data;
  const rows = await sql`WITH authorized AS MATERIALIZED (
    SELECT c.id, pm.user_id AS peer FROM conversations c
    JOIN conversation_members am ON am.conversation_id=c.id AND am.user_id=${actor}
    JOIN conversation_members pm ON pm.conversation_id=c.id AND pm.user_id=CASE WHEN c.low_user_id=${actor} THEN c.high_user_id ELSE c.low_user_id END
    JOIN application_user_state a ON a.user_id=am.user_id AND a.status='ACTIVE'
    JOIN application_user_state b ON b.user_id=pm.user_id AND b.status='ACTIVE'
    JOIN session s ON s.id=${session.session.id} AND s.user_id=am.user_id AND s.expires_at>(now() AT TIME ZONE 'UTC')
    WHERE c.id=${conversationId} AND ${actor} IN(c.low_user_id,c.high_user_id)
      AND (SELECT count(*) FROM conversation_members cm WHERE cm.conversation_id=c.id)=2
  ), changed AS (UPDATE messages m SET delivered_at=now() FROM authorized a
    WHERE m.conversation_id=a.id AND m.sender_user_id=a.peer AND m.delivered_at IS NULL
      AND m.id IN (SELECT jsonb_array_elements_text(${JSON.stringify([...new Set(messageIds)])}::jsonb)) RETURNING m.id)
  SELECT peer, EXISTS(SELECT 1 FROM changed) AS changed FROM authorized`;
  if (rows.length !== 1 || typeof rows[0].peer !== "string") return false;
  if (rows[0].changed === true) await publishMessageNotice({recipientUserId:rows[0].peer,eventId:randomUUID(),originInstanceId:origin});
  return true;
}
