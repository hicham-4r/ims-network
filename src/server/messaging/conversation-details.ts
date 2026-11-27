import "server-only";

import { neon } from "@neondatabase/serverless";
import { z } from "zod";

import { requireActiveMember } from "@/server/account-state";
import { serverEnv } from "@/server/env";

const sql = neon(serverEnv.DATABASE_URL_POOLED);

const conversationIdSchema = z.string().uuid();

export async function getSelectedConversationSummary(
  conversationId: string,
) {
  const { session } = await requireActiveMember();
  const actorUserId = session.user.id;

  if (!conversationIdSchema.safeParse(conversationId).success) {
    return null;
  }

  // Every query checks membership and current
  // ACTIVE status for both participants.
  const rows = await sql`
    SELECT
      c."id" AS conversation_id,
      other_member."user_id" AS other_user_id,
      COALESCE(other_profile."display_name", other_user."name") AS other_name,
      (other_profile."avatar_url" IS NOT NULL) AS other_has_avatar,
      other_profile."updated_at" AS other_avatar_updated_at,

      (
        SELECT count(*)::bigint
        FROM "messages" AS m
        WHERE m."conversation_id" = c."id"
          AND m."sender_user_id" <> ${actorUserId}
          AND m."sequence" > COALESCE(
            actor_member."last_read_message_sequence",
            0::bigint
          )
      ) AS unread_count

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
  `;

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  const unreadCount = Number(row.unread_count);

  if (
    typeof row.conversation_id !== "string" ||
    typeof row.other_user_id !== "string" ||
    typeof row.other_name !== "string" ||
    !Number.isSafeInteger(unreadCount) ||
    unreadCount < 0
  ) {
    throw new Error("Unexpected conversation metadata.");
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
          : new Date(
              String(row.other_avatar_updated_at),
            ).toISOString(),
    },
    unreadCount,
  };
}
