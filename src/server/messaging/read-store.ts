import { neon } from "@neondatabase/serverless";
import { z } from "zod";

import { serverEnv } from "@/server/env";

const sql = neon(serverEnv.DATABASE_URL_POOLED);

const identifier = z.string().min(1).max(255);

const readInputSchema = z.object({
  conversationId: identifier,
  messageId: identifier,
}).strict();

const unreadInputSchema = z.object({
  conversationId: identifier,
}).strict();

export class MessageReadError extends Error {
  constructor(
    readonly code: "INVALID_INPUT" | "CONVERSATION_UNAVAILABLE",
  ) {
    super(
      code === "INVALID_INPUT"
        ? "Invalid read-position request."
        : "This conversation is unavailable.",
    );
    this.name = "MessageReadError";
  }
}

function parseSequence(value: unknown): number {
  const sequence = Number(value);

  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 1
  ) {
    throw new Error("Unexpected message sequence.");
  }

  return sequence;
}

// Internal database function.
// Routes and server actions must use the authenticated
// wrapper in reads.ts, never accept actor IDs from clients.
export async function markConversationReadForActor(
  actorUserId: string,
  input: unknown,
) {
  const parsed = readInputSchema.safeParse(input);

  if (!parsed.success || !identifier.safeParse(actorUserId).success) {
    throw new MessageReadError("INVALID_INPUT");
  }

  const { conversationId, messageId } = parsed.data;

  // The target message must exist in this conversation.
  // The actor and the other participant must be ACTIVE.
  // Both membership rows must exist.
  //
  // GREATEST ensures concurrent updates cannot decrease
  // the stored read position.
  const rows = await sql`
    WITH authorized AS (
      SELECT c."id", other_member."user_id" AS peer_id,
        COALESCE(actor_member."last_read_message_sequence", 0::bigint) AS previous_read
      FROM "conversations" AS c

      INNER JOIN "conversation_members" AS actor_member
        ON actor_member."conversation_id" = c."id"
        AND actor_member."user_id" = ${actorUserId}

      INNER JOIN "conversation_members" AS other_member
        ON other_member."conversation_id" = c."id"
        AND other_member."user_id" =
          CASE
            WHEN c."low_user_id" = ${actorUserId}
              THEN c."high_user_id"
            ELSE c."low_user_id"
          END

      INNER JOIN "application_user_state" AS actor_state
        ON actor_state."user_id" = ${actorUserId}
        AND actor_state."status" = 'ACTIVE'

      INNER JOIN "application_user_state" AS other_state
        ON other_state."user_id" = other_member."user_id"
        AND other_state."status" = 'ACTIVE'

      WHERE c."id" = ${conversationId}
        AND ${actorUserId} IN (
          c."low_user_id",
          c."high_user_id"
        )
        AND (
          SELECT count(*)
          FROM "conversation_members" AS cm
          WHERE cm."conversation_id" = c."id"
        ) = 2

      LIMIT 1
      FOR UPDATE OF actor_member
    ),

    target_message AS (
      SELECT m."sequence", a.peer_id, a.previous_read
      FROM "messages" AS m
      INNER JOIN authorized AS a
        ON a."id" = m."conversation_id"
      WHERE m."id" = ${messageId}
        AND m."conversation_id" = ${conversationId}
      LIMIT 1
    )

    UPDATE "conversation_members" AS cm

    SET "last_read_message_sequence" =
      GREATEST(
        COALESCE(
          cm."last_read_message_sequence",
          0::bigint
        ),
        target_message."sequence"
      )

    FROM target_message

    WHERE cm."conversation_id" = ${conversationId}
      AND cm."user_id" = ${actorUserId}

    RETURNING
      cm."last_read_message_sequence" AS read_sequence,
      target_message.peer_id,
      (cm."last_read_message_sequence" > target_message.previous_read) AS advanced
  `;

  if (rows.length !== 1) {
    throw new MessageReadError("CONVERSATION_UNAVAILABLE");
  }

  return {
    conversationId,
    lastReadSequence: parseSequence(rows[0].read_sequence),
    advanced: rows[0].advanced === true,
    peerUserId: typeof rows[0].peer_id === "string" ? rows[0].peer_id : null,
  };
}

// Count incoming messages after the member's read position.
// A null cursor means the member has not marked any message
// as read yet.
export async function getUnreadCountForActor(
  actorUserId: string,
  input: unknown,
) {
  const parsed = unreadInputSchema.safeParse(input);

  if (!parsed.success || !identifier.safeParse(actorUserId).success) {
    throw new MessageReadError("INVALID_INPUT");
  }

  const { conversationId } = parsed.data;

  const rows = await sql`
    WITH authorized AS (
      SELECT
        c."id",
        actor_member."last_read_message_sequence"

      FROM "conversations" AS c

      INNER JOIN "conversation_members" AS actor_member
        ON actor_member."conversation_id" = c."id"
        AND actor_member."user_id" = ${actorUserId}

      INNER JOIN "conversation_members" AS other_member
        ON other_member."conversation_id" = c."id"
        AND other_member."user_id" =
          CASE
            WHEN c."low_user_id" = ${actorUserId}
              THEN c."high_user_id"
            ELSE c."low_user_id"
          END

      INNER JOIN "application_user_state" AS actor_state
        ON actor_state."user_id" = ${actorUserId}
        AND actor_state."status" = 'ACTIVE'

      INNER JOIN "application_user_state" AS other_state
        ON other_state."user_id" = other_member."user_id"
        AND other_state."status" = 'ACTIVE'

      WHERE c."id" = ${conversationId}
        AND ${actorUserId} IN (
          c."low_user_id",
          c."high_user_id"
        )
        AND (
          SELECT count(*)
          FROM "conversation_members" AS cm
          WHERE cm."conversation_id" = c."id"
        ) = 2

      LIMIT 1
    )

    SELECT
      a."last_read_message_sequence",
      (
        SELECT count(*)::bigint
        FROM "messages" AS m
        WHERE m."conversation_id" = a."id"
          AND m."sender_user_id" <> ${actorUserId}
          AND m."sequence" > COALESCE(
            a."last_read_message_sequence",
            0::bigint
          )
      ) AS unread_count

    FROM authorized AS a
  `;

  if (rows.length !== 1) {
    throw new MessageReadError("CONVERSATION_UNAVAILABLE");
  }

  const row = rows[0];
  const unreadCount = Number(row.unread_count);

  if (
    !Number.isSafeInteger(unreadCount) ||
    unreadCount < 0
  ) {
    throw new Error("Unexpected unread count.");
  }

  return {
    conversationId,
    lastReadSequence:
      row.last_read_message_sequence === null
        ? null
        : parseSequence(row.last_read_message_sequence),
    unreadCount,
  };
}
