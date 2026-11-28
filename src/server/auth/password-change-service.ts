import "server-only";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { auth } from "@/server/auth";
import { serverEnv } from "@/server/env";
import { RECOVERY_RECORD_PREFIX } from "./recovery-code-core";
import type { PasswordChangeInput } from "./password-change-core";

type ChangeResult = "changed" | "denied" | "invalid";

// The caller derives both identifiers from the authenticated session, never the body.
// Match the recovery service's state -> credential -> session lock order.
export async function changeOwnPassword(userId: string, sessionId: string, input: PasswordChangeInput): Promise<ChangeResult> {
  const sql = neon(serverEnv.DATABASE_URL_POOLED);
  const rows = await sql`
    SELECT a."id" AS account_id, a."password" AS password_hash,
      extract(epoch FROM s."updated_at")::text AS state_version
    FROM "application_user_state" s JOIN "account" a ON a."user_id" = s."user_id"
    JOIN "session" x ON x."user_id" = s."user_id"
    WHERE s."user_id" = ${userId} AND s."status" = 'ACTIVE'
      AND a."provider_id" = 'credential' AND x."id" = ${sessionId}
      AND x."expires_at" > (now() AT TIME ZONE 'UTC') LIMIT 2`;
  if (rows.length !== 1) return "denied";
  const row = rows[0];
  if (typeof row.account_id !== "string" || typeof row.password_hash !== "string" || !row.password_hash ||
      typeof row.state_version !== "string") return "denied";
  const accountId = row.account_id;
  const oldHash = row.password_hash;
  const stateVersion = row.state_version;
  const context = await auth.$context;
  if (!await context.password.verify({ hash: oldHash, password: input.currentPassword })) return "invalid";
  // Reject even equivalent passwords under the configured framework hasher.
  if (await context.password.verify({ hash: oldHash, password: input.newPassword })) return "invalid";
  const newHash = await context.password.hash(input.newPassword);
  const recoveryRecord = RECOVERY_RECORD_PREFIX + userId;
  // The credential comparison and fresh session/state check are repeated under locks.
  // Password change, recovery-code removal, session revocation and audit commit together.
  const [, , result] = await sql.transaction([
    sql`SET LOCAL statement_timeout = '5s'`, sql`SET LOCAL lock_timeout = '1s'`,
    sql`WITH eligible AS MATERIALIZED (
      SELECT s."user_id" FROM "application_user_state" s JOIN "user" u ON u."id" = s."user_id"
      WHERE s."user_id" = ${userId} AND s."status" = 'ACTIVE'
        AND extract(epoch FROM s."updated_at")::text = ${stateVersion}
      FOR UPDATE OF s, u
    ), locked_credential AS MATERIALIZED (
      SELECT a."id", a."user_id" FROM "account" a JOIN eligible e ON e."user_id" = a."user_id"
      WHERE a."id" = ${accountId} AND a."provider_id" = 'credential' AND a."password" = ${oldHash}
      FOR UPDATE OF a
    ), live_session AS MATERIALIZED (
      SELECT x."user_id" FROM "session" x JOIN locked_credential c ON c."user_id" = x."user_id"
      WHERE x."id" = ${sessionId} AND x."expires_at" > (now() AT TIME ZONE 'UTC') FOR UPDATE OF x
    ), changed AS (
      UPDATE "account" SET "password" = ${newHash}, "updated_at" = (now() AT TIME ZONE 'UTC')
      WHERE "id" IN (SELECT "id" FROM locked_credential) AND EXISTS (SELECT 1 FROM live_session)
      RETURNING "user_id"
    ), revoked AS (
      DELETE FROM "session" WHERE "user_id" IN (SELECT "user_id" FROM changed) RETURNING "id"
    ), invalidated AS (
      DELETE FROM "verification" WHERE "id" = ${recoveryRecord} AND EXISTS (SELECT 1 FROM changed)
      RETURNING "id"
    ), audited AS (
      INSERT INTO "audit_logs" ("id", "actor_user_id", "action", "target_type", "target_id", "created_at")
      SELECT ${randomUUID()}, "user_id", 'PASSWORD_CHANGED', 'USER', "user_id", now() FROM changed RETURNING "id"
    ) SELECT "id" FROM audited`,
  ]);
  return result.length === 1 ? "changed" : "denied";
}
