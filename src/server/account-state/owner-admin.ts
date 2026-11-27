import "server-only";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/server/auth";
import { serverEnv } from "@/server/env";
import { checkRateLimit } from "@/server/redis/rate-limit";
import { requireAdmin } from "./authorization";
import { configuredOwnerId } from "./owner";
import { isOwner } from "./owner-policy";

const schema = z.object({ targetUserId: z.string().regex(/^[A-Za-z0-9_-]{1,255}$/),
  action: z.enum(["PROMOTE", "DEMOTE"]), confirmed: z.literal(true),
  password: z.string().min(1).max(128),
});
export class OwnerRoleError extends Error {}

export async function changeAdministratorRole(input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new OwnerRoleError("Invalid request. Confirm the action and enter your current password.");
  const { targetUserId, action, password } = parsed.data;
  const { session, accountState } = await requireAdmin();
  const actorUserId = session.user.id;
  const ownerId = configuredOwnerId();
  if (!ownerId || !isOwner(ownerId, { ...accountState, userId: actorUserId }) || targetUserId === ownerId) {
    throw new OwnerRoleError("Only the configured owner may change another account's administrator role.");
  }
  // Direct server calls do not inherit the public auth HTTP limiter.
  const limit = await checkRateLimit("ownerRole", actorUserId, "deny");
  if (!limit.allowed) throw new OwnerRoleError("Role changes are temporarily unavailable. Try again later.");
  try {
    const verified = await auth.api.verifyPassword({ body: { password }, headers: await headers() });
    if (verified.status !== true) throw new Error("Verification failed");
  } catch {
    throw new OwnerRoleError("Password confirmation failed.");
  }
  const fromRole = action === "PROMOTE" ? "MEMBER" : "ADMIN";
  const toRole = action === "PROMOTE" ? "ADMIN" : "MEMBER";
  const auditAction = action === "PROMOTE" ? "ADMIN_ROLE_GRANTED" : "ADMIN_ROLE_REVOKED";
  const sql = neon(serverEnv.DATABASE_URL_POOLED);
  // Lock the current actor and session so concurrent revocation cannot bypass
  // authorization. Target update, session deletion and audit are one statement.
  const result = await sql`
    WITH transitioned AS (
      UPDATE "application_user_state" AS target
      SET "role" = ${toRole}::"account_role", "updated_at" = now()
      WHERE target."user_id" = ${targetUserId}
        AND target."user_id" <> ${ownerId}
        AND target."role" = ${fromRole}::"account_role"
        AND (${action} = 'DEMOTE' OR target."status" = 'ACTIVE')
        AND EXISTS (
          SELECT 1 FROM "application_user_state" AS actor
          WHERE actor."user_id" = ${actorUserId} AND actor."user_id" = ${ownerId}
            AND actor."role" = 'ADMIN' AND actor."status" = 'ACTIVE'
          FOR UPDATE
        )
        AND EXISTS (
          SELECT 1 FROM "session" AS actor_session
          WHERE actor_session."id" = ${session.session.id}
            AND actor_session."user_id" = ${actorUserId}
            AND actor_session."expires_at" > (now() AT TIME ZONE 'UTC')
          FOR UPDATE
        )
      RETURNING target."user_id"
    ), revoked AS (
      DELETE FROM "session" WHERE "user_id" IN (SELECT "user_id" FROM transitioned) RETURNING "id"
    ), audited AS (
      INSERT INTO "audit_logs" ("id", "actor_user_id", "action", "target_type", "target_id", "metadata", "created_at")
      SELECT ${randomUUID()}, ${actorUserId}, ${auditAction}, 'USER', "user_id",
        jsonb_build_object('from_role', ${fromRole}::text, 'to_role', ${toRole}::text), now()
      FROM transitioned RETURNING "target_id"
    )
    SELECT "target_id" FROM audited
  `;
  if (result.length !== 1) throw new OwnerRoleError("The requested role change is no longer allowed. Refresh the account page.");
  return { userId: targetUserId, role: toRole };
}
