import "server-only";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { auth } from "@/server/auth";
import { configuredOwnerId } from "@/server/account-state/owner";
import { serverEnv } from "@/server/env";
import { createRecoveryCode, recoveryIdentifier, recoveryBinding, sameDigest, RECOVERY_RECORD_PREFIX, RECOVERY_CODE_DAYS } from "./recovery-code-core";

type Credential = { user_id: string; account_id: string; password_hash: string; state_version: string };
function credential(row: unknown): Credential | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.user_id !== "string" || typeof r.account_id !== "string" ||
    typeof r.password_hash !== "string" || !r.password_hash || typeof r.state_version !== "string") return null;
  return { user_id: r.user_id, account_id: r.account_id, password_hash: r.password_hash, state_version: r.state_version };
}
const dbClient = () => neon(serverEnv.DATABASE_URL_POOLED);
const bind = (c: Credential) => recoveryBinding(serverEnv.BETTER_AUTH_SECRET, c.user_id, c.account_id, c.password_hash, c.state_version);

// Every issuance requires a fresh password check. The final SQL also checks
// the original credential hash, live session and account-state version under locks.
export async function issueRecoveryCode(userId: string, sessionId: string, password: string): Promise<string | null> {
  const sql = dbClient();
  const owner = configuredOwnerId();
  const rows = await sql`
    SELECT s."user_id", a."id" AS account_id, a."password" AS password_hash,
      extract(epoch FROM s."updated_at")::text AS state_version
    FROM "application_user_state" s JOIN "user" u ON u."id" = s."user_id"
    JOIN "account" a ON a."user_id" = s."user_id" AND a."provider_id" = 'credential'
    WHERE s."user_id" = ${userId} AND s."status" = 'ACTIVE' AND s."role" = 'MEMBER'
      AND s."user_id" IS DISTINCT FROM ${owner}::text AND u."email_verified" = false
    LIMIT 2`;
  const c = rows.length === 1 ? credential(rows[0]) : null;
  if (!c) return null;
  const context = await auth.$context;
  if (!await context.password.verify({ hash: c.password_hash, password })) return null;
  const code = createRecoveryCode();
  const recordId = RECOVERY_RECORD_PREFIX + userId;
  const identifier = recoveryIdentifier(serverEnv.BETTER_AUTH_SECRET, code);
  const binding = bind(c);
  const [, , result] = await sql.transaction([
    sql`SET LOCAL statement_timeout = '5s'`, sql`SET LOCAL lock_timeout = '1s'`,
    sql`WITH eligible AS MATERIALIZED (
      SELECT s."user_id" FROM "application_user_state" s JOIN "user" u ON u."id" = s."user_id"
      WHERE s."user_id" = ${userId} AND s."role" = 'MEMBER' AND s."status" = 'ACTIVE'
        AND s."user_id" IS DISTINCT FROM ${owner}::text AND u."email_verified" = false
        AND extract(epoch FROM s."updated_at")::text = ${c.state_version}
      FOR UPDATE OF s, u
    ), locked_credential AS MATERIALIZED (
      SELECT a."user_id" FROM "account" a JOIN eligible e ON e."user_id" = a."user_id"
      WHERE a."id" = ${c.account_id} AND a."provider_id" = 'credential' AND a."password" = ${c.password_hash}
      FOR UPDATE OF a
    ), live_session AS MATERIALIZED (
      SELECT x."user_id" FROM "session" x JOIN locked_credential c ON c."user_id" = x."user_id"
      WHERE x."id" = ${sessionId} AND x."expires_at" > (now() AT TIME ZONE 'UTC') FOR UPDATE OF x
    ), rotated AS (
      INSERT INTO "verification" ("id", "identifier", "value", "expires_at", "created_at", "updated_at")
      SELECT ${recordId}, ${identifier}, ${binding}, (now() AT TIME ZONE 'UTC') + ${RECOVERY_CODE_DAYS}::int * interval '1 day',
        (now() AT TIME ZONE 'UTC'), (now() AT TIME ZONE 'UTC') FROM live_session WHERE true
      ON CONFLICT ("id") DO UPDATE SET "identifier" = excluded."identifier", "value" = excluded."value",
        "expires_at" = excluded."expires_at", "updated_at" = excluded."updated_at"
      RETURNING "id"
    ), audited AS (
      INSERT INTO "audit_logs" ("id", "actor_user_id", "action", "target_type", "target_id", "created_at")
      SELECT ${randomUUID()}, ${userId}, 'RECOVERY_CODE_ROTATED', 'USER', ${userId}, now() FROM rotated RETURNING "id"
    ) SELECT "id" FROM audited`,
  ]);
  return result.length === 1 ? code : null;
}

