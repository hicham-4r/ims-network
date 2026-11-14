import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

// The application will always store the two user IDs
// in canonical order before creating a conversation.
//
// The database independently enforces both uniqueness
// and ordering, preventing reversed duplicate pairs.
export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),

    lowUserId: text("low_user_id")
      .notNull()
      .references(() => user.id, {
        onDelete: "restrict",
      }),

    highUserId: text("high_user_id")
      .notNull()
      .references(() => user.id, {
        onDelete: "restrict",
      }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("conversations_direct_pair_unique").on(
      table.lowUserId,
      table.highUserId,
    ),

    check(
      "conversations_ordered_pair_chk",
      sql`
        ${table.lowUserId} COLLATE "C" <
        ${table.highUserId} COLLATE "C"
      `,
    ),

    index("conversations_high_user_idx").on(
      table.highUserId,
    ),
  ],
);

// Each direct conversation has two authorized participants.
//
// This table enforces unique membership records.
// Exactly two matching participants will be enforced
// by the conversation-creation service.
export const conversationMembers = pgTable(
  "conversation_members",
  {
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, {
        onDelete: "cascade",
      }),

    userId: text("user_id")
      .notNull()
      .references(() => user.id, {
        onDelete: "restrict",
      }),

    joinedAt: timestamp("joined_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),

    // Database-assigned ordering position of the
    // last message this participant has read.
    lastReadMessageSequence: bigint(
      "last_read_message_sequence",
      { mode: "number" },
    ),
  },
  (table) => [
    primaryKey({
      name: "conversation_members_pk",
      columns: [
        table.conversationId,
        table.userId,
      ],
    }),

    index("conversation_members_user_conversation_idx").on(
      table.userId,
      table.conversationId,
    ),


  ],
);

// Durable direct messages.
//
// The database requires a real conversation and a sender
// who belongs to that conversation.
//
// Application services must additionally verify ACTIVE
// account status before every message operation.
export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),

    // Stable across retries of the same logical send.
    // Nullable for historical/imported messages.
    clientMessageId: uuid("client_message_id"),

    sequence: bigserial("sequence", {
      mode: "number",
    })
      .notNull()
      .unique(),

    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, {
        onDelete: "restrict",
      }),

    senderUserId: text("sender_user_id")
      .notNull()
      .references(() => user.id, {
        onDelete: "restrict",
      }),

    body: text("body").notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: "messages_sender_membership_fk",
      columns: [
        table.conversationId,
        table.senderUserId,
      ],
      foreignColumns: [
        conversationMembers.conversationId,
        conversationMembers.userId,
      ],
    }).onDelete("restrict"),

    check(
      "messages_body_length_chk",
      sql`
        char_length(${table.body}) BETWEEN 1 AND 2000
      `,
    ),

    check(
      "messages_body_not_blank_chk",
      sql`
        char_length(btrim(${table.body})) > 0
      `,
    ),

    // Database-assigned sequence is the authoritative
    // cursor for newest-first message pagination.
    index("messages_conversation_sequence_idx").on(
      table.conversationId,
      table.sequence.desc(),
    ),

    index("messages_sender_idx").on(
      table.senderUserId,
    ),

    // One logical message per sender, conversation,
    // and client-generated UUID.
    uniqueIndex("messages_sender_client_id_unique")
      .on(
        table.conversationId,
        table.senderUserId,
        table.clientMessageId,
      )
      .where(sql`${table.clientMessageId} IS NOT NULL`),
  ],
);
