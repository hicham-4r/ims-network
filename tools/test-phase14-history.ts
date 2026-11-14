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
    throw new Error("Development environment guard failed.");
  }

  const directUrl = process.env.DATABASE_URL;
  const pooledUrl = process.env.DATABASE_URL_POOLED;

  if (!directUrl || !pooledUrl) {
    throw new Error("Database configuration missing.");
  }

  const direct = new URL(directUrl);
  const pooled = new URL(pooledUrl);

  const normalizeHost = (url: URL) =>
    url.hostname.replace(/-pooler(?=\.)/, "");

  if (
    !direct.hostname.endsWith(".neon.tech") ||
    !pooled.hostname.endsWith(".neon.tech") ||
    normalizeHost(direct) !== normalizeHost(pooled) ||
    direct.pathname !== pooled.pathname
  ) {
    throw new Error("Unexpected database configuration.");
  }

  const {
    getConversationHistoryForActor,
    MessageHistoryError,
    MESSAGE_PAGE_SIZE,
  } = await import(
    "../src/server/messaging/history-store"
  );

  if (MESSAGE_PAGE_SIZE !== 30) {
    throw new Error("Unexpected message page size.");
  }

  const sql = neon(pooledUrl);

  const a = randomUUID();
  const b = randomUUID();
  const outsider = randomUUID();

  const mainConversation = randomUUID();
  const emptyConversation = randomUUID();

  const email = (id: string) =>
    `ims-history-test-${id}@example.invalid`;

  async function expectHistoryError(
    operation: () => Promise<unknown>,
    expectedCode: "INVALID_QUERY" | "CONVERSATION_UNAVAILABLE",
    label: string,
  ) {
    try {
      await operation();
    } catch (error) {
      if (
        error instanceof MessageHistoryError &&
        error.code === expectedCode
      ) {
        console.log(`${label}: PASS`);
        return;
      }

      throw new Error(`${label}: unexpected failure`);
    }

    throw new Error(`${label}: access unexpectedly granted`);
  }

  let testFailure: unknown = null;
  let cleanupFailure = false;

  console.log("PHASE 14 — HISTORY INTEGRATION TEST");
  console.log("Synthetic Development Neon fixtures only.");

  try {
    const setup = await sql.transaction([
      sql`
        INSERT INTO "user" (
          "id", "name", "email", "email_verified"
        )
        VALUES
          (${a}, 'History Test A', ${email(a)}, true),
          (${b}, 'History Test B', ${email(b)}, true),
          (
            ${outsider},
            'History Test C',
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
          ${mainConversation},
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
          (${mainConversation}, ${a}),
          (${mainConversation}, ${b})
        RETURNING "user_id"
      `,

      sql`
        INSERT INTO "conversations" (
          "id", "low_user_id", "high_user_id"
        )
        VALUES (
          ${emptyConversation},
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
          (${emptyConversation}, ${a}),
          (${emptyConversation}, ${outsider})
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
          ${mainConversation} || '-' || gs.n::text,
          ${mainConversation},
          CASE
            WHEN gs.n % 2 = 0 THEN ${a}
            ELSE ${b}
          END,
          'Synthetic history ' || gs.n::text
        FROM generate_series(1, 65) AS gs(n)
        ORDER BY gs.n ASC
        RETURNING "id"
      `,
    ]);

    const expectedSetupCounts = [3, 3, 1, 2, 1, 2, 65];

    for (let i = 0; i < expectedSetupCounts.length; i++) {
      if (setup[i].length !== expectedSetupCounts[i]) {
        throw new Error("Synthetic fixture setup failed.");
      }
    }

    console.log("65 synthetic messages created: PASS");

    const first = await getConversationHistoryForActor(
      a,
      { conversationId: mainConversation },
    );

    if (
      first.messages.length !== 30 ||
      !first.hasMore ||
      !first.nextCursor
    ) {
      throw new Error("First page incorrect.");
    }

    console.log("First page — 30 newest messages: PASS");

    const second = await getConversationHistoryForActor(
      a,
      {
        conversationId: mainConversation,
        cursor: first.nextCursor,
      },
    );

    if (
      second.messages.length !== 30 ||
      !second.hasMore ||
      !second.nextCursor
    ) {
      throw new Error("Second page incorrect.");
    }

    console.log("Second page — 30 older messages: PASS");

    const third = await getConversationHistoryForActor(
      a,
      {
        conversationId: mainConversation,
        cursor: second.nextCursor,
      },
    );

    if (
      third.messages.length !== 5 ||
      third.hasMore ||
      third.nextCursor !== null
    ) {
      throw new Error("Final page incorrect.");
    }

    console.log("Third page — final 5 messages: PASS");

    const allMessages = [
      ...first.messages,
      ...second.messages,
      ...third.messages,
    ];

    if (allMessages.length !== 65) {
      throw new Error("Incomplete paginated history.");
    }

    const ids = new Set(
      allMessages.map((message) => message.id),
    );

    const sequences = new Set(
      allMessages.map((message) => message.sequence),
    );

    if (ids.size !== 65 || sequences.size !== 65) {
      throw new Error("Duplicate messages across pages.");
    }

    for (let i = 0; i < allMessages.length; i++) {
      const message = allMessages[i];

      const expectedBody = `Synthetic history ${65 - i}`;

      if (
        message.body !== expectedBody ||
        !Number.isSafeInteger(message.sequence) ||
        !Number.isFinite(Date.parse(message.createdAt))
      ) {
        throw new Error("Incorrect message history ordering.");
      }

      if (
        i > 0 &&
        message.sequence >= allMessages[i - 1].sequence
      ) {
        throw new Error("Message sequences are not descending.");
      }
    }

    console.log("Newest-first ordering: PASS");
    console.log("No missing or duplicate messages: PASS");

    const empty = await getConversationHistoryForActor(
      a,
      { conversationId: emptyConversation },
    );

    if (
      empty.messages.length !== 0 ||
      empty.nextCursor !== null ||
      empty.hasMore
    ) {
      throw new Error("Empty conversation response incorrect.");
    }

    console.log("Empty conversation: PASS");

    await expectHistoryError(
      () =>
        getConversationHistoryForActor(
          outsider,
          { conversationId: mainConversation },
        ),
      "CONVERSATION_UNAVAILABLE",
      "Nonparticipant access rejected",
    );

    await expectHistoryError(
      () =>
        getConversationHistoryForActor(
          a,
          { conversationId: randomUUID() },
        ),
      "CONVERSATION_UNAVAILABLE",
      "Nonexistent conversation rejected",
    );

    await expectHistoryError(
      () =>
        getConversationHistoryForActor(
          a,
          {
            conversationId: mainConversation,
            cursor: "not-a-valid-cursor",
          },
        ),
      "INVALID_QUERY",
      "Malformed cursor rejected",
    );

    const originalCursor = first.nextCursor;

    const [payload, signature] = originalCursor.split(".");

    if (!payload || !signature) {
      throw new Error("Expected signed cursor missing.");
    }

    const tamperedSignature =
      (signature[0] === "A" ? "B" : "A") +
      signature.slice(1);

    await expectHistoryError(
      () =>
        getConversationHistoryForActor(
          a,
          {
            conversationId: mainConversation,
            cursor: `${payload}.${tamperedSignature}`,
          },
        ),
      "INVALID_QUERY",
      "Tampered cursor rejected",
    );

    await expectHistoryError(
      () =>
        getConversationHistoryForActor(
          a,
          {
            conversationId: emptyConversation,
            cursor: originalCursor,
          },
        ),
      "INVALID_QUERY",
      "Cross-conversation cursor rejected",
    );

    await expectHistoryError(
      () =>
        getConversationHistoryForActor(
          b,
          {
            conversationId: mainConversation,
            cursor: originalCursor,
          },
        ),
      "INVALID_QUERY",
      "Cross-member cursor rejected",
    );

    // A currently suspended participant must block
    // private history access for this conversation.
    await sql`
      UPDATE "application_user_state"
      SET "status" = 'SUSPENDED'
      WHERE "user_id" = ${b}
    `;

    await expectHistoryError(
      () =>
        getConversationHistoryForActor(
          a,
          { conversationId: mainConversation },
        ),
      "CONVERSATION_UNAVAILABLE",
      "Suspended participant blocks history",
    );

    await expectHistoryError(
      () =>
        getConversationHistoryForActor(
          b,
          { conversationId: mainConversation },
        ),
      "CONVERSATION_UNAVAILABLE",
      "Suspended requester rejected",
    );

    await sql`
      UPDATE "application_user_state"
      SET "status" = 'ACTIVE'
      WHERE "user_id" = ${b}
    `;

    const restored = await getConversationHistoryForActor(
      b,
      { conversationId: mainConversation },
    );

    if (restored.messages.length !== 30) {
      throw new Error("History unavailable after restoration.");
    }

    console.log("Restored member history: PASS");
  } catch (error) {
    testFailure = error;
  } finally {
    try {
      await sql.transaction([
        sql`
          DELETE FROM "messages"
          WHERE "conversation_id" IN (
            ${mainConversation},
            ${emptyConversation}
          )
        `,

        sql`
          DELETE FROM "conversation_members"
          WHERE "conversation_id" IN (
            ${mainConversation},
            ${emptyConversation}
          )
        `,

        sql`
          DELETE FROM "conversations"
          WHERE "id" IN (
            ${mainConversation},
            ${emptyConversation}
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
              ${mainConversation},
              ${emptyConversation}
            )
          ) +
          (
            SELECT count(*)
            FROM "messages"
            WHERE "conversation_id" IN (
              ${mainConversation},
              ${emptyConversation}
            )
          ) +
          (
            SELECT count(*)
            FROM "conversation_members"
            WHERE "conversation_id" IN (
              ${mainConversation},
              ${emptyConversation}
            )
          ) AS remaining
      `;

      if (Number(remaining[0]?.remaining) !== 0) {
        throw new Error("Synthetic fixtures remain.");
      }

      console.log("Synthetic fixture cleanup: PASS");
    } catch {
      cleanupFailure = true;

      console.error(
        "Fixture cleanup failed. Inspect Development Neon before rerunning.",
      );
    }
  }

  if (cleanupFailure) {
    throw new Error("Synthetic fixture cleanup failed.");
  }

  if (testFailure) {
    throw testFailure;
  }

  console.log("PHASE 14 HISTORY INTEGRATION: PASS");
}

main().catch((error: unknown) => {
  // Do not expose SQL text, credentials, or messages
  // in test failure logs.
  const message =
    error instanceof Error ? error.message : "Unknown failure";

  console.error(`History test failed: ${message}`);
  process.exitCode = 1;
});
