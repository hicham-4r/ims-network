import "server-only";
import {randomUUID} from "node:crypto";
import {neon} from "@neondatabase/serverless";
import {z} from "zod";
import {requireActiveMember,requireAdmin} from "@/server/account-state";
import {configuredOwnerId} from "@/server/account-state/owner";
import {auth} from "@/server/auth";
import {headers} from "next/headers";
import {serverEnv} from "@/server/env";
import {checkRateLimit} from "@/server/redis/rate-limit";
const db=()=>neon(serverEnv.DATABASE_URL_POOLED);
const id=z.string().min(1).max(255);
const category=z.enum(["SPAM","HARASSMENT","OTHER"]);
const reportSchema=z.object({conversationId:id,messageId:id,category}).strict();
export async function reportMessage(input:unknown) {
  const parsed=reportSchema.safeParse(input);if(!parsed.success)return false;
  const {session}=await requireActiveMember();const actor=session.user.id;
  if(!(await checkRateLimit("messageReport",actor,"deny")).allowed)return false;
  const {conversationId,messageId,category}=parsed.data;const sql=db();
  const rows=await sql`WITH eligible AS MATERIALIZED (
    SELECT m.id FROM messages m JOIN conversations c ON c.id=m.conversation_id
    JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.user_id=${actor}
    JOIN application_user_state a ON a.user_id=cm.user_id AND a.status='ACTIVE'
    JOIN session s ON s.id=${session.session.id} AND s.user_id=a.user_id AND s.expires_at>(now() AT TIME ZONE 'UTC')
    WHERE m.id=${messageId} AND c.id=${conversationId} AND ${actor} IN(c.low_user_id,c.high_user_id)
      AND m.sender_user_id<>${actor} AND m.sender_user_id IN(c.low_user_id,c.high_user_id)
      AND (SELECT count(*) FROM conversation_members x WHERE x.conversation_id=c.id)=2
  ), inserted AS (INSERT INTO message_reports(id,reporter_id,message_id,category) SELECT ${randomUUID()},${actor},id,${category} FROM eligible WHERE true ON CONFLICT(reporter_id,message_id) DO NOTHING RETURNING id)
  SELECT id FROM eligible`;
  return rows.length===1;
}
export async function moderationPageData() {
  const {session}=await requireActiveMember(); const actor=session.user.id; const sql=db();
  // Role is evaluated in the database for each page; no shared role cache.
  const rows=await sql`WITH authorized AS MATERIALIZED (SELECT a.user_id,a.role,(a.role='ADMIN' OR EXISTS(SELECT 1 FROM moderation_reviewers mr WHERE mr.user_id=a.user_id)) AS reviewer FROM application_user_state a JOIN session s ON s.user_id=a.user_id AND s.id=${session.session.id} AND s.expires_at>(now() AT TIME ZONE 'UTC') WHERE a.user_id=${actor} AND a.status='ACTIVE')
    SELECT reviewer,COALESCE((SELECT jsonb_agg(q) FROM (SELECT r.id,r.category,r.status,r.created_at FROM message_reports r WHERE r.reporter_id=authorized.user_id ORDER BY r.created_at DESC,r.id DESC LIMIT 30) q),'[]'::jsonb) AS own,
    CASE WHEN reviewer THEN COALESCE((SELECT jsonb_agg(q) FROM (SELECT r.id,r.category,r.status,r.created_at,m.sender_user_id AS subject_id FROM message_reports r JOIN messages m ON m.id=r.message_id WHERE (r.status='OPEN' OR (authorized.role='ADMIN' AND r.status='ESCALATED')) AND r.reporter_id<>authorized.user_id AND m.sender_user_id<>authorized.user_id ORDER BY CASE WHEN r.status='ESCALATED' THEN 0 ELSE 1 END,r.created_at,r.id LIMIT 30) q),'[]'::jsonb) ELSE '[]'::jsonb END AS queue FROM authorized`;
  if(rows.length!==1) return null;
  type Report={id:string;category:string;status:string;created_at:string;subject_id?:string};
  return {reviewer:rows[0].reviewer===true,own:rows[0].own as Report[],queue:rows[0].queue as Report[]};
}
const reviewSchema=z.object({reportId:id,decision:z.enum(["DISMISSED","ESCALATED"])}).strict();
export async function reviewMessageReport(input:unknown) {
  const parsed=reviewSchema.safeParse(input);if(!parsed.success)return false;
  const {session}=await requireActiveMember();const actor=session.user.id;const sql=db();
  if(!(await checkRateLimit("adminModeration",actor,"deny")).allowed)return false;
  const {reportId,decision}=parsed.data;
  const rows=await sql`WITH actor AS MATERIALIZED (SELECT a.user_id,a.role FROM application_user_state a JOIN session s ON s.user_id=a.user_id AND s.id=${session.session.id} AND s.expires_at>(now() AT TIME ZONE 'UTC') WHERE a.user_id=${actor} AND a.status='ACTIVE' FOR UPDATE OF a,s),
    assigned AS MATERIALIZED(SELECT mr.user_id FROM moderation_reviewers mr JOIN actor a ON a.user_id=mr.user_id FOR UPDATE OF mr),
    changed AS (UPDATE message_reports r SET status=${decision},reviewed_at=now() WHERE r.id=${reportId} AND (r.status='OPEN' OR (r.status='ESCALATED' AND ${decision}='DISMISSED' AND EXISTS(SELECT 1 FROM actor a WHERE a.role='ADMIN'))) AND r.reporter_id<>${actor} AND EXISTS(SELECT 1 FROM actor a WHERE a.role='ADMIN' OR EXISTS(SELECT 1 FROM assigned)) AND NOT EXISTS(SELECT 1 FROM messages m WHERE m.id=r.message_id AND m.sender_user_id=${actor}) RETURNING r.id),
    audited AS (INSERT INTO audit_logs(id,actor_user_id,action,target_type,target_id,metadata) SELECT ${randomUUID()},${actor},'MESSAGE_REPORT_REVIEWED','MESSAGE_REPORT',id,jsonb_build_object('decision',${decision}::text) FROM changed RETURNING id) SELECT id FROM audited`;
  return rows.length===1;
}
const grantSchema=z.object({targetUserId:id,action:z.enum(["GRANT","REVOKE"]),password:z.string().min(1).max(128),confirmed:z.literal(true)}).strict();
export async function changeReviewer(input:unknown) {
  const parsed=grantSchema.safeParse(input);if(!parsed.success)return false;
  const {session}=await requireAdmin();const actor=session.user.id;const owner=configuredOwnerId();const {targetUserId,action,password}=parsed.data;
  if(!owner || actor!==owner || targetUserId===owner || !(await checkRateLimit("ownerRole",actor,"deny")).allowed)return false;
  try {if((await auth.api.verifyPassword({body:{password},headers:await headers()})).status!==true)return false;}catch{return false;}
  const sql=db();
  // Grant only an active ordinary member. Revocation is allowed for inactive users too.
  const rows=await sql`WITH authorized AS MATERIALIZED (SELECT t.user_id FROM application_user_state a JOIN session s ON s.user_id=a.user_id AND s.id=${session.session.id} AND s.expires_at>(now() AT TIME ZONE 'UTC') JOIN application_user_state t ON t.user_id=${targetUserId} WHERE a.user_id=${owner} AND a.role='ADMIN' AND a.status='ACTIVE' AND (${action}='REVOKE' OR (t.role='MEMBER' AND t.status='ACTIVE')) FOR UPDATE OF a,s,t),
    granted AS (INSERT INTO moderation_reviewers(user_id) SELECT user_id FROM authorized WHERE ${action}='GRANT' ON CONFLICT DO NOTHING RETURNING user_id),
    revoked AS (DELETE FROM moderation_reviewers mr USING authorized a WHERE ${action}='REVOKE' AND mr.user_id=a.user_id RETURNING mr.user_id),
    changed AS (SELECT user_id FROM granted UNION ALL SELECT user_id FROM revoked),
    audited AS (INSERT INTO audit_logs(id,actor_user_id,action,target_type,target_id) SELECT ${randomUUID()},${actor},CASE WHEN ${action}='GRANT' THEN 'MODERATOR_ROLE_GRANTED' ELSE 'MODERATOR_ROLE_REVOKED' END,'USER',user_id FROM changed RETURNING id) SELECT id FROM audited`;
  return rows.length===1;
}
