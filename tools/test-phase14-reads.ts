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
    direct.pathname !== pooled.pathname ||
    direct.pathname !== "/neondb"
  ) {
    throw new Error("Unexpected Development Neon target.");
  }

  const {
    MessageReadError,
    markConversationReadForActor,
    getUnreadCountForActor,
  } = await import(
    "../src/server/messaging/read-store"
  );

  const sql = neon(pooledUrl);

  const a = randomUUID();
  const b = randomUUID();
  const outsider = randomUUID();

  const conversationId = randomUUID();
  const otherConversationId = randomUUID();
  const otherMessageId = randomUUID();


  const email = (id: string) =>
    `ims-phase14-read-${id}@example.invalid`;

  function assert(
    condition: unknown,
    message: string,
  ): asserts condition {
    if (!condition) {
      throw new Error(message);
    }
  }

  async function expectDenied(
    operation: () => Promise<unknown>,
    expectedCode: "INVALID_INPUT" | "CONVERSATION_UNAVAILABLE",
    label: string,
  ) {
    try {
      await operation();
    } catch (error) {
      if (
        error instanceof MessageReadError &&
        error.code === expectedCode
      ) {
        console.log(`${label}: PASS`);
        return;
      }

      throw new Error(`${label}: unexpected error`);
    }

    throw new Error(`${label}: request was accepted`);
  }

  type TestMessage = {
    id: string;
    sequence: number;
    senderUserId: string;
  };

  let stage = "initialization";
  let testFailure = false;
  let cleanupFailure = false;

  console.log("PHASE 14 — READ TRACKING INTEGRATION TEST");
  console.log("Synthetic Development Neon records only.");

  try {
    stage = "fixture creation";

    const setup = await sql.transaction([
      sql`
        INSERT INTO "user" (
          "id", "name", "email", "email_verified"
        )
        VALUES
          (${a}, 'Read Test A', ${email(a)}, true),
          (${b}, 'Read Test B', ${email(b)}, true),
          (
            ${outsider},
            'Read Test Outsider',
            ${email(outsider)},
            true
          )
        RETURNING "id"
      `,

      sql`
        INSERT INTO "application_user_state" (
          "user_id", "status"
        )
        VALUES
          (${a}, 'ACTIVE'),
          (${b}, 'ACTIVE'),
          (${outsider}, 'ACTIVE')
        RETURNING "user_id"
      `,

      sql`
        INSERT INTO "conversations" (
          "id", "low_user_id", "high_user_id"
        )
        VALUES (
          ${conversationId},
          LEAST(
            ${a}::text COLLATE "C",
            ${b}::text COLLATE "C"
          ),
          GREATEST(
            ${a}::text COLLATE "C",
            ${b}::text COLLATE "C"
          )
        )
        RETURNING "id"
      `,

      sql`
        INSERT INTO "conversation_members" (
          "conversation_id", "user_id"
        )
        VALUES
          (${conversationId}, ${a}),
          (${conversationId}, ${b})
        RETURNING "user_id"
      `,

      sql`
        INSERT INTO "conversations" (
          "id", "low_user_id", "high_user_id"
        )
        VALUES (
          ${otherConversationId},
          LEAST(
            ${a}::text COLLATE "C",
            ${outsider}::text COLLATE "C"
          ),
          GREATEST(
            ${a}::text COLLATE "C",
            ${outsider}::text COLLATE "C"
          )
        )
        RETURNING "id"
      `,

      sql`
        INSERT INTO "conversation_members" (
          "conversation_id", "user_id"
        )
        VALUES
          (${otherConversationId}, ${a}),
          (${otherConversationId}, ${outsider})
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
          ${conversationId} || '-' || gs.n::text,
          ${conversationId},
          CASE
            WHEN gs.n % 2 = 1 THEN ${b}
            ELSE ${a}
          END,
          'Read test message ' || gs.n::text
        FROM generate_series(1, 6) AS gs(n)
        ORDER BY gs.n
        RETURNING "id"
      `,

      sql`
        INSERT INTO "messages" (
          "id",
          "conversation_id",
          "sender_user_id",
          "body"
        )
        VALUES (
          ${otherMessageId},
          ${otherConversationId},
          ${outsider},
          'Message belonging to another conversation'
        )
        RETURNING "id"
      `,
    ]);

    const setupCounts = [3, 3, 1, 2, 1, 2, 6, 1];

    setupCounts.forEach((count, index) => {
      assert(
        setup[index].length === count,
        "Synthetic fixture creation failed.",
      );
    });

    console.log("Synthetic fixture creation: PASS");

    stage = "message ordering";

    const rows = await sql`
      SELECT
        "id",
        "sequence",
        "sender_user_id",
        "body"
      FROM "messages"
      WHERE "conversation_id" = ${conversationId}
      ORDER BY "sequence" ASC
    `;

    assert(rows.length === 6, "Expected six messages.");

    const ordered: TestMessage[] = rows.map((row) => ({
      id: String(row.id),
      sequence: Number(row.sequence),
      senderUserId: String(row.sender_user_id),
    }));

    function messageAt(index: number): TestMessage {
      const message = ordered[index];

      if (!message) {
        throw new Error("Expected message missing.");
      }

      return message;
    }

    for (let i = 0; i < ordered.length; i++) {
      const expectedSender = i % 2 === 0 ? b : a;

      assert(
        ordered[i].senderUserId === expectedSender,
        "Unexpected message sender ordering.",
      );

      assert(
        Number.isSafeInteger(ordered[i].sequence) &&
          ordered[i].sequence > 0,
        "Invalid message sequence.",
      );

      if (i > 0) {
        assert(
          ordered[i].sequence > ordered[i - 1].sequence,
          "Message sequences are not increasing.",
        );
      }
    }

    console.log("Message ordering: PASS");

    stage = "initial unread counts";

    const initialA = await getUnreadCountForActor(a, {
      conversationId,
    });

    const initialB = await getUnreadCountForActor(b, {
      conversationId,
    });

    assert(
      initialA.unreadCount === 3 &&
        initialA.lastReadSequence === null,
      "Initial unread count for A is incorrect.",
    );

    assert(
      initialB.unreadCount === 3 &&
        initialB.lastReadSequence === null,
      "Initial unread count for B is incorrect.",
    );

    console.log("Independent initial unread counts: PASS");

    stage = "marking messages as read";

    const third = messageAt(2);

    const marked = await markConversationReadForActor(a, {
      conversationId,
      messageId: third.id,
    });

    assert(
      marked.lastReadSequence === third.sequence,
      "Read cursor was not saved correctly.",
    );

    const updatedA = await getUnreadCountForActor(a, {
      conversationId,
    });

    assert(
      updatedA.unreadCount === 1 &&
        updatedA.lastReadSequence === third.sequence,
      "Unread count after reading is incorrect.",
    );

    console.log("Read cursor update: PASS");
    console.log("Incoming unread count updated: PASS");

    stage = "cursor monotonicity";

    const backward = await markConversationReadForActor(a, {
      conversationId,
      messageId: messageAt(0).id,
    });

    assert(
      backward.lastReadSequence === third.sequence,
      "Read cursor moved backward.",
    );

    console.log("Backward cursor movement prevented: PASS");

    const unaffectedB = await getUnreadCountForActor(b, {
      conversationId,
    });

    assert(
      unaffectedB.unreadCount === 3 &&
        unaffectedB.lastReadSequence === null,
      "Another member's read cursor changed.",
    );

    console.log("Other member's read cursor independent: PASS");

    stage = "unauthorized read access";

    await expectDenied(
      () =>
        markConversationReadForActor(outsider, {
          conversationId,
          messageId: third.id,
        }),
      "CONVERSATION_UNAVAILABLE",
      "Outsider cannot mark messages read",
    );

    await expectDenied(
      () =>
        getUnreadCountForActor(outsider, {
          conversationId,
        }),
      "CONVERSATION_UNAVAILABLE",
      "Outsider cannot read unread counts",
    );

    await expectDenied(
      () =>
        markConversationReadForActor(a, {
          conversationId,
          messageId: randomUUID(),
        }),
      "CONVERSATION_UNAVAILABLE",
      "Nonexistent message rejected",
    );

    await expectDenied(
      () =>
        markConversationReadForActor(a, {
          conversationId,
          messageId: otherMessageId,
        }),
      "CONVERSATION_UNAVAILABLE",
      "Cross-conversation message rejected",
    );

    await expectDenied(
      () =>
        markConversationReadForActor(a, {
          conversationId,
          messageId: "",
        }),
      "INVALID_INPUT",
      "Invalid message ID rejected",
    );

    await expectDenied(
      () =>
        getUnreadCountForActor(a, {
          conversationId,
          unexpected: true,
        }),
      "INVALID_INPUT",
      "Unexpected request fields rejected",
    );

    stage = "concurrent read updates";

    const readTargets = [
      5, 1, 4, 0, 3, 2, 5, 1, 4, 0, 3, 2,
    ];

    const concurrent = await Promise.allSettled(
      readTargets.map((index) =>
        markConversationReadForActor(a, {
          conversationId,
          messageId: messageAt(index).id,
        }),
      ),
    );

    assert(
      concurrent.every(
        (result) => result.status === "fulfilled",
      ),
      "A concurrent read update failed.",
    );

    const highest = messageAt(5).sequence;

    const finalA = await getUnreadCountForActor(a, {
      conversationId,
    });

    assert(
      finalA.lastReadSequence === highest &&
        finalA.unreadCount === 0,
      "Concurrent reads did not preserve the highest cursor.",
    );

    console.log("12 concurrent read updates: PASS");
    console.log("Highest cursor position preserved: PASS");
    console.log("Zero unread messages after final read: PASS");

    stage = "participant suspension";

    await sql`
      UPDATE "application_user_state"
      SET "status" = 'SUSPENDED'
      WHERE "user_id" = ${b}
    `;

    await expectDenied(
      () =>
        getUnreadCountForActor(a, {
          conversationId,
        }),
      "CONVERSATION_UNAVAILABLE",
      "Suspended participant blocks unread access",
    );

    await expectDenied(
      () =>
        markConversationReadForActor(b, {
          conversationId,
          messageId: messageAt(5).id,
        }),
      "CONVERSATION_UNAVAILABLE",
      "Suspended requester cannot update cursor",
    );

    await sql`
      UPDATE "application_user_state"
      SET "status" = 'ACTIVE'
      WHERE "user_id" = ${b}
    `;

    const restored = await getUnreadCountForActor(a, {
      conversationId,
    });

    assert(
      restored.unreadCount === 0 &&
        restored.lastReadSequence === highest,
      "Read state changed after account restoration.",
    );

    console.log("Restoration preserves read state: PASS");

    stage = "independent recipient cursor";

    const fourth = messageAt(3);

    const markedB = await markConversationReadForActor(b, {
      conversationId,
      messageId: fourth.id,
    });

    const laterB = await getUnreadCountForActor(b, {
      conversationId,
    });

    assert(
      markedB.lastReadSequence === fourth.sequence &&
        laterB.unreadCount === 1,
      "Recipient read state is incorrect.",
    );

    const unchangedA = await getUnreadCountForActor(a, {
      conversationId,
    });

    assert(
      unchangedA.unreadCount === 0 &&
        unchangedA.lastReadSequence === highest,
      "Reading as B changed A's cursor.",
    );

    console.log("Independent recipient read tracking: PASS");

    stage = "database cursor verification";

    const stored = await sql`
      SELECT "user_id", "last_read_message_sequence"
      FROM "conversation_members"
      WHERE "conversation_id" = ${conversationId}
    `;

    assert(stored.length === 2, "Membership records missing.");

    const storedA = stored.find(
      (row) => row.user_id === a,
    );

    const storedB = stored.find(
      (row) => row.user_id === b,
    );

    assert(
      Number(storedA?.last_read_message_sequence) === highest,
      "A's persisted cursor is incorrect.",
    );

    assert(
      Number(storedB?.last_read_message_sequence) === fourth.sequence,
      "B's persisted cursor is incorrect.",
    );

    console.log("Durable PostgreSQL read cursors: PASS");
  } catch {
    testFailure = true;
    console.error(`Test failed during: ${stage}`);
  } finally {
    try {
      await sql.transaction([
        sql`
          DELETE FROM "messages"
          WHERE "conversation_id" IN (
            ${conversationId},
            ${otherConversationId}
          )
        `,

        sql`
          DELETE FROM "conversation_members"
          WHERE "conversation_id" IN (
            ${conversationId},
            ${otherConversationId}
          )
        `,

        sql`
          DELETE FROM "conversations"
          WHERE "id" IN (
            ${conversationId},
            ${otherConversationId}
          )
        `,

        sql`
          DELETE FROM "application_user_state"
          WHERE "user_id" IN (${a}, ${b}, ${outsider})
        `,

        sql`
          DELETE FROM "user"
          WHERE "id" IN (${a}, ${b}, ${outsider})
        `,
      ]);

      const remaining = await sql`
        SELECT
          (
            SELECT count(*)
            FROM "user"
            WHERE "id" IN (${a}, ${b}, ${outsider})
          ) +
          (
            SELECT count(*)
            FROM "conversations"
            WHERE "id" IN (
              ${conversationId},
              ${otherConversationId}
            )
          ) +
          (
            SELECT count(*)
            FROM "conversation_members"
            WHERE "conversation_id" IN (
              ${conversationId},
              ${otherConversationId}
            )
          ) +
          (
            SELECT count(*)
            FROM "messages"
            WHERE "conversation_id" IN (
              ${conversationId},
              ${otherConversationId}
            )
          ) AS count
      `;

      assert(
        Number(remaining[0]?.count) === 0,
        "Synthetic fixtures remain.",
      );

      console.log("Synthetic fixture cleanup: PASS");
    } catch {
      cleanupFailure = true;

      console.error(
        "Cleanup failed. Inspect Development Neon before rerunning.",
      );
    }
  }

  if (cleanupFailure) {
    throw new Error("Synthetic fixture cleanup failed.");
  }

  if (testFailure) {
    throw new Error("Read-tracking integration test failed.");
  }

  console.log("PHASE 14 READ TRACKING INTEGRATION: PASS");
}

main().catch(() => {
  console.error("Phase 14 read-tracking verification failed.");
  process.exitCode = 1;
});
