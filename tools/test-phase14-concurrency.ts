import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

async function main() {
  if (
    process.env.IMS_PHASE14_DEV_TEST !== "I_VERIFIED_DEV_NEON" ||
    process.env.VERCEL_ENV ||
    process.env.CI ||
    process.env.NODE_ENV === "production"
  ) {
    throw new Error("Development test guard failed.");
  }

  const directUrl = process.env.DATABASE_URL;
  const pooledUrl = process.env.DATABASE_URL_POOLED;

  if (!directUrl || !pooledUrl) {
    throw new Error("Development database configuration missing.");
  }

  const direct = new URL(directUrl);
  const pooled = new URL(pooledUrl);

  const host = (value: URL) =>
    value.hostname.replace(/-pooler(?=\.)/, "");

  if (
    !direct.hostname.endsWith(".neon.tech") ||
    !pooled.hostname.endsWith(".neon.tech") ||
    host(direct) !== host(pooled) ||
    direct.pathname !== pooled.pathname
  ) {
    throw new Error("Unexpected database configuration.");
  }

  if (process.env.NODE_ENV !== "development") {
    throw new Error("This test requires NODE_ENV=development.");
  }

  const {
    ConversationOpenError,
    openDirectConversationForActor,
  } = await import(
    "../src/server/messaging/conversation-store"
  );

  const sql = neon(pooledUrl);

  const a = randomUUID();
  const b = randomUUID();
  const suspended = randomUUID();


  let seeded = false;
  let testFailure: unknown = null;
  let cleanupFailure: unknown = null;

  async function expectUnavailable(
    operation: () => Promise<unknown>,
    label: string,
  ) {
    try {
      await operation();
    } catch (error) {
      if (error instanceof ConversationOpenError) {
        console.log(`${label}: PASS`);
        return;
      }

      throw new Error(`${label}: unexpected error`);
    }

    throw new Error(`${label}: request unexpectedly succeeded`);
  }

  console.log("PHASE 14 — ACTUAL STORE CONCURRENCY TEST");
  console.log("Development Neon only. Synthetic accounts.");

  try {
    const seed = await sql.transaction([
      sql`
        INSERT INTO "user" (
          "id", "name", "email", "email_verified"
        )
        VALUES
          (
            ${a}, 'Phase14 Test A',
            ${`ims-phase14-${a}@example.invalid`}, true
          ),
          (
            ${b}, 'Phase14 Test B',
            ${`ims-phase14-${b}@example.invalid`}, true
          ),
          (
            ${suspended}, 'Phase14 Suspended',
            ${`ims-phase14-${suspended}@example.invalid`}, true
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
          (${suspended}, 'SUSPENDED')
        RETURNING "user_id"
      `,
    ]);

    seeded = true;

    if (seed[0].length !== 3 || seed[1].length !== 3) {
      throw new Error("Synthetic account setup failed.");
    }

    // All requests start without an existing conversation.
    // Half use A -> B, half use B -> A.
    const requests = Array.from(
      { length: 12 },
      (_, i) =>
        openDirectConversationForActor(
          i % 2 === 0 ? a : b,
          i % 2 === 0 ? b : a,
        ),
    );

    // Wait for every attempt to settle before cleanup.
    const outcomes = await Promise.allSettled(requests);

    const rejected = outcomes.filter(
      (item) => item.status === "rejected",
    );

    if (rejected.length !== 0) {
      throw new Error(
        `${rejected.length} concurrent requests failed.`,
      );
    }

    const opened = outcomes.flatMap((item) =>
      item.status === "fulfilled" ? [item.value] : [],
    );

    if (opened.length !== 12) {
      throw new Error("Missing conversation results.");
    }

    const conversationIds = new Set(
      opened.map((item) => item.conversationId),
    );

    if (conversationIds.size !== 1) {
      throw new Error("Concurrent requests returned different IDs.");
    }

    const createdCount = opened.filter(
      (item) => item.created === true,
    ).length;

    if (createdCount !== 1) {
      throw new Error("Expected exactly one creation.");
    }

    const conversationId = opened[0].conversationId;

    console.log("12 concurrent requests: PASS");
    console.log("One shared conversation ID: PASS");
    console.log("Exactly one successful creation: PASS");

    // Reopening must not create new rows.
    const reopenA = await openDirectConversationForActor(a, b);
    const reopenB = await openDirectConversationForActor(b, a);

    if (
      reopenA.conversationId !== conversationId ||
      reopenB.conversationId !== conversationId ||
      reopenA.created ||
      reopenB.created
    ) {
      throw new Error("Conversation reopening is not idempotent.");
    }

    console.log("Reopening both directions: PASS");

    await expectUnavailable(
      () => openDirectConversationForActor(a, a),
      "Self-conversation rejection",
    );

    await expectUnavailable(
      () => openDirectConversationForActor(a, suspended),
      "Suspended target rejection",
    );

    await expectUnavailable(
      () => openDirectConversationForActor(suspended, a),
      "Suspended actor rejection",
    );

    await expectUnavailable(
      () => openDirectConversationForActor(a, randomUUID()),
      "Nonexistent target rejection",
    );

    // Confirm the conversation has exactly two participants.
    const members = await sql`
      SELECT "user_id"
      FROM "conversation_members"
      WHERE "conversation_id" = ${conversationId}
    `;

    const memberIds = new Set(
      members.map((row) => row.user_id),
    );

    if (
      members.length !== 2 ||
      !memberIds.has(a) ||
      !memberIds.has(b)
    ) {
      throw new Error("Conversation membership integrity failed.");
    }

    const conversations = await sql`
      SELECT count(*)::int AS count
      FROM "conversations"
      WHERE
        "low_user_id" IN (${a}, ${b})
        AND "high_user_id" IN (${a}, ${b})
    `;

    if (Number(conversations[0]?.count) !== 1) {
      throw new Error("Duplicate conversation found.");
    }

    console.log("Exactly two correct participants: PASS");
    console.log("Database pair uniqueness: PASS");

    // An existing conversation must stop opening when
    // either account becomes suspended.
    await sql`
      UPDATE "application_user_state"
      SET "status" = 'SUSPENDED'
      WHERE "user_id" = ${b}
    `;

    await expectUnavailable(
      () => openDirectConversationForActor(a, b),
      "Existing conversation suspension protection",
    );

    await sql`
      UPDATE "application_user_state"
      SET "status" = 'ACTIVE'
      WHERE "user_id" = ${b}
    `;

    const restored = await openDirectConversationForActor(a, b);

    if (
      restored.conversationId !== conversationId ||
      restored.created
    ) {
      throw new Error("Restoration/reopening failed.");
    }

    console.log("Restoration retains conversation: PASS");
  } catch (error) {
    testFailure = error;
  } finally {
    // Cleanup does not depend on the test having passed.
    // It removes only conversations tied to synthetic IDs.
    try {
      if (seeded) {
        await sql.transaction([
          sql`
            DELETE FROM "messages"
            WHERE "conversation_id" IN (
              SELECT "id"
              FROM "conversations"
              WHERE
                "low_user_id" IN (${a}, ${b}, ${suspended})
                OR "high_user_id" IN (${a}, ${b}, ${suspended})
            )
          `,
          sql`
            DELETE FROM "conversation_members"
            WHERE "conversation_id" IN (
              SELECT "id"
              FROM "conversations"
              WHERE
                "low_user_id" IN (${a}, ${b}, ${suspended})
                OR "high_user_id" IN (${a}, ${b}, ${suspended})
            )
          `,
          sql`
            DELETE FROM "conversations"
            WHERE
              "low_user_id" IN (${a}, ${b}, ${suspended})
              OR "high_user_id" IN (${a}, ${b}, ${suspended})
          `,
          sql`
            DELETE FROM "application_user_state"
            WHERE "user_id" IN (${a}, ${b}, ${suspended})
          `,
          sql`
            DELETE FROM "user"
            WHERE "id" IN (${a}, ${b}, ${suspended})
          `,
        ]);
      }

      const remaining = await sql`
        SELECT count(*)::int AS count
        FROM "user"
        WHERE "id" IN (${a}, ${b}, ${suspended})
      `;

      if (Number(remaining[0]?.count) !== 0) {
        throw new Error("Synthetic accounts remain.");
      }

      console.log("Synthetic account cleanup: PASS");
    } catch (error) {
      cleanupFailure = error;
      console.error(
        "Cleanup failed. Inspect Development Neon before rerunning.",
      );
    }
  }

  if (cleanupFailure) {
    throw new Error("Synthetic fixture cleanup failed.");
  }

  if (testFailure) {
    throw testFailure;
  }

  console.log("PHASE 14 CONCURRENCY TEST: PASS");
}

main().catch((error: unknown) => {
  // Avoid printing SQL details, connection strings,
  // or provider error objects.
  const message =
    error instanceof Error ? error.message : "Unknown error";

  console.error(`Phase 14 test failed: ${message}`);
  process.exitCode = 1;
});
