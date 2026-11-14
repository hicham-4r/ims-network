import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

async function main() {
  if (
    process.env.IMS_PHASE14_DEV_TEST !== "I_VERIFIED_DEV_NEON" ||
    process.env.NODE_ENV !== "development" ||
    process.env.VERCEL_ENV ||
    process.env.CI
  ) {
    throw new Error("Development test guard failed.");
  }

  const directUrl = process.env.DATABASE_URL;
  const pooledUrl = process.env.DATABASE_URL_POOLED;

  if (!directUrl || !pooledUrl) {
    throw new Error("Database configuration missing.");
  }

  const direct = new URL(directUrl);
  const pooled = new URL(pooledUrl);

  const expectedHost =
    "ep-fancy-star-ba6hkpdq.c-8.eu-central-1.aws.neon.tech";

  const normalizeHost = (url: URL) =>
    url.hostname.replace(/-pooler(?=\.)/, "");

  if (
    normalizeHost(direct) !== expectedHost ||
    normalizeHost(pooled) !== expectedHost ||
    direct.pathname !== "/neondb" ||
    pooled.pathname !== "/neondb"
  ) {
    throw new Error("Unexpected Development Neon target.");
  }

  const {
    getConversationInboxForActor,
    InboxError,
    INBOX_PAGE_SIZE,
  } = await import("../src/server/messaging/inbox-store");

  const {
    markConversationReadForActor,
  } = await import("../src/server/messaging/read-store");

  const sql = neon(pooledUrl);

  function assert(
    condition: unknown,
    message: string,
  ): asserts condition {
    if (!condition) {
      throw new Error(message);
    }
  }

  assert(INBOX_PAGE_SIZE === 20, "Unexpected inbox page size.");

  const actor = randomUUID();
  const outsider = randomUUID();

  const contacts = Array.from({ length: 23 }, (_, index) => ({
    id: randomUUID(),
    name: `Inbox Contact ${index + 1}`,
  }));

  const people = [
    { id: actor, name: "Inbox Test Actor" },
    ...contacts,
    { id: outsider, name: "Inbox Test Outsider" },
  ];

  const conversations = contacts.map((contact, index) => ({
    id: randomUUID(),
    other_user_id: contact.id,
    index,
    name: contact.name,
  }));

  // Conversations 0–21 have two messages each.
  // Conversation 22 is intentionally empty.
  const messages = conversations.slice(0, 22).flatMap(
    (conversation, index) => [
      {
        id: randomUUID(),
        conversation_id: conversation.id,
        sender_user_id: conversation.other_user_id,
        body: `Inbox ${index} first`,
        ordinal: index * 2 + 1,
      },
      {
        id: randomUUID(),
        conversation_id: conversation.id,
        sender_user_id:
          index % 2 === 0
            ? actor
            : conversation.other_user_id,
        body: `Inbox ${index} latest`,
        ordinal: index * 2 + 2,
      },
    ],
  );

  const userIds = people.map((person) => person.id);
  const conversationIds = conversations.map(
    (conversation) => conversation.id,
  );

  const usersJson = JSON.stringify(
    people.map((person) => ({
      ...person,
      email: `ims-phase14-inbox-${person.id}@example.invalid`,
    })),
  );

  const conversationsJson = JSON.stringify(conversations);
  const messagesJson = JSON.stringify(messages);

  const userIdsJson = JSON.stringify(userIds);
  const conversationIdsJson = JSON.stringify(conversationIds);

  type InboxPage = Awaited<
    ReturnType<typeof getConversationInboxForActor>
  >;

  type InboxEntry = InboxPage["conversations"][number];

  async function expectInvalid(
    operation: () => Promise<unknown>,
    label: string,
  ) {
    try {
      await operation();
    } catch (error) {
      if (
        error instanceof InboxError &&
        error.code === "INVALID_QUERY"
      ) {
        console.log(`${label}: PASS`);
        return;
      }

      throw new Error(`${label}: unexpected error.`);
    }

    throw new Error(`${label}: request was accepted.`);
  }

  function verifyEntry(
    entry: InboxEntry,
    index: number,
  ) {
    const fixture = conversations[index];
    const latest = messages[index * 2 + 1];

    assert(fixture !== undefined, "Missing conversation fixture.");

    assert(
      entry.conversationId === fixture.id,
      "Incorrect conversation ID.",
    );

    assert(
      entry.otherMember.id === fixture.other_user_id &&
        entry.otherMember.displayName === fixture.name,
      "Incorrect other member.",
    );

    if (index === 22) {
      assert(entry.lastMessage === null, "Empty conversation has a message.");
      assert(entry.unreadCount === 0, "Empty conversation has unread items.");
      assert(entry.lastReadSequence === null, "Empty conversation has a cursor.");
      return;
    }

    assert(latest !== undefined, "Missing latest-message fixture.");

    assert(
      entry.lastMessage?.id === latest.id &&
        entry.lastMessage.body === latest.body &&
        entry.lastMessage.senderUserId === latest.sender_user_id,
      "Incorrect latest-message data.",
    );

    assert(
      Number.isSafeInteger(entry.lastMessage.sequence) &&
        Number.isFinite(Date.parse(entry.lastMessage.createdAt)),
      "Incorrect latest-message metadata.",
    );

    let expectedUnread = index % 2 === 0 ? 1 : 2;

    // These two conversations were partially/fully read.
    if (index === 21) expectedUnread = 1;
    if (index === 20) expectedUnread = 0;

    assert(
      entry.unreadCount === expectedUnread,
      `Incorrect unread count for fixture ${index}.`,
    );

    if (index === 20 || index === 21) {
      assert(
        entry.lastReadSequence !== null &&
          entry.lastReadSequence > 0,
        "Stored read position missing.",
      );
    } else {
      assert(
        entry.lastReadSequence === null,
        "Unexpected stored read position.",
      );
    }
  }

  async function loadAllForActor(): Promise<InboxEntry[]> {
    const collected: InboxEntry[] = [];
    let cursor: string | undefined;

    for (let pageNumber = 0; pageNumber < 4; pageNumber++) {
      const page = await getConversationInboxForActor(
        actor,
        cursor ? { cursor } : {},
      );

      collected.push(...page.conversations);

      if (!page.hasMore) {
        assert(
          page.nextCursor === null,
          "Last page unexpectedly has a cursor.",
        );
        return collected;
      }

      assert(
        typeof page.nextCursor === "string",
        "Missing pagination cursor.",
      );

      cursor = page.nextCursor;
    }

    throw new Error("Inbox pagination did not terminate.");
  }

  let stage = "initialization";
  let testFailed = false;
  let cleanupFailed = false;

  console.log("PHASE 14 — INBOX INTEGRATION TEST");
  console.log("Development Neon synthetic fixtures only.");

  try {
    stage = "fixture creation";

    const setup = await sql.transaction([
      sql`
        INSERT INTO "user" (
          "id", "name", "email", "email_verified"
        )
        SELECT u.id, u.name, u.email, true
        FROM jsonb_to_recordset(${usersJson}::jsonb)
          AS u(id text, name text, email text)
        RETURNING "id"
      `,

      sql`
        INSERT INTO "application_user_state" (
          "user_id", "status"
        )
        SELECT u.id, 'ACTIVE'
        FROM jsonb_to_recordset(${usersJson}::jsonb)
          AS u(id text)
        RETURNING "user_id"
      `,

      sql`
        INSERT INTO "conversations" (
          "id", "low_user_id", "high_user_id"
        )
        SELECT
          c.id,
          LEAST(
            ${actor}::text COLLATE "C",
            c.other_user_id COLLATE "C"
          ),
          GREATEST(
            ${actor}::text COLLATE "C",
            c.other_user_id COLLATE "C"
          )
        FROM jsonb_to_recordset(${conversationsJson}::jsonb)
          AS c(id text, other_user_id text)
        RETURNING "id"
      `,

      sql`
        INSERT INTO "conversation_members" (
          "conversation_id", "user_id"
        )
        SELECT c.id, ${actor}
        FROM jsonb_to_recordset(${conversationsJson}::jsonb)
          AS c(id text)

        UNION ALL

        SELECT c.id, c.other_user_id
        FROM jsonb_to_recordset(${conversationsJson}::jsonb)
          AS c(id text, other_user_id text)

        RETURNING "user_id"
      `,

      sql`
        INSERT INTO "messages" (
          "id",
          "conversation_id",
          "sender_user_id",
          "body"
        )
        SELECT
          m.id,
          m.conversation_id,
          m.sender_user_id,
          m.body
        FROM jsonb_to_recordset(${messagesJson}::jsonb)
          AS m(
            id text,
            conversation_id text,
            sender_user_id text,
            body text,
            ordinal integer
          )
        ORDER BY m.ordinal
        RETURNING "id"
      `,
    ]);

    const expectedCounts = [25, 25, 23, 46, 44];

    expectedCounts.forEach((expected, index) => {
      assert(
        setup[index]?.length === expected,
        `Fixture setup count ${index} incorrect.`,
      );
    });

    console.log("23 conversations and 44 messages created: PASS");

    stage = "read positions";

    const read21 = messages[42];
    const read20 = messages[41];

    assert(
      read21 !== undefined && read20 !== undefined,
      "Missing read-position fixtures.",
    );

    await markConversationReadForActor(actor, {
      conversationId: conversations[21].id,
      messageId: read21.id,
    });

    await markConversationReadForActor(actor, {
      conversationId: conversations[20].id,
      messageId: read20.id,
    });

    console.log("Independent unread states prepared: PASS");

    stage = "first inbox page";

    const first = await getConversationInboxForActor(actor, {});

    assert(
      first.conversations.length === 20 &&
        first.hasMore &&
        typeof first.nextCursor === "string",
      "First inbox page incorrect.",
    );

    for (let position = 0; position < 20; position++) {
      verifyEntry(first.conversations[position], 21 - position);
    }

    console.log("First page of 20 conversations: PASS");
    console.log("Latest messages and member names: PASS");
    console.log("Unread counts and read positions: PASS");

    stage = "new message during pagination";

    const freshMessageId = randomUUID();

    const inserted = await sql`
      INSERT INTO "messages" (
        "id",
        "conversation_id",
        "sender_user_id",
        "body"
      )
      VALUES (
        ${freshMessageId},
        ${conversations[0].id},
        ${contacts[0].id},
        'New inbox activity after snapshot'
      )
      RETURNING "id"
    `;

    assert(inserted.length === 1, "New message was not inserted.");

    const second = await getConversationInboxForActor(actor, {
      cursor: first.nextCursor,
    });

    assert(
      second.conversations.length === 3 &&
        !second.hasMore &&
        second.nextCursor === null,
      "Second inbox page incorrect.",
    );

    verifyEntry(second.conversations[0], 1);
    verifyEntry(second.conversations[1], 0);
    verifyEntry(second.conversations[2], 22);

    console.log("Second page of 3 conversations: PASS");
    console.log("New activity does not shift older pages: PASS");
    console.log("Empty conversation: PASS");

    const combined = [
      ...first.conversations,
      ...second.conversations,
    ];

    assert(
      combined.length === 23 &&
        new Set(combined.map((entry) => entry.conversationId)).size === 23,
      "Conversation duplication or omission across pages.",
    );

    console.log("No duplicate or missing conversations: PASS");

    stage = "inbox refresh";

    const refreshed = await getConversationInboxForActor(actor, {});

    assert(
      refreshed.conversations[0]?.conversationId ===
        conversations[0].id,
      "New activity did not move the conversation to the top.",
    );

    assert(
      refreshed.conversations[0]?.lastMessage?.id === freshMessageId,
      "Inbox refresh did not return the latest message.",
    );

    assert(
      refreshed.conversations[0]?.unreadCount === 2,
      "New incoming message was not counted.",
    );

    console.log("Inbox refresh includes new activity: PASS");

    stage = "cursor security";

    const cursor = first.nextCursor;
    const parts = cursor.split(".");

    assert(
      parts.length === 2 &&
        parts[0].length > 0 &&
        parts[1].length > 0,
      "Signed cursor missing.",
    );

    const changedSignature =
      (parts[1][0] === "A" ? "B" : "A") +
      parts[1].slice(1);

    await expectInvalid(
      () => getConversationInboxForActor(actor, {
        cursor: `${parts[0]}.${changedSignature}`,
      }),
      "Tampered inbox cursor rejected",
    );

    await expectInvalid(
      () => getConversationInboxForActor(
        contacts[0].id,
        { cursor },
      ),
      "Another member cannot reuse inbox cursor",
    );

    await expectInvalid(
      () => getConversationInboxForActor(actor, {
        cursor: "invalid-cursor",
      }),
      "Malformed inbox cursor rejected",
    );

    await expectInvalid(
      () => getConversationInboxForActor(actor, {
        unexpected: true,
      }),
      "Unexpected input fields rejected",
    );

    stage = "privacy and suspension";

    const outside = await getConversationInboxForActor(
      outsider,
      {},
    );

    assert(
      outside.conversations.length === 0 &&
        !outside.hasMore,
      "Outsider received private conversations.",
    );

    console.log("Nonparticipant sees no private inbox: PASS");

    const otherMemberInbox = await getConversationInboxForActor(
      contacts[0].id,
      {},
    );

    assert(
      otherMemberInbox.conversations.length === 1 &&
        otherMemberInbox.conversations[0].conversationId ===
          conversations[0].id,
      "Other participant received unrelated conversations.",
    );

    console.log("Participant sees only own conversations: PASS");

    await sql`
      UPDATE "application_user_state"
      SET "status" = 'SUSPENDED'
      WHERE "user_id" = ${contacts[5].id}
    `;

    const hidden = await loadAllForActor();

    assert(
      hidden.length === 22 &&
        !hidden.some(
          (entry) =>
            entry.conversationId === conversations[5].id,
        ),
      "Suspended participant was not hidden.",
    );

    console.log("Suspended participant hidden from inbox: PASS");

    await sql`
      UPDATE "application_user_state"
      SET "status" = 'ACTIVE'
      WHERE "user_id" = ${contacts[5].id}
    `;

    const restored = await loadAllForActor();

    assert(
      restored.length === 23 &&
        restored.some(
          (entry) =>
            entry.conversationId === conversations[5].id,
        ),
      "Restored participant did not reappear.",
    );

    console.log("Restored participant reappears: PASS");

    await sql`
      UPDATE "application_user_state"
      SET "status" = 'SUSPENDED'
      WHERE "user_id" = ${actor}
    `;

    const blocked = await getConversationInboxForActor(actor, {});

    assert(
      blocked.conversations.length === 0 &&
        blocked.nextCursor === null &&
        !blocked.hasMore,
      "Suspended actor received private inbox data.",
    );

    console.log("Suspended actor receives no inbox data: PASS");

    await sql`
      UPDATE "application_user_state"
      SET "status" = 'ACTIVE'
      WHERE "user_id" = ${actor}
    `;
  } catch {
    testFailed = true;
    console.error(`Integration test failed during: ${stage}`);
  } finally {
    try {
      await sql.transaction([
        sql`
          DELETE FROM "messages"
          WHERE "conversation_id" IN (
            SELECT value
            FROM jsonb_array_elements_text(
              ${conversationIdsJson}::jsonb
            )
          )
        `,

        sql`
          DELETE FROM "conversation_members"
          WHERE "conversation_id" IN (
            SELECT value
            FROM jsonb_array_elements_text(
              ${conversationIdsJson}::jsonb
            )
          )
        `,

        sql`
          DELETE FROM "conversations"
          WHERE "id" IN (
            SELECT value
            FROM jsonb_array_elements_text(
              ${conversationIdsJson}::jsonb
            )
          )
        `,

        sql`
          DELETE FROM "application_user_state"
          WHERE "user_id" IN (
            SELECT value
            FROM jsonb_array_elements_text(
              ${userIdsJson}::jsonb
            )
          )
        `,

        sql`
          DELETE FROM "user"
          WHERE "id" IN (
            SELECT value
            FROM jsonb_array_elements_text(
              ${userIdsJson}::jsonb
            )
          )
        `,
      ]);

      const remaining = await sql`
        WITH target_users AS (
          SELECT value AS id
          FROM jsonb_array_elements_text(
            ${userIdsJson}::jsonb
          )
        ),
        target_conversations AS (
          SELECT value AS id
          FROM jsonb_array_elements_text(
            ${conversationIdsJson}::jsonb
          )
        )

        SELECT
          (
            SELECT count(*)
            FROM "user" AS u
            JOIN target_users AS t ON t.id = u."id"
          ) +
          (
            SELECT count(*)
            FROM "application_user_state" AS s
            JOIN target_users AS t ON t.id = s."user_id"
          ) +
          (
            SELECT count(*)
            FROM "conversations" AS c
            JOIN target_conversations AS t ON t.id = c."id"
          ) +
          (
            SELECT count(*)
            FROM "conversation_members" AS cm
            JOIN target_conversations AS t
              ON t.id = cm."conversation_id"
          ) +
          (
            SELECT count(*)
            FROM "messages" AS m
            JOIN target_conversations AS t
              ON t.id = m."conversation_id"
          ) AS remaining
      `;

      assert(
        Number(remaining[0]?.remaining) === 0,
        "Synthetic fixtures remain.",
      );

      console.log("Synthetic fixture cleanup: PASS");
    } catch {
      cleanupFailed = true;
      console.error(
        "Cleanup failed. Inspect Development Neon before rerunning.",
      );
    }
  }

  if (testFailed || cleanupFailed) {
    throw new Error("Inbox integration verification failed.");
  }

  console.log("PHASE 14 INBOX INTEGRATION: PASS");
}

main().catch(() => {
  console.error("Phase 14 inbox test did not pass.");
  process.exitCode = 1;
});
