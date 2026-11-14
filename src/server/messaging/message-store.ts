import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";

import { serverEnv } from "@/server/env";

const sql = neon(serverEnv.DATABASE_URL_POOLED);

export type MessageSendErrorCode =
  | "INVALID_INPUT"
  | "CONVERSATION_UNAVAILABLE"
  | "RATE_LIMITED"
  | "RATE_LIMIT_UNAVAILABLE"
  | "IDEMPOTENCY_CONFLICT";

export class MessageSendError extends Error {
  constructor(
    readonly code: MessageSendErrorCode,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(
      code === "RATE_LIMITED"
        ? "Too many messages. Please try again later."
        : code === "RATE_LIMIT_UNAVAILABLE"
          ? "Messaging is temporarily unavailable."
          : code === "INVALID_INPUT"
            ? "Invalid message information."
            : code === "IDEMPOTENCY_CONFLICT"
              ? "This message request conflicts with an earlier send."
              : "This conversation is unavailable.",
    );

    this.name = "MessageSendError";
  }
}

type PersistMessageInput = {
  actorUserId: string;
  conversationId: string;
  body: string;
  // Optional temporarily for existing legacy/import tests.
  // The authenticated send service always requires this UUID.
  clientMessageId?: string;
};

// Internal database function.
//
// All application entry points must validate the
// Better Auth session before calling this function.
export async function persistMessageForActor({
  actorUserId,
  conversationId,
  body,
  clientMessageId,
}: PersistMessageInput) {
  const messageId = randomUUID();

  // This HTTP transaction executes both statements
  // on the same PostgreSQL transaction.
  //
  // FOR UPDATE serializes sends to this conversation.
  // The message sequence is assigned only after the
  // conversation lock has been acquired.
  //
  // READ COMMITTED allows the second statement to
  // observe a fresh authorization snapshot.
  const [locked, inserted] = await sql.transaction(
    [
      sql`
        SELECT "id"
        FROM "conversations"
        WHERE "id" = ${conversationId}
        FOR UPDATE
      `,

      sql`
        INSERT INTO "messages" (
          "id",
          "conversation_id",
          "sender_user_id",
          "body",
          "client_message_id"
        )
        SELECT
          ${messageId},
          c."id",
          ${actorUserId},
          ${body},
          ${clientMessageId ?? null}::uuid
        FROM "conversations" AS c

        INNER JOIN "conversation_members" AS sender_member
          ON sender_member."conversation_id" = c."id"
          AND sender_member."user_id" = ${actorUserId}

        INNER JOIN "conversation_members" AS recipient_member
          ON recipient_member."conversation_id" = c."id"
          AND recipient_member."user_id" =
            CASE
              WHEN c."low_user_id" = ${actorUserId}
                THEN c."high_user_id"
              ELSE c."low_user_id"
            END

        INNER JOIN "application_user_state" AS sender_state
          ON sender_state."user_id" = ${actorUserId}
          AND sender_state."status" = 'ACTIVE'

        INNER JOIN "application_user_state" AS recipient_state
          ON recipient_state."user_id" =
            recipient_member."user_id"
          AND recipient_state."status" = 'ACTIVE'

        WHERE
          c."id" = ${conversationId}

          AND ${actorUserId} IN (
            c."low_user_id",
            c."high_user_id"
          )

          AND (
            SELECT count(*)
            FROM "conversation_members" AS cm
            WHERE cm."conversation_id" = c."id"
          ) = 2

        ON CONFLICT (
          "conversation_id",
          "sender_user_id",
          "client_message_id"
        )
        WHERE "client_message_id" IS NOT NULL
        DO NOTHING

        RETURNING
          "id",
          "sequence",
          "conversation_id",
          "sender_user_id",
          "body",
          "created_at"
      `,
    ],
    {
      isolationLevel: "ReadCommitted",
    },
  );

  if (locked.length !== 1) {
    throw new MessageSendError("CONVERSATION_UNAVAILABLE");
  }

  let row = inserted[0];

  // The unique index suppressed an identical retry.
  // Read the original record only after independently
  // verifying current participant authorization.
  if (!row && clientMessageId) {
    const existing = await sql`
      SELECT
        m."id",
        m."sequence",
        m."conversation_id",
        m."sender_user_id",
        m."body",
        m."created_at"
      FROM "messages" AS m
      INNER JOIN "conversations" AS c
        ON c."id" = m."conversation_id"

      INNER JOIN "conversation_members" AS sender_member
        ON sender_member."conversation_id" = c."id"
        AND sender_member."user_id" = ${actorUserId}

      INNER JOIN "conversation_members" AS recipient_member
        ON recipient_member."conversation_id" = c."id"
        AND recipient_member."user_id" =
          CASE
            WHEN c."low_user_id" = ${actorUserId}
              THEN c."high_user_id"
            ELSE c."low_user_id"
          END

      INNER JOIN "application_user_state" AS sender_state
        ON sender_state."user_id" = ${actorUserId}
        AND sender_state."status" = 'ACTIVE'

      INNER JOIN "application_user_state" AS recipient_state
        ON recipient_state."user_id" =
          recipient_member."user_id"
        AND recipient_state."status" = 'ACTIVE'

      WHERE
        m."conversation_id" = ${conversationId}
        AND m."sender_user_id" = ${actorUserId}
        AND m."client_message_id" = ${clientMessageId}::uuid

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
    `;

    row = existing[0];

    if (row && row.body !== body) {
      throw new MessageSendError("IDEMPOTENCY_CONFLICT");
    }
  }

  if (!row) {
    throw new MessageSendError("CONVERSATION_UNAVAILABLE");
  }

  const sequence = Number(row.sequence);

  if (
    typeof row.id !== "string" ||
    !Number.isSafeInteger(sequence) ||
    sequence < 1
  ) {
    throw new Error("Unexpected message persistence result.");
  }

  const createdAt = new Date(
    String(row.created_at),
  );

  if (Number.isNaN(createdAt.getTime())) {
    throw new Error("Unexpected message timestamp.");
  }

  return {
    id: row.id,
    sequence,
    conversationId: String(row.conversation_id),
    senderUserId: String(row.sender_user_id),
    body: String(row.body),
    createdAt: createdAt.toISOString(),
  };
}
