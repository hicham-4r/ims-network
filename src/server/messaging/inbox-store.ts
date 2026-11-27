import { createHmac, timingSafeEqual } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { z } from "zod";

import { serverEnv } from "@/server/env";

const sql = neon(serverEnv.DATABASE_URL_POOLED);

export const INBOX_PAGE_SIZE = 20;

const identifier = z.string().min(1).max(255);

const inputSchema = z.object({
  cursor: z.string().min(1).max(2048).optional(),
}).strict();

const cursorSchema = z.object({
  v: z.literal(1),
  actorUserId: identifier,
  snapshotSequence: z.number().int()
    .min(0).max(Number.MAX_SAFE_INTEGER),
  beforeSequence: z.number().int()
    .min(0).max(Number.MAX_SAFE_INTEGER),
  beforeConversationId: identifier,
}).strict();

type InboxCursor = z.infer<typeof cursorSchema>;

export class InboxError extends Error {
  constructor(
    readonly code: "INVALID_QUERY",
  ) {
    super("Invalid inbox request.");
    this.name = "InboxError";
  }
}

function sign(value: string): Buffer {
  return createHmac(
    "sha256",
    serverEnv.BETTER_AUTH_SECRET,
  )
    .update("ims-network:conversation-inbox:v1")
    .update("\0")
    .update(value)
    .digest();
}

function encodeCursor(payload: InboxCursor): string {
  const encoded = Buffer.from(
    JSON.stringify(payload),
    "utf8",
  ).toString("base64url");

  const signature = sign(encoded)
    .toString("base64url");

  return `${encoded}.${signature}`;
}

function decodeCursor(
  raw: string,
  actorUserId: string,
): InboxCursor {
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

    const received = Buffer.from(
      signature,
      "base64url",
    );

    const expected = sign(encoded);

    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      throw new Error("Invalid cursor signature.");
    }

    const rawPayload: unknown = JSON.parse(
      Buffer.from(encoded, "base64url")
        .toString("utf8"),
    );

    const result = cursorSchema.safeParse(rawPayload);

    if (
      !result.success ||
      result.data.actorUserId !== actorUserId
    ) {
      throw new Error("Invalid cursor payload.");
    }

    return result.data;
  } catch {
    throw new InboxError("INVALID_QUERY");
  }
}

function safeSequence(
  value: unknown,
  allowZero = false,
): number {
  const result = Number(value);

  if (
    !Number.isSafeInteger(result) ||
    result < (allowZero ? 0 : 1)
  ) {
    throw new Error("Unexpected database sequence.");
  }

  return result;
}

function safeDate(value: unknown): string {
  const date = value instanceof Date
    ? value
    : new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    throw new Error("Unexpected database timestamp.");
  }

  return date.toISOString();
}

