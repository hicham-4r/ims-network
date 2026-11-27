import "server-only";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { auth } from "@/server/auth";
import { configuredOwnerId } from "@/server/account-state/owner";
import { serverEnv } from "@/server/env";
import { EXPORT_PAGE_SIZE, validExportCursor } from "./data-policy";

const dbClient = () => neon(serverEnv.DATABASE_URL_POOLED);

// A bounded, self-only export. Never select credentials, tokens, IPs, admin notes,
// other participants' messages or their profile/contact details.
export async function exportOwnData(userId: string, sessionId: string, before: string | null) {
  const sql = dbClient();
  const [, rows] = await sql.transaction([
    sql`SET LOCAL statement_timeout = '5s'`,
    sql`WITH authorized AS MATERIALIZED (
      SELECT u."id", jsonb_build_object('name', u."name", 'email', u."email", 'emailVerified', u."email_verified",
        'createdAt', u."created_at", 'status', s."status", 'role', s."role") AS account,
        jsonb_build_object('displayName', p."display_name", 'program', p."program", 'department', p."department",
        'graduationYear', p."graduation_year", 'bio', p."bio", 'jobTitle', p."job_title", 'company', p."company", 'location', p."location", 'skills', p."skills", 'mentorship', p."mentorship", 'updatedAt', p."updated_at") AS profile
      FROM "user" u JOIN "application_user_state" s ON s."user_id" = u."id"
      LEFT JOIN "profiles" p ON p."user_id" = u."id"
      JOIN "session" x ON x."user_id" = u."id" AND x."id" = ${sessionId}
      WHERE u."id" = ${userId} AND s."status" = 'ACTIVE' AND x."expires_at" > (now() AT TIME ZONE 'UTC')
    ), page AS MATERIALIZED (
      SELECT m."sequence", m."conversation_id", m."id", m."created_at",
        m."sender_user_id" = a."id" AS own_message,
        CASE WHEN m."sender_user_id" = a."id" THEN m."body" ELSE NULL END AS body,
        CASE WHEN m."sender_user_id" = a."id" THEN m."reply_to_message_id" ELSE NULL END AS reply_id,
        CASE WHEN m."sender_user_id" = a."id" THEN m."sender_reaction" ELSE m."peer_reaction" END AS reaction,
        CASE WHEN m."sender_user_id" = a."id" THEN m."delivered_at" ELSE NULL END AS delivered_at,
        CASE WHEN r.id IS NOT NULL THEN jsonb_build_object('reportId',r.id,'messageId',r.message_id,'category',r.category,'status',r.status,'createdAt',r.created_at) ELSE NULL END AS report
      FROM "messages" m JOIN "conversations" c ON c."id" = m."conversation_id"
      JOIN authorized a ON a."id" = m."sender_user_id" OR (a."id" IN (c."low_user_id", c."high_user_id") AND m."sender_user_id" <> a."id" AND (m."peer_reaction" IS NOT NULL OR EXISTS(SELECT 1 FROM message_reports rr WHERE rr.reporter_id=a.id AND rr.message_id=m.id)))
      LEFT JOIN message_reports r ON r.reporter_id=a.id AND r.message_id=m.id
      WHERE (${before}::bigint IS NULL OR m."sequence" < ${before}::bigint)
      ORDER BY m."sequence" DESC LIMIT ${EXPORT_PAGE_SIZE + 1}
    ) SELECT a.account, a.profile,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('sequence', q."sequence"::text,
        'conversationId', q."conversation_id", 'messageId', q."id", 'ownMessage', q.own_message, 'body', q."body", 'replyToMessageId', q.reply_id, 'reaction', q.reaction, 'deliveredAt', q.delivered_at, 'report',q.report, 'createdAt', CASE WHEN q.own_message THEN q."created_at" ELSE NULL END) ORDER BY q."sequence" DESC) FROM page q), '[]'::jsonb) AS sent
       , EXISTS(SELECT 1 FROM moderation_reviewers mr WHERE mr.user_id=a.id) AS moderator_capability
      FROM authorized a`,
  ]);
  if (rows.length !== 1 || !Array.isArray(rows[0].sent)) return null;
  const sent: unknown[] = rows[0].sent;
  const items = sent.slice(0, EXPORT_PAGE_SIZE);
  const last = items.at(-1);
  const next = sent.length > EXPORT_PAGE_SIZE && last && typeof last === "object" && "sequence" in last && validExportCursor(last.sequence) ? last.sequence : null;
  return { format: "ims-personal-data-v1", account: rows[0].account, profile: rows[0].profile,
    sentMessages: items.filter(item => item && typeof item === "object" && "ownMessage" in item && item.ownMessage === true),
    ownReactions: items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && "reaction" in item && item.reaction != null)).map(item => ({messageId: item.messageId, conversationId: item.conversationId, reaction: item.reaction})), ownReports: items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && "report" in item && item.report != null)).map(item=>item.report), moderatorCapability: rows[0].moderator_capability === true, nextBefore: next };
}

// This is a request, not account deletion or suspension. Review is manual.
// Confirm the current credential and recheck it and the live session under locks.
export async function requestOwnDeletion(userId: string, sessionId: string, password: string): Promise<boolean> {
  const sql = dbClient();
  const owner = configuredOwnerId();
  const rows = await sql`SELECT a."id", a."password" FROM "account" a
    JOIN "application_user_state" s ON s."user_id" = a."user_id"
    WHERE a."user_id" = ${userId} AND a."provider_id" = 'credential'
      AND s."role" = 'MEMBER' AND s."status" = 'ACTIVE' AND s."user_id" IS DISTINCT FROM ${owner}::text LIMIT 2`;
  if (rows.length !== 1 || typeof rows[0].password !== "string" || typeof rows[0].id !== "string") return false;
  const credentialId = rows[0].id;
  const hash = rows[0].password;
  const ctx = await auth.$context;
  if (!await ctx.password.verify({ hash, password })) return false;
  // One request event per member per UTC day. Concurrent retries are idempotent.
  const requestId = "privacy-delete-" + createHash("sha256").update(userId).update("\0").update(new Date().toISOString().slice(0, 10)).digest("hex");
  const [, , result] = await sql.transaction([
    sql`SET LOCAL statement_timeout = '5s'`, sql`SET LOCAL lock_timeout = '1s'`,
    sql`WITH eligible AS MATERIALIZED (
      SELECT s."user_id" FROM "application_user_state" s
      WHERE s."user_id" = ${userId} AND s."status" = 'ACTIVE' AND s."role" = 'MEMBER'
        AND s."user_id" IS DISTINCT FROM ${owner}::text FOR UPDATE OF s
    ), credential AS MATERIALIZED (
      SELECT a."user_id" FROM "account" a JOIN eligible e ON e."user_id" = a."user_id"
      WHERE a."id" = ${credentialId} AND a."provider_id" = 'credential' AND a."password" = ${hash} FOR UPDATE OF a
    ), live AS MATERIALIZED (
      SELECT x."user_id" FROM "session" x JOIN credential c ON c."user_id" = x."user_id"
      WHERE x."id" = ${sessionId} AND x."expires_at" > (now() AT TIME ZONE 'UTC') FOR UPDATE OF x
    ), recorded AS (
      INSERT INTO "audit_logs" ("id", "actor_user_id", "action", "target_type", "target_id", "created_at")
      SELECT ${requestId}, "user_id", 'ACCOUNT_DELETION_REQUESTED', 'USER', "user_id", now() FROM live
      ON CONFLICT ("id") DO NOTHING RETURNING "id"
    ) SELECT "user_id" FROM live`,
  ]);
  return result.length === 1;
}
