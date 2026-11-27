import "server-only";
import { neon } from "@neondatabase/serverless";
import { AUDIT_BATCH, MAINTENANCE_BATCH, boundedCount, type MaintenancePolicy } from "./policy";

export async function runMaintenance(policy: MaintenancePolicy) {
  const databaseUrl = process.env.DATABASE_URL_POOLED;
  if (!databaseUrl) throw new Error("Maintenance database unavailable");
  const sql = neon(databaseUrl);
  // Inspect never writes or locks records. Counts are capped samples, not totals.
  const operation = policy.mode === "inspect" ? sql`
    SELECT
      (SELECT count(*) FROM (SELECT "id" FROM "session"
        WHERE "expires_at" < (now() AT TIME ZONE 'UTC') - interval '24 hours' LIMIT ${MAINTENANCE_BATCH}) AS s) AS sessions,
      (SELECT count(*) FROM (SELECT "id" FROM "verification"
        WHERE "expires_at" < (now() AT TIME ZONE 'UTC') - interval '24 hours' LIMIT ${MAINTENANCE_BATCH}) AS v) AS tokens,
      (SELECT count(*) FROM (SELECT "id" FROM "audit_logs"
        WHERE "action" <> 'ACCOUNT_DELETION_REQUESTED' AND "created_at" < now() - interval '365 days' LIMIT ${AUDIT_BATCH}) AS a) AS audit,
      true AS acquired
  ` : sql`
    WITH gate AS MATERIALIZED (
      SELECT pg_try_advisory_xact_lock(193710419, 19) AS acquired
    ), expired_sessions AS MATERIALIZED (
      SELECT "id" FROM "session" WHERE (SELECT acquired FROM gate)
        AND "expires_at" < (now() AT TIME ZONE 'UTC') - interval '24 hours'
      LIMIT ${MAINTENANCE_BATCH} FOR UPDATE SKIP LOCKED
    ), expired_tokens AS MATERIALIZED (
      SELECT "id" FROM "verification" WHERE (SELECT acquired FROM gate)
        AND "expires_at" < (now() AT TIME ZONE 'UTC') - interval '24 hours'
      LIMIT ${MAINTENANCE_BATCH} FOR UPDATE SKIP LOCKED
    ), old_audit AS MATERIALIZED (
      SELECT "id" FROM "audit_logs" WHERE ${policy.pruneAudit} AND (SELECT acquired FROM gate) AND "action" <> 'ACCOUNT_DELETION_REQUESTED'
        AND "created_at" < now() - interval '365 days'
      ORDER BY "created_at", "id" LIMIT ${AUDIT_BATCH} FOR UPDATE SKIP LOCKED
    ), removed_sessions AS (
      DELETE FROM "session" WHERE "id" IN (SELECT "id" FROM expired_sessions)
        AND "expires_at" < (now() AT TIME ZONE 'UTC') - interval '24 hours' RETURNING "id"
    ), removed_tokens AS (
      DELETE FROM "verification" WHERE "id" IN (SELECT "id" FROM expired_tokens)
        AND "expires_at" < (now() AT TIME ZONE 'UTC') - interval '24 hours' RETURNING "id"
    ), removed_audit AS (
      DELETE FROM "audit_logs" WHERE ${policy.pruneAudit} AND "id" IN (SELECT "id" FROM old_audit)
        AND "action" <> 'ACCOUNT_DELETION_REQUESTED' AND "created_at" < now() - interval '365 days' RETURNING "id"
    )
    SELECT (SELECT count(*) FROM removed_sessions) AS sessions,
      (SELECT count(*) FROM removed_tokens) AS tokens,
      (SELECT count(*) FROM removed_audit) AS audit,
      (SELECT acquired FROM gate) AS acquired
  `;
  // A row cap alone is not a scan cap; both timeout settings apply inside
  // this one HTTP transaction and roll back writes if the statement fails.
  const [, , rows] = await sql.transaction([
    sql`SET LOCAL statement_timeout = '5s'`,
    sql`SET LOCAL lock_timeout = '1s'`,
    operation,
  ]);
  const row = rows[0];
  if (!row || typeof row.acquired !== "boolean") throw new Error("Invalid maintenance result");
  return { mode: policy.mode, auditPruningEnabled: policy.pruneAudit, skipped: !row.acquired,
    sessions: boundedCount(row.sessions, MAINTENANCE_BATCH),
    expiredTokens: boundedCount(row.tokens, MAINTENANCE_BATCH),
    auditRecords: boundedCount(row.audit, AUDIT_BATCH),
  };
}
