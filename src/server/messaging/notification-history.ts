import "server-only";
import { neon } from "@neondatabase/serverless";
import { requireActiveMember } from "@/server/account-state";
import { serverEnv } from "@/server/env";
import { requireMessagingReadBudget } from "./read-budget";
export async function getMessageNotificationHistory(before?: string) {
  const {session} = await requireActiveMember(); const actor=session.user.id;
  if(before && !/^[1-9][0-9]{0,15}$/.test(before)) return {items:[],next:null};
  await requireMessagingReadBudget("conversationInbox",actor);
  const sql=neon(serverEnv.DATABASE_URL_POOLED);
  const [,rows]=await sql.transaction([sql`SET LOCAL statement_timeout='5s'`,sql`SELECT m.id, m.sequence::text AS seq, m.conversation_id, m.created_at,
    COALESCE(p.display_name,u.name) AS name, m.sequence > COALESCE(am.last_read_message_sequence,0) AS unread
    FROM conversation_members am JOIN conversations c ON c.id=am.conversation_id
    JOIN application_user_state a ON a.user_id=am.user_id AND a.status='ACTIVE'
    JOIN conversation_members pm ON pm.conversation_id=c.id AND pm.user_id=CASE WHEN c.low_user_id=${actor} THEN c.high_user_id ELSE c.low_user_id END
    JOIN application_user_state b ON b.user_id=pm.user_id AND b.status='ACTIVE'
    JOIN "user" u ON u.id=pm.user_id LEFT JOIN profiles p ON p.user_id=u.id
    JOIN messages m ON m.conversation_id=c.id AND m.sender_user_id=pm.user_id
    WHERE am.user_id=${actor} AND ${actor} IN(c.low_user_id,c.high_user_id) AND (SELECT count(*) FROM conversation_members cm WHERE cm.conversation_id=c.id)=2
    AND (${before??null}::bigint IS NULL OR m.sequence < ${before??null}::bigint)
    ORDER BY m.sequence DESC LIMIT 31`]);
  const items=rows.slice(0,30).map(row=>({id:String(row.id),seq:String(row.seq),conversationId:String(row.conversation_id),name:String(row.name),createdAt:new Date(String(row.created_at)).toISOString(),unread:row.unread===true}));
  return {items,next:rows.length>30?items.at(-1)?.seq??null:null};
}
