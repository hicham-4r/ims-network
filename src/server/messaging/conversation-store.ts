import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";

import { serverEnv } from "@/server/env";

// Internal persistence module.
//
// Application routes and server actions must use
// openDirectConversation(), which validates the
// Better Auth session and ACTIVE member status.
//
// Do not expose this module directly through an API.
const sql = neon(serverEnv.DATABASE_URL_POOLED);

export class ConversationOpenError extends Error {
  constructor() {
    super("This conversation is unavailable.");
    this.name = "ConversationOpenError";
  }
}

async function findExistingConversation(
  actorUserId: string,
  targetUserId: string,
): Promise<string | null> {
  const rows = await sql`
    SELECT c."id"
    FROM "conversations" AS c
    WHERE
      c."low_user_id" = LEAST(
        ${actorUserId}::text COLLATE "C",
        ${targetUserId}::text COLLATE "C"
      )
      AND c."high_user_id" = GREATEST(
        ${actorUserId}::text COLLATE "C",
        ${targetUserId}::text COLLATE "C"
      )

      AND EXISTS (
        SELECT 1
        FROM "application_user_state" AS s
        WHERE s."user_id" = ${actorUserId}
          AND s."status" = 'ACTIVE'
      )

      AND EXISTS (
        SELECT 1
        FROM "application_user_state" AS s
        WHERE s."user_id" = ${targetUserId}
          AND s."status" = 'ACTIVE'
      )

      AND EXISTS (
        SELECT 1
        FROM "conversation_members" AS cm
        WHERE cm."conversation_id" = c."id"
          AND cm."user_id" = ${actorUserId}
      )

      AND EXISTS (
        SELECT 1
        FROM "conversation_members" AS cm
        WHERE cm."conversation_id" = c."id"
          AND cm."user_id" = ${targetUserId}
      )

      AND (
        SELECT count(*)
        FROM "conversation_members" AS cm
        WHERE cm."conversation_id" = c."id"
      ) = 2

    LIMIT 1
  `;

  const id = rows[0]?.id;

  return typeof id === "string" ? id : null;
}

export async function openDirectConversationForActor(
  actorUserId: string,
  targetUserId: string,
) {
  if (actorUserId === targetUserId) {
    throw new ConversationOpenError();
  }
  // Fast path: opening an existing conversation
  // should not perform unnecessary database writes.
  const existing = await findExistingConversation(
    actorUserId,
    targetUserId,
  );

  if (existing) {
    return {
      conversationId: existing,
      created: false,
    };
  }

  const newConversationId = randomUUID();

  // A single SQL statement atomically creates:
  //   1. The canonical direct conversation.
  //   2. Both conversation membership records.
  //
  // The unique pair index handles concurrent attempts.
  // An unsuccessful conflicting insert returns no rows,
  // after which we re-read the committed conversation.
  const created = await sql`
    WITH eligible_pair AS (
      SELECT
        LEAST(
          ${actorUserId}::text COLLATE "C",
          ${targetUserId}::text COLLATE "C"
        ) AS low_user_id,

        GREATEST(
          ${actorUserId}::text COLLATE "C",
          ${targetUserId}::text COLLATE "C"
        ) AS high_user_id

      WHERE
        EXISTS (
          SELECT 1
          FROM "application_user_state"
          WHERE "user_id" = ${actorUserId}
            AND "status" = 'ACTIVE'
        )
        AND EXISTS (
          SELECT 1
          FROM "application_user_state"
          WHERE "user_id" = ${targetUserId}
            AND "status" = 'ACTIVE'
        )
    ),

    inserted AS (
      INSERT INTO "conversations" (
        "id",
        "low_user_id",
        "high_user_id"
      )
      SELECT
        ${newConversationId},
        low_user_id,
        high_user_id
      FROM eligible_pair

      ON CONFLICT (
        "low_user_id",
        "high_user_id"
      ) DO NOTHING

      RETURNING
        "id",
        "low_user_id",
        "high_user_id"
    ),

    inserted_members AS (
      INSERT INTO "conversation_members" (
        "conversation_id",
        "user_id"
      )
      SELECT
        inserted."id",
        participants."user_id"
      FROM inserted
      CROSS JOIN LATERAL (
        VALUES
          (inserted."low_user_id"),
          (inserted."high_user_id")
      ) AS participants("user_id")

      RETURNING "user_id"
    )

    SELECT
      inserted."id",
      (
        SELECT count(*)::integer
        FROM inserted_members
      ) AS "member_count"
    FROM inserted
  `;

  if (created.length === 1) {
    const row = created[0];

    if (
      typeof row.id !== "string" ||
      Number(row.member_count) !== 2
    ) {
      throw new ConversationOpenError();
    }

    return {
      conversationId: row.id,
      created: true,
    };
  }

  if (created.length !== 0) {
    throw new ConversationOpenError();
  }

  // Another request may have created the same pair.
  // Use a new database query to see its committed result.
  const concurrent = await findExistingConversation(
    actorUserId,
    targetUserId,
  );

  if (!concurrent) {
    throw new ConversationOpenError();
  }

  return {
    conversationId: concurrent,
    created: false,
  };
}
