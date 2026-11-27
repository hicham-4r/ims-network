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

  const normalizedHost = (url: URL) =>
    url.hostname.replace(/-pooler(?=\.)/, "");

  if (
    !direct.hostname.endsWith(".neon.tech") ||
    !pooled.hostname.endsWith(".neon.tech") ||
    normalizedHost(direct) !== normalizedHost(pooled) ||
    direct.pathname !== pooled.pathname
  ) {
    throw new Error("Unexpected database configuration.");
  }

  const {
    MessageSendError,
    persistMessageForActor,
  } = await import("../src/server/messaging/message-store");

  const sql = neon(pooledUrl);

  const a = randomUUID();
  const b = randomUUID();
  const outsider = randomUUID();
  const conversationId = randomUUID();

  const email = (id: string) =>
    `ims-phase14-message-${id}@example.invalid`;

  async function expectDenied(
    actorUserId: string,
    targetConversationId: string,
    label: string,
  ) {
    try {
      await persistMessageForActor({
        actorUserId,
        conversationId: targetConversationId,
        body: "This message must not be saved.",
      });
    } catch (error) {
      if (
        error instanceof MessageSendError &&
        error.code === "CONVERSATION_UNAVAILABLE"
      ) {
        console.log(`${label}: PASS`);
        return;
      }

      throw new Error(`${label}: unexpected error`);
    }

    throw new Error(`${label}: unauthorized write succeeded`);
  }

  async function expectInvalidBody(
    body: string,
    label: string,
  ) {
    try {
      await persistMessageForActor({
        actorUserId: a,
        conversationId,
        body,
      });
    } catch {
      console.log(`${label}: PASS`);
      return;
    }

    throw new Error(`${label}: invalid body was accepted`);
  }

  console.log("PHASE 14 — MESSAGE STORE INTEGRATION TEST");
  console.log("Synthetic Development Neon fixtures only.");

  let testFailure: unknown = null;
  let cleanupFailure: unknown = null;

  try {
    const setup = await sql.transaction([
      sql`
        INSERT INTO "user" (
          "id", "name", "email", "email_verified"
        )
        VALUES
          (${a}, 'IMS Test A', ${email(a)}, true),
          (${b}, 'IMS Test B', ${email(b)}, true),
          (
            ${outsider},
            'IMS Test Outsider',
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
    ]);

    if (
      setup[0].length !== 3 ||
      setup[1].length !== 3 ||
      setup[2].length !== 1 ||
      setup[3].length !== 2
    ) {
      throw new Error("Synthetic fixture setup failed.");
    }

    console.log("Synthetic fixture setup: PASS");

    // Send from both members simultaneously.
    const attempts = Array.from({ length: 8 }, (_, i) =>
      persistMessageForActor({
        actorUserId: i % 2 === 0 ? a : b,
        conversationId,
        body: `Synthetic message ${i + 1}`,
      }),
    );

    const outcomes = await Promise.allSettled(attempts);

    const failed = outcomes.filter(
      (outcome) => outcome.status === "rejected",
    );

    if (failed.length > 0) {
      throw new Error(
        `${failed.length} concurrent message sends failed.`,
      );
    }

    const sent = outcomes.flatMap((outcome) =>
      outcome.status === "fulfilled"
        ? [outcome.value]
        : [],
    );

    if (sent.length !== 8) {
      throw new Error("Some messages are missing.");
    }

    const ids = new Set(sent.map((message) => message.id));
    const sequences = new Set(
      sent.map((message) => message.sequence),
    );

    if (ids.size !== 8 || sequences.size !== 8) {
      throw new Error("Duplicate message IDs or sequences.");
    }

    if (
      sent.some(
        (message) =>
          message.conversationId !== conversationId ||
          !new Set<string>([a, b]).has(message.senderUserId) ||
          !Number.isSafeInteger(message.sequence) ||
          Number.isNaN(Date.parse(message.createdAt)),
      )
    ) {
      throw new Error("Invalid persisted message response.");
    }

    console.log("Eight concurrent sends: PASS");
    console.log("Unique message IDs: PASS");
    console.log("Unique numeric sequences: PASS");

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

    if (rows.length !== 8) {
      throw new Error("Database message count incorrect.");
    }

    for (let i = 0; i < rows.length; i++) {
      const current = Number(rows[i].sequence);

      if (
        !Number.isSafeInteger(current) ||
        (i > 0 &&
          current <= Number(rows[i - 1].sequence))
      ) {
        throw new Error("Message sequence ordering invalid.");
      }
    }

    console.log("Durable PostgreSQL storage: PASS");
    console.log("Newest-first cursor ordering: PASS");

    await expectDenied(
      outsider,
      conversationId,
      "Nonparticipant rejection",
    );

    await expectDenied(
      a,
      randomUUID(),
      "Nonexistent conversation rejection",
    );

    // Recipient suspension must block further messages.
    await sql`
      UPDATE "application_user_state"
      SET "status" = 'SUSPENDED'
      WHERE "user_id" = ${b}
    `;

    await expectDenied(
      a,
      conversationId,
      "Suspended recipient rejection",
    );

    await sql`
      UPDATE "application_user_state"
      SET "status" = 'ACTIVE'
      WHERE "user_id" = ${b}
    `;

    // Sender suspension must also block sending.
    await sql`
      UPDATE "application_user_state"
      SET "status" = 'SUSPENDED'
      WHERE "user_id" = ${a}
    `;

    await expectDenied(
      a,
      conversationId,
      "Suspended sender rejection",
    );

    await sql`
      UPDATE "application_user_state"
      SET "status" = 'ACTIVE'
      WHERE "user_id" = ${a}
    `;

    // Test PostgreSQL's defensive body constraints.
    await expectInvalidBody(
      "",
      "Empty body rejection",
    );

    await expectInvalidBody(
      "   ",
      "Whitespace-only body rejection",
    );

    await expectInvalidBody(
      "x".repeat(2001),
      "Oversized body rejection",
    );

    // Exactly 2,000 characters remains valid.
    const boundary = await persistMessageForActor({
      actorUserId: a,
      conversationId,
      body: "x".repeat(2000),
    });

    if (boundary.body.length !== 2000) {
      throw new Error("Valid 2000-character message failed.");
    }

    console.log("Valid maximum-length message: PASS");

    // IDEMPOTENCY INTEGRATION TESTS

    const originalBody = "An idempotent test message";
    const retryKey = randomUUID();

    const firstSend = await persistMessageForActor({
      actorUserId: a,
      conversationId,
      body: originalBody,
      clientMessageId: retryKey,
    });

    const repeatedSend = await persistMessageForActor({
      actorUserId: a,
      conversationId,
      body: originalBody,
      clientMessageId: retryKey,
    });

    if (
      firstSend.id !== repeatedSend.id ||
      firstSend.sequence !== repeatedSend.sequence ||
      firstSend.createdAt !== repeatedSend.createdAt ||
      repeatedSend.body !== originalBody
    ) {
      throw new Error("Identical retry created a different result.");
    }

    console.log("Identical retry returns original message: PASS");

    let conflictRejected = false;

    try {
      await persistMessageForActor({
        actorUserId: a,
        conversationId,
        body: "Different content with the same UUID",
        clientMessageId: retryKey,
      });
    } catch (error) {
      if (
        error instanceof MessageSendError &&
        error.code === "IDEMPOTENCY_CONFLICT"
      ) {
        conflictRejected = true;
      } else {
        throw new Error("Unexpected conflicting-retry error.");
      }
    }

    if (!conflictRejected) {
      throw new Error("Conflicting UUID reuse was accepted.");
    }

    console.log("Conflicting retry rejected: PASS");

    const concurrentKey = randomUUID();

    const retryAttempts = Array.from({ length: 8 }, () =>
      persistMessageForActor({
        actorUserId: b,
        conversationId,
        body: "One logical concurrent message",
        clientMessageId: concurrentKey,
      }),
    );

    const retryOutcomes = await Promise.allSettled(retryAttempts);

    const failures = retryOutcomes.filter(
      (result) => result.status === "rejected",
    );

    if (failures.length !== 0) {
      throw new Error(
        `${failures.length} concurrent duplicate attempts failed.`,
      );
    }

    const successful = retryOutcomes.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );

    const reference = successful[0];

    if (
      !reference ||
      successful.length !== 8 ||
      successful.some(
        (message) =>
          message.id !== reference.id ||
          message.sequence !== reference.sequence ||
          message.createdAt !== reference.createdAt,
      )
    ) {
      throw new Error("Concurrent retries returned different messages.");
    }

    console.log("Eight concurrent retries return one message: PASS");

    async function expectRetryDenied(
      actorUserId: string,
      label: string,
    ) {
      try {
        await persistMessageForActor({
          actorUserId,
          conversationId,
          body: originalBody,
          clientMessageId: retryKey,
        });
      } catch (error) {
        if (
          error instanceof MessageSendError &&
          error.code === "CONVERSATION_UNAVAILABLE"
        ) {
          console.log(`${label}: PASS`);
          return;
        }

        throw new Error(`${label}: unexpected error.`);
      }

      throw new Error(`${label}: unauthorized retry succeeded.`);
    }

    await expectRetryDenied(
      outsider,
      "Nonparticipant cannot replay a message",
    );

    await sql`
      UPDATE "application_user_state"
      SET "status" = 'SUSPENDED'
      WHERE "user_id" = ${b}
    `;

    await expectRetryDenied(
      a,
      "Suspended recipient blocks retry",
    );

    await sql`
      UPDATE "application_user_state"
      SET "status" = 'ACTIVE'
      WHERE "user_id" = ${b}
    `;

    await sql`
      UPDATE "application_user_state"
      SET "status" = 'SUSPENDED'
      WHERE "user_id" = ${a}
    `;

    await expectRetryDenied(
      a,
      "Suspended sender blocks retry",
    );

    await sql`
      UPDATE "application_user_state"
      SET "status" = 'ACTIVE'
      WHERE "user_id" = ${a}
    `;

    const keyedMessages = await sql`
      SELECT
        "client_message_id",
        count(*)::int AS copies
      FROM "messages"
      WHERE
        "conversation_id" = ${conversationId}
        AND "client_message_id" IN (
          ${retryKey}::uuid,
          ${concurrentKey}::uuid
        )
      GROUP BY "client_message_id"
    `;

    if (
      keyedMessages.length !== 2 ||
      keyedMessages.some(
        (row) => Number(row.copies) !== 1
      )
    ) {
      throw new Error("Duplicate idempotency records found.");
    }

    const unchanged = await sql`
      SELECT "body"
      FROM "messages"
      WHERE
        "conversation_id" = ${conversationId}
        AND "sender_user_id" = ${a}
        AND "client_message_id" = ${retryKey}::uuid
      LIMIT 1
    `;

    if (
      unchanged.length !== 1 ||
      unchanged[0].body !== originalBody
    ) {
      throw new Error("Original message content was modified.");
    }

    console.log("Unique database records: PASS");
    console.log("Original message content preserved: PASS");
    const finalCount = await sql`
      SELECT count(*)::int AS count
      FROM "messages"
      WHERE "conversation_id" = ${conversationId}
    `;

    if (Number(finalCount[0]?.count) !== 11) {
      throw new Error(
        "Unauthorized or invalid messages were persisted.",
      );
    }

    console.log("No unauthorized messages persisted: PASS");
  } catch (error) {
    testFailure = error;
  } finally {
    // Cleanup always runs, including when setup or a test
    // fails. Only newly generated synthetic IDs are used.
    try {
      await sql.transaction([
        sql`
          DELETE FROM "messages"
          WHERE "conversation_id" = ${conversationId}
        `,

        sql`
          DELETE FROM "conversation_members"
          WHERE "conversation_id" = ${conversationId}
        `,

        sql`
          DELETE FROM "conversations"
          WHERE "id" = ${conversationId}
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
            WHERE "id" = ${conversationId}
          ) +
          (
            SELECT count(*)
            FROM "messages"
            WHERE "conversation_id" = ${conversationId}
          ) AS count
      `;

      if (Number(remaining[0]?.count) !== 0) {
        throw new Error("Synthetic fixtures remain.");
      }

      console.log("Synthetic fixture cleanup: PASS");
    } catch {
      cleanupFailure = new Error("Cleanup verification failed.");
      console.error(
        "Cleanup failed. Inspect Development Neon before rerunning.",
      );
    }
  }

  if (cleanupFailure) {
    throw cleanupFailure;
  }

  if (testFailure) {
    throw testFailure;
  }

  console.log("PHASE 14 MESSAGE STORE TEST: PASS");
}

main().catch((error: unknown) => {
  // Avoid exposing provider SQL errors or credentials.
  const message =
    error instanceof Error
      ? error.message
      : "Unknown test failure.";

  console.error(`Phase 14 test failed: ${message}`);
  process.exitCode = 1;
});