// Internal database entry point.
// Browser requests must use getConversationInbox()
// from inbox.ts, which derives identity from Better Auth.
export async function getConversationInboxForActor(
  actorUserId: string,
  input: unknown = {},
) {
  if (!identifier.safeParse(actorUserId).success) {
    throw new InboxError("INVALID_QUERY");
  }

  const parsed = inputSchema.safeParse(input);

  if (!parsed.success) {
    throw new InboxError("INVALID_QUERY");
  }

  const cursor = parsed.data.cursor
    ? decodeCursor(parsed.data.cursor, actorUserId)
    : null;

  const snapshotSequence =
    cursor?.snapshotSequence ?? null;

  const beforeSequence =
    cursor?.beforeSequence ?? null;

  const beforeConversationId =
    cursor?.beforeConversationId ?? null;

  // Every request revalidates:
  // - actor's conversation membership
  // - the other participant's membership
  // - both ACTIVE account states
  // - exactly two conversation members
  //
  // The pagination snapshot prevents later messages
  // from reshuffling existing conversations across pages.
  //
  // Unread counts are calculated for the selected page
  // using incoming messages only.
  const rows = await sql`
    WITH authorized AS (
      SELECT
        c."id" AS conversation_id,
        other_member."user_id" AS other_user_id,
        COALESCE(other_profile."display_name", other_user."name") AS other_name,
        (other_profile."avatar_url" IS NOT NULL) AS other_has_avatar,
        other_profile."updated_at" AS other_avatar_updated_at,
        actor_member."last_read_message_sequence"
          AS last_read_sequence

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

      INNER JOIN "user" AS other_user
        ON other_user."id" = other_member."user_id"

      LEFT JOIN "profiles" AS other_profile
        ON other_profile."user_id" = other_member."user_id"

      INNER JOIN "application_user_state" AS actor_state
        ON actor_state."user_id" = ${actorUserId}
        AND actor_state."status" = 'ACTIVE'

      INNER JOIN "application_user_state" AS other_state
        ON other_state."user_id" = other_member."user_id"
        AND other_state."status" = 'ACTIVE'

      WHERE ${actorUserId} IN (
        c."low_user_id",
        c."high_user_id"
      )

      AND (
        SELECT count(*)
        FROM "conversation_members" AS cm
        WHERE cm."conversation_id" = c."id"
      ) = 2
    ),

    snapshot AS (
      SELECT COALESCE(
        ${snapshotSequence}::bigint,
        (
          SELECT COALESCE(MAX(m."sequence"), 0::bigint)
          FROM "messages" AS m
          INNER JOIN authorized AS a
            ON a.conversation_id = m."conversation_id"
        )
      ) AS snapshot_sequence
    ),

    ranked AS (
      SELECT
        a.conversation_id,
        a.other_user_id,
        a.other_name,
        a.other_has_avatar,
        a.other_avatar_updated_at,
        a.last_read_sequence,

        latest."id" AS last_message_id,
        latest."sequence" AS last_message_sequence,
        latest."sender_user_id" AS last_message_sender,
        latest."body" AS last_message_body,
        latest."created_at" AS last_message_created_at,

        COALESCE(
          latest."sequence",
          0::bigint
        ) AS sort_sequence

      FROM authorized AS a
      CROSS JOIN snapshot AS s

      LEFT JOIN LATERAL (
        SELECT
          m."id",
          m."sequence",
          m."sender_user_id",
          m."body",
          m."created_at"

        FROM "messages" AS m

        WHERE m."conversation_id" = a.conversation_id
          AND m."sequence" <= s.snapshot_sequence

        ORDER BY m."sequence" DESC
        LIMIT 1
      ) AS latest ON TRUE
    ),

    inbox_page AS (
      SELECT *
      FROM ranked

      WHERE (
        ${beforeSequence}::bigint IS NULL

        OR sort_sequence < ${beforeSequence}::bigint

        OR (
          sort_sequence = ${beforeSequence}::bigint
          AND conversation_id < ${beforeConversationId}::text
        )
      )

      ORDER BY
        sort_sequence DESC,
        conversation_id DESC

      LIMIT ${INBOX_PAGE_SIZE + 1}
    )

    SELECT
      p.*,
      s.snapshot_sequence,

      (
        SELECT count(*)::bigint
        FROM "messages" AS m

        WHERE m."conversation_id" = p.conversation_id
          AND m."sender_user_id" <> ${actorUserId}
          AND m."sequence" > COALESCE(
            p.last_read_sequence,
            0::bigint
          )
          AND m."sequence" <= s.snapshot_sequence
      ) AS unread_count

    FROM inbox_page AS p
    CROSS JOIN snapshot AS s

    ORDER BY
      p.sort_sequence DESC,
      p.conversation_id DESC
  `;

  const hasMore = rows.length > INBOX_PAGE_SIZE;

  const visibleRows = rows.slice(
    0,
    INBOX_PAGE_SIZE,
  );

  const conversations = visibleRows.map((row) => {
    if (
      typeof row.conversation_id !== "string" ||
      typeof row.other_user_id !== "string" ||
      typeof row.other_name !== "string"
    ) {
      throw new Error("Unexpected inbox member data.");
    }

    const sortSequence = safeSequence(
      row.sort_sequence,
      true,
    );

    const unreadCount = safeSequence(
      row.unread_count,
      true,
    );

    const lastReadSequence =
      row.last_read_sequence === null
        ? null
        : safeSequence(row.last_read_sequence);

    let lastMessage = null;

    if (row.last_message_id !== null) {
      if (
        typeof row.last_message_id !== "string" ||
        typeof row.last_message_sender !== "string" ||
        typeof row.last_message_body !== "string"
      ) {
        throw new Error("Unexpected inbox message data.");
      }

      lastMessage = {
        id: row.last_message_id,
        sequence: safeSequence(
          row.last_message_sequence,
        ),
        senderUserId: row.last_message_sender,
        body: row.last_message_body,
        createdAt: safeDate(
          row.last_message_created_at,
        ),
      };
    }

    return {
      conversationId: row.conversation_id,
      otherMember: {
        id: row.other_user_id,
        displayName: row.other_name,
        hasAvatar: row.other_has_avatar === true,
        avatarVersion:
          row.other_avatar_updated_at == null
            ? undefined
            : safeDate(row.other_avatar_updated_at),
      },
      lastMessage,
      lastReadSequence,
      unreadCount,
      sortSequence,
    };
  });

  const oldest = conversations[
    conversations.length - 1
  ];

  const snapshot = rows.length > 0
    ? safeSequence(
        rows[0].snapshot_sequence,
        true,
      )
    : cursor?.snapshotSequence ?? 0;

  const nextCursor =
    hasMore && oldest
      ? encodeCursor({
          v: 1,
          actorUserId,
          snapshotSequence: snapshot,
          beforeSequence: oldest.sortSequence,
          beforeConversationId:
            oldest.conversationId,
        })
      : null;

  return {
    conversations: conversations.map((conversation) => ({
      conversationId: conversation.conversationId,
      otherMember: conversation.otherMember,
      lastMessage: conversation.lastMessage,
      lastReadSequence: conversation.lastReadSequence,
      unreadCount: conversation.unreadCount,
    })),
    nextCursor,
    hasMore,
  };
}