// The code itself is the recovery credential; no email address is looked up or accepted.
// Lookup uses the indexed HMAC identifier, not a scan of user records.
export async function redeemRecoveryCode(code: string, newPassword: string): Promise<boolean> {
  const sql = dbClient();
  const owner = configuredOwnerId();
  const identifier = recoveryIdentifier(serverEnv.BETTER_AUTH_SECRET, code);
  const rows = await sql`
    SELECT s."user_id", a."id" AS account_id, a."password" AS password_hash,
      extract(epoch FROM s."updated_at")::text AS state_version, v."value" AS binding
    FROM "verification" v
    JOIN "application_user_state" s ON s."user_id" = substring(v."id" FROM ${RECOVERY_RECORD_PREFIX.length + 1}::int)
    JOIN "user" u ON u."id" = s."user_id"
    JOIN "account" a ON a."user_id" = s."user_id" AND a."provider_id" = 'credential'
    WHERE v."identifier" = ${identifier} AND v."id" = (${RECOVERY_RECORD_PREFIX}::text || s."user_id")
      AND v."expires_at" > (now() AT TIME ZONE 'UTC') AND s."status" = 'ACTIVE' AND s."role" = 'MEMBER'
      AND s."user_id" IS DISTINCT FROM ${owner}::text AND u."email_verified" = false LIMIT 2`;
  const c = rows.length === 1 ? credential(rows[0]) : null;
  if (!c || !sameDigest(rows[0].binding, bind(c))) return false;
  // Use the configured Better Auth password hasher, not a separate password format.
  const context = await auth.$context;
  const newHash = await context.password.hash(newPassword);
  const recordId = RECOVERY_RECORD_PREFIX + c.user_id;
  const binding = bind(c);
  // Lock state and credential first. Consume by exact record id + identifier + binding,
  // so concurrent redemption, rotation, or a changed credential cannot reuse a code.
  // Password update, session deletion and audit are one atomic SQL transaction.
  const [, , result] = await sql.transaction([
    sql`SET LOCAL statement_timeout = '5s'`, sql`SET LOCAL lock_timeout = '1s'`,
    sql`WITH eligible AS MATERIALIZED (
      SELECT s."user_id" FROM "application_user_state" s JOIN "user" u ON u."id" = s."user_id"
      WHERE s."user_id" = ${c.user_id} AND s."role" = 'MEMBER' AND s."status" = 'ACTIVE'
        AND s."user_id" IS DISTINCT FROM ${owner}::text AND u."email_verified" = false
        AND extract(epoch FROM s."updated_at")::text = ${c.state_version}
      FOR UPDATE OF s, u
    ), locked_credential AS MATERIALIZED (
      SELECT a."id" FROM "account" a JOIN eligible e ON e."user_id" = a."user_id"
      WHERE a."id" = ${c.account_id} AND a."provider_id" = 'credential' AND a."password" = ${c.password_hash}
      FOR UPDATE OF a
    ), consumed AS (
      DELETE FROM "verification" WHERE "id" = ${recordId} AND "identifier" = ${identifier}
        AND "value" = ${binding} AND "expires_at" > (now() AT TIME ZONE 'UTC')
        AND EXISTS (SELECT 1 FROM locked_credential) RETURNING "id"
    ), changed AS (
      UPDATE "account" SET "password" = ${newHash}, "updated_at" = (now() AT TIME ZONE 'UTC')
      WHERE "id" IN (SELECT "id" FROM locked_credential) AND EXISTS (SELECT 1 FROM consumed)
      RETURNING "user_id"
    ), revoked AS (
      DELETE FROM "session" WHERE "user_id" IN (SELECT "user_id" FROM changed) RETURNING "id"
    ), audited AS (
      INSERT INTO "audit_logs" ("id", "actor_user_id", "action", "target_type", "target_id", "created_at")
      SELECT ${randomUUID()}, "user_id", 'RECOVERY_CODE_USED', 'USER', "user_id", now() FROM changed RETURNING "id"
    ) SELECT "id" FROM audited`,
  ]);
  return result.length === 1;
}
