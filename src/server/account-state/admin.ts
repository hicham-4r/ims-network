import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { z } from "zod";

import {
  requireAdmin,
} from "@/server/account-state/authorization";
import { serverEnv } from "@/server/env";
import { checkRateLimit } from "@/server/redis/rate-limit";
import { configuredOwnerId } from "./owner";

const adminAccountMutationSchema = z
  .object({
    targetUserId: z
      .string()
      .trim()
      .min(1)
      .max(255),

    action: z.enum([
      "APPROVE",
      "REJECT",
      "SUSPEND",
      "RESTORE",
    ]),

    confirmed: z.literal(true),

    reason: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .optional(),
  })
  .superRefine((value, context) => {
    if (
      (value.action === "REJECT" ||
        value.action === "SUSPEND") &&
      !value.reason
    ) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message:
          "A reason is required for this action.",
      });
    }
  });

export type AdminAccountAction =
  z.infer<
    typeof adminAccountMutationSchema
  >["action"];

type TransitionConfig = {
  fromStatus:
    | "PENDING_APPROVAL"
    | "ACTIVE"
    | "SUSPENDED";
  toStatus:
    | "ACTIVE"
    | "REJECTED"
    | "SUSPENDED";
  auditAction:
    | "ACCOUNT_APPROVED"
    | "ACCOUNT_REJECTED"
    | "ACCOUNT_SUSPENDED"
    | "ACCOUNT_RESTORED";
  revokeSessions: boolean;
};

const transitionConfig: Record<
  AdminAccountAction,
  TransitionConfig
> = {
  APPROVE: {
    fromStatus: "PENDING_APPROVAL",
    toStatus: "ACTIVE",
    auditAction: "ACCOUNT_APPROVED",
    revokeSessions: false,
  },

  REJECT: {
    fromStatus: "PENDING_APPROVAL",
    toStatus: "REJECTED",
    auditAction: "ACCOUNT_REJECTED",
    revokeSessions: true,
  },

  SUSPEND: {
    fromStatus: "ACTIVE",
    toStatus: "SUSPENDED",
    auditAction: "ACCOUNT_SUSPENDED",
    revokeSessions: true,
  },

  RESTORE: {
    fromStatus: "SUSPENDED",
    toStatus: "ACTIVE",
    auditAction: "ACCOUNT_RESTORED",
    revokeSessions: false,
  },
};

export class AdminAccountMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAccountMutationError";
  }
}

export async function changeAccountState(
  input: unknown,
) {
  const parsed =
    adminAccountMutationSchema.safeParse(input);

  if (!parsed.success) {
    throw new AdminAccountMutationError(
      "Invalid account-management request.",
    );
  }

  const {
    targetUserId,
    action,
    reason,
  } = parsed.data;

  const {
    session,
  } = await requireAdmin();

  const actorUserId = session.user.id;
  const ownerId = configuredOwnerId();

  if (
    actorUserId === targetUserId
  ) {
    throw new AdminAccountMutationError(
      "Administrators cannot change their own account state.",
    );
  }

  const rateLimit = await checkRateLimit("adminModeration", actorUserId, "deny");
  if (!rateLimit.allowed) {
    throw new AdminAccountMutationError("Account management is temporarily limited. Try again shortly.");
  }

  const transition =
    transitionConfig[action];

  const sql = neon(
    serverEnv.DATABASE_URL_POOLED,
  );

  const auditId = randomUUID();

  const result = await sql`
    WITH transitioned AS (
      UPDATE "application_user_state"
      SET
        "status" =
          ${transition.toStatus}::"account_status",

        "approved_at" =
          CASE
            WHEN ${action} = 'APPROVE'
              THEN now()
            ELSE "approved_at"
          END,

        "approved_by" =
          CASE
            WHEN ${action} = 'APPROVE'
              THEN ${actorUserId}
            ELSE "approved_by"
          END,

        "rejected_at" =
          CASE
            WHEN ${action} = 'REJECT'
              THEN now()
            ELSE "rejected_at"
          END,

        "rejection_reason" =
          CASE
            WHEN ${action} = 'REJECT'
              THEN ${reason ?? null}
            ELSE "rejection_reason"
          END,

        "suspended_at" =
          CASE
            WHEN ${action} = 'SUSPEND'
              THEN now()
            WHEN ${action} = 'RESTORE'
              THEN NULL
            ELSE "suspended_at"
          END,

        "suspension_reason" =
          CASE
            WHEN ${action} = 'SUSPEND'
              THEN ${reason ?? null}
            WHEN ${action} = 'RESTORE'
              THEN NULL
            ELSE "suspension_reason"
          END,

        "updated_at" = now()

      WHERE
        "user_id" = ${targetUserId}
        AND "role" = 'MEMBER'
        AND "user_id" IS DISTINCT FROM ${ownerId}::text
        AND EXISTS (
          SELECT 1 FROM "application_user_state" AS actor
          WHERE actor."user_id" = ${actorUserId}
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
        AND "status" =
          ${transition.fromStatus}::"account_status"

      RETURNING "user_id"
    ),

    revoked_sessions AS (
      DELETE FROM "session"
      WHERE
        "user_id" IN (
          SELECT "user_id"
          FROM transitioned
        )
        AND ${transition.revokeSessions}
      RETURNING "id"
    ),

    audited AS (
      INSERT INTO "audit_logs" (
        "id",
        "actor_user_id",
        "action",
        "target_type",
        "target_id",
        "metadata",
        "created_at"
      )
      SELECT
        ${auditId},
        ${actorUserId},
        ${transition.auditAction},
        'USER',
        transitioned."user_id",
        jsonb_build_object(
          'from_status',
          ${transition.fromStatus}::text,
          'to_status',
          ${transition.toStatus}::text
        ),
        now()
      FROM transitioned

      RETURNING "target_id"
    )

    SELECT
      transitioned."user_id"
    FROM transitioned
    INNER JOIN audited
      ON audited."target_id" =
        transitioned."user_id"
  `;

  if (result.length !== 1) {
    throw new AdminAccountMutationError(
      "The requested account transition is not allowed.",
    );
  }

  return {
    userId: targetUserId,
    action,
    status: transition.toStatus,
  };
}
