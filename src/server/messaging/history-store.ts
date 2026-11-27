import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { z } from "zod";

import { parseReaction, quotePreview } from "@/lib/chat-interactions";
import { serverEnv } from "@/server/env";

const sql = neon(serverEnv.DATABASE_URL_POOLED);

export const MESSAGE_PAGE_SIZE = 30;

const historyInputSchema = z
  .object({
    conversationId: z.string().min(1).max(255),
    cursor: z.string().min(1).max(1024).optional(),
  })
  .strict();

const cursorSchema = z
  .object({
    v: z.literal(1),
    conversationId: z.string().min(1).max(255),
    actorUserId: z.string().min(1).max(255),
    beforeSequence: z
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

type HistoryCursor = z.infer<typeof cursorSchema>;

export class MessageHistoryError extends Error {
  constructor(
    readonly code:
      | "INVALID_QUERY"
      | "CONVERSATION_UNAVAILABLE",
  ) {
    super(
      code === "INVALID_QUERY"
        ? "Invalid message-history request."
        : "This conversation is unavailable.",
    );

    this.name = "MessageHistoryError";
  }
}

function signCursor(encoded: string): Buffer {
  return createHmac(
    "sha256",
    serverEnv.BETTER_AUTH_SECRET,
  )
    .update("ims-network:message-history:v1")
    .update("\0")
    .update(encoded)
    .digest();
}

function encodeCursor(
  cursor: HistoryCursor,
): string {
  const encoded = Buffer.from(
    JSON.stringify(cursor),
    "utf8",
  ).toString("base64url");

  const signature = signCursor(encoded)
    .toString("base64url");

  return `${encoded}.${signature}`;
}

function decodeCursor(
  raw: string,
  conversationId: string,
  actorUserId: string,
): HistoryCursor {
  try {
    const parts = raw.split(".");

    if (
      parts.length !== 2 ||
      !parts.every(
        (part) => /^[A-Za-z0-9_-]+$/.test(part),
      )
    ) {
      throw new Error("Invalid cursor encoding.");
    }

    const [encoded, signature] = parts;

    const receivedSignature = Buffer.from(
      signature,
      "base64url",
    );

    const expectedSignature = signCursor(encoded);

    if (
      receivedSignature.length !==
        expectedSignature.length ||
      !timingSafeEqual(
        receivedSignature,
        expectedSignature,
      )
    ) {
      throw new Error("Invalid cursor signature.");
    }

    const payload: unknown = JSON.parse(
      Buffer.from(encoded, "base64url")
        .toString("utf8"),
    );

    const parsed = cursorSchema.safeParse(payload);

    if (
      !parsed.success ||
      parsed.data.conversationId !== conversationId ||
      parsed.data.actorUserId !== actorUserId
    ) {
      throw new Error("Cursor does not match request.");
    }

    return parsed.data;
  } catch {
    throw new MessageHistoryError("INVALID_QUERY");
  }
}

export async function getConversationHistoryForActor(
  actorUserId: string,
  input: unknown,
) {

  const parsed = historyInputSchema.safeParse(input);

  if (!parsed.success) {
    throw new MessageHistoryError("INVALID_QUERY");
  }


  const { conversationId } = parsed.data;

  const cursor = parsed.data.cursor
    ? decodeCursor(
        parsed.data.cursor,
        conversationId,
        actorUserId,
      )
    : null;

  const beforeSequence =
    cursor?.beforeSequence ?? null;

  // Authorization and message retrieval happen
  // inside one PostgreSQL statement and snapshot.
  //
  // Both members must currently be ACTIVE.
  // The requester must be one of the two members.
  // Membership count must be exactly two.
  //
  // No message history is cached in Redis.
  const rows = await sql`
    WITH authorized_conversation AS (
      SELECT c."id", COALESCE(other_member."last_read_message_sequence", 0::bigint) AS peer_read_sequence
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
        ON other_state."user_id" =
          other_member."user_id"
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
      a."id" AS authorized_conversation_id,
      recent."id" AS message_id,
      recent."sequence" AS message_sequence,
      recent."sender_user_id" AS sender_user_id,
      recent."body" AS message_body,
      recent."created_at" AS message_created_at,
      CASE WHEN recent."sender_user_id" = ${actorUserId} THEN recent."client_message_id" ELSE NULL END AS own_client_message_id,
      a.peer_read_sequence,
      recent."delivered_at", recent."reply_to_message_id", quoted."body" AS quoted_body, quoted."sender_user_id" AS quoted_sender,
      recent."sender_reaction", recent."peer_reaction"

    FROM authorized_conversation AS a

    LEFT JOIN LATERAL (
      SELECT
        m."id",
        m."sequence",
        m."sender_user_id",
        m."body",
        m."created_at",
        m."client_message_id", m."delivered_at", m."reply_to_message_id", m."sender_reaction", m."peer_reaction"

      FROM "messages" AS m

      WHERE m."conversation_id" = a."id"
        AND (
          ${beforeSequence}::bigint IS NULL
          OR m."sequence" <
            ${beforeSequence}::bigint
        )

      ORDER BY m."sequence" DESC

      LIMIT ${MESSAGE_PAGE_SIZE + 1}
    ) AS recent ON TRUE

    LEFT JOIN "messages" quoted ON quoted."id" = recent."reply_to_message_id"
      AND quoted."conversation_id" = a."id"
    ORDER BY recent."sequence" DESC NULLS LAST
  `;

  // No authorized conversation exists.
  if (rows.length === 0) {
    throw new MessageHistoryError(
      "CONVERSATION_UNAVAILABLE",
    );
  }

  const messageRows = rows.filter(
    (row) => row.message_id !== null,
  );

  const hasMore =
    messageRows.length > MESSAGE_PAGE_SIZE;

  const visibleRows = messageRows.slice(
    0,
    MESSAGE_PAGE_SIZE,
  );

  const messages = visibleRows.map((row) => {
    const sequence = Number(
      row.message_sequence,
    );

    if (
      !Number.isSafeInteger(sequence) ||
      sequence < 1 ||
      typeof row.message_id !== "string" ||
      typeof row.sender_user_id !== "string" ||
      typeof row.message_body !== "string"
    ) {
      throw new Error(
        "Unexpected message-history result.",
      );
    }

    const rawDate = row.message_created_at;

    const createdAt =
      rawDate instanceof Date
        ? rawDate
        : new Date(String(rawDate));

    if (Number.isNaN(createdAt.getTime())) {
      throw new Error(
        "Unexpected message timestamp.",
      );
    }

    const peerReadSequence = Number(row.peer_read_sequence);
    if (!Number.isSafeInteger(peerReadSequence) || peerReadSequence < 0) {
      throw new Error("Unexpected read cursor.");
    }
    const own = row.sender_user_id === actorUserId;
    return {
      id: row.message_id,
      clientMessageId: own && typeof row.own_client_message_id === "string" ? row.own_client_message_id : null,
      readByPeer: own && peerReadSequence >= sequence,
      delivered: row.delivered_at != null,
      reply: typeof row.quoted_body === "string" && typeof row.reply_to_message_id === "string" ? { id: row.reply_to_message_id, body: quotePreview(row.quoted_body), own: row.quoted_sender === actorUserId } : null,
      myReaction: parseReaction(own ? row.sender_reaction : row.peer_reaction),
      peerReaction: parseReaction(own ? row.peer_reaction : row.sender_reaction),
      sequence,
      senderUserId: row.sender_user_id,
      body: row.message_body,
      createdAt: createdAt.toISOString(),
    };
  });

  const oldestVisible =
    messages[messages.length - 1];

  const nextCursor =
    hasMore && oldestVisible
      ? encodeCursor({
          v: 1,
          conversationId,
          actorUserId,
          beforeSequence: oldestVisible.sequence,
        })
      : null;

  return {
    messages,
    nextCursor,
    hasMore,
  };
}
