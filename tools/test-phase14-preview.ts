/**
 * Phase 14 Preview-only service integration test.
 * Creates three random synthetic users; never creates auth sessions, calls Resend,
 * or alters pre-existing accounts. Runs against the hard-allowlisted Preview Neon host.
 * Run exclusively through tools/run-phase14-preview.ps1.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const PREVIEW_HOST = "ep-misty-salad-b9lmcmek.c-7.eu-central-1.aws.neon.tech";
const EXPECTED_DATABASE = "/neondb";

function assert(condition: unknown, explanation: string): asserts condition {
  if (!condition) throw new Error(explanation);
}

function pass(description: string): void {
  console.log(`PASS: ${description}`);
}

async function main(): Promise<void> {
  assert(
    process.env.IMS_PHASE14_PREVIEW_TEST === "EXPLICIT_PREVIEW_ONLY",
    "Preview-only launcher guard failed.",
  );
  assert(!process.env.VERCEL_ENV && !process.env.CI,
    "Refusing to run inside Vercel or CI.");

  const url = process.env.DATABASE_URL;
  assert(url, "No explicit Preview connection provided.");

  const target = new URL(url);
  assert(
    target.protocol === "postgresql:" || target.protocol === "postgres:",
    "Expected a PostgreSQL URL.",
  );
  assert(
    target.hostname === PREVIEW_HOST &&
      target.pathname === EXPECTED_DATABASE &&
      !target.hostname.includes("-pooler"),
    "Refusing database: not the approved Preview Neon direct host and database.",
  );

  // All repository service/store imports must see the Preview URL, never the
  // developer's .env.local. These values are temporary in this child process.
  process.env.DATABASE_URL_POOLED = url;
  Object.assign(process.env, { NODE_ENV: "test" });
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.RESEND_API_KEY = "synthetic-preview-test-never-send";
  process.env.RESEND_FROM_EMAIL = "no-email@example.invalid";

  const sql = neon(url);
  const preflight = await sql`
    SELECT current_database() AS database_name,
      to_regclass('public.user') AS users,
      to_regclass('public.conversations') AS conversations,
      to_regclass('public.conversation_members') AS members,
      to_regclass('public.messages') AS messages,
      (SELECT COUNT(*)::int FROM drizzle.__drizzle_migrations) AS migrations
  `;
  const p = preflight[0];
  assert(
    p?.database_name === "neondb" &&
      typeof p?.users === "string" &&
      p?.conversations === "conversations" &&
      p?.members === "conversation_members" &&
      p?.messages === "messages" &&
      Number(p?.migrations) >= 6,
    "Preview schema preflight failed: expected six migrations and messaging tables.",
  );
  pass("Target is verified Preview Neon, with Phase 14 schema");

  const a = randomUUID();
  const b = randomUUID();
  const outsider = randomUUID();
  const clientId = randomUUID();
  const runId = randomUUID();
  let fixtureSetupAttempted = false;
  let testError: Error | null = null;
  let cleanupError = false;
  let stage = "initialization";

  try {
    stage = "synthetic member creation";
    fixtureSetupAttempted = true;
    const setup = await sql.transaction([
      sql`
        INSERT INTO "user" ("id", "name", "email", "email_verified")
        VALUES
          (${a}, 'Preview Synthetic A', ${`preview-test-${runId}-a@example.invalid`}, true),
          (${b}, 'Preview Synthetic B', ${`preview-test-${runId}-b@example.invalid`}, true),
          (${outsider}, 'Preview Synthetic Outsider', ${`preview-test-${runId}-c@example.invalid`}, true)
        RETURNING "id"
      `,
      sql`
        INSERT INTO "application_user_state" ("user_id", "status")
        VALUES (${a}, 'ACTIVE'), (${b}, 'ACTIVE'), (${outsider}, 'ACTIVE')
        RETURNING "user_id"
      `,
    ]);
    assert(setup[0].length === 3 && setup[1].length === 3,
      "Synthetic member setup failed.");
    pass("Three synthetic ACTIVE test members provisioned without email");

    // Import *internal* repository store functions, not authenticated server
    // actions: the latter require real Better Auth browser sessions.
    const { openDirectConversationForActor } =
      await import("../src/server/messaging/conversation-store");
    const { persistMessageForActor, MessageSendError } =
      await import("../src/server/messaging/message-store");
    const { getConversationHistoryForActor, MessageHistoryError } =
      await import("../src/server/messaging/history-store");
    const { getConversationInboxForActor } =
      await import("../src/server/messaging/inbox-store");
    const { getUnreadCountForActor, markConversationReadForActor } =
      await import("../src/server/messaging/read-store");

    async function expectRejected(
      operation: () => Promise<unknown>,
      isExpected: (error: unknown) => boolean,
      label: string,
    ): Promise<void> {
      let rejected = false;
      try {
        await operation();
      } catch (error) {
        if (!isExpected(error)) throw new Error(`${label}: unexpected failure`);
        rejected = true;
      }
      assert(rejected, `${label}: operation unexpectedly succeeded`);
      pass(label);
    }

    stage = "conversation creation";
    const opened = await openDirectConversationForActor(a, b);
    assert(opened.created && typeof opened.conversationId === "string",
      "Could not create direct conversation.");
    const conversationId = opened.conversationId;
    const reverse = await openDirectConversationForActor(b, a);
    assert(!reverse.created && reverse.conversationId === conversationId,
      "Reversed participant order made a duplicate conversation.");
    pass("Canonical conversation and reversed-pair deduplication");

    stage = "message persistence and idempotency";
    const sentA = await persistMessageForActor({
      actorUserId: a, conversationId,
      clientMessageId: clientId,
      body: "Preview synthetic message A",
    });
    const sentB = await persistMessageForActor({
      actorUserId: b, conversationId,
      clientMessageId: randomUUID(),
      body: "Preview synthetic reply B",
    });
    assert(sentA.sequence < sentB.sequence, "Message ordering is incorrect.");
    const retry = await persistMessageForActor({
      actorUserId: a, conversationId, clientMessageId: clientId,
      body: "Preview synthetic message A",
    });
    assert(retry.id === sentA.id,
      "Idempotent retry inserted a second logical message.");
    await expectRejected(
      () => persistMessageForActor({
        actorUserId: a, conversationId, clientMessageId: clientId,
        body: "Different content for same client ID",
      }),
      (error) => error instanceof MessageSendError &&
        error.code === "IDEMPOTENCY_CONFLICT",
      "Conflicting idempotency retry rejected",
    );
    pass("Durable ordered send, reply, and idempotent retry");

    stage = "history and inbox privacy";
    const history = await getConversationHistoryForActor(a, { conversationId });
    assert(history.messages.length === 2 &&
      history.messages[0]?.id === sentB.id &&
      history.messages[1]?.id === sentA.id,
      "Recent message history is not newest-first.");
    const inbox = await getConversationInboxForActor(a, {});
    assert(inbox.conversations.length === 1 &&
      inbox.conversations[0]?.conversationId === conversationId &&
      inbox.conversations[0]?.unreadCount === 1,
      "Inbox message or unread summary is incorrect.");
    const outsideInbox = await getConversationInboxForActor(outsider, {});
    assert(outsideInbox.conversations.length === 0,
      "Nonparticipant received private inbox data.");
    await expectRejected(
      () => getConversationHistoryForActor(outsider, { conversationId }),
      (error) => error instanceof MessageHistoryError &&
        error.code === "CONVERSATION_UNAVAILABLE",
      "Nonparticipant history access rejected",
    );
    await expectRejected(
      () => persistMessageForActor({
        actorUserId: outsider, conversationId,
        clientMessageId: randomUUID(), body: "Should never persist",
      }),
      (error) => error instanceof MessageSendError &&
        error.code === "CONVERSATION_UNAVAILABLE",
      "Nonparticipant send rejected",
    );
    pass("Private history, inbox summary, and outsider isolation");

    stage = "unread and read cursor";
    const unreadBefore = await getUnreadCountForActor(a, { conversationId });
    assert(unreadBefore.unreadCount === 1 && unreadBefore.lastReadSequence === null,
      "Unexpected initial unread state.");
    const marked = await markConversationReadForActor(a, {
      conversationId, messageId: sentB.id,
    });
    assert(marked.lastReadSequence === sentB.sequence,
      "Read cursor did not advance.");
    const after = await getUnreadCountForActor(a, { conversationId });
    assert(after.unreadCount === 0,
      "Incoming message remained unread after read update.");
    const backward = await markConversationReadForActor(a, {
      conversationId, messageId: sentA.id,
    });
    assert(backward.lastReadSequence === sentB.sequence,
      "Read cursor unexpectedly moved backward.");
    pass("Incoming unread count and monotonic read cursor");

    stage = "suspended participant privacy";
    await sql`
      UPDATE "application_user_state" SET "status" = 'SUSPENDED'
      WHERE "user_id" = ${b}
    `;
    const suspendedInbox = await getConversationInboxForActor(a, {});
    assert(suspendedInbox.conversations.length === 0,
      "Conversation remained visible after participant suspension.");
    await expectRejected(
      () => getConversationHistoryForActor(a, { conversationId }),
      (error) => error instanceof MessageHistoryError &&
        error.code === "CONVERSATION_UNAVAILABLE",
      "Suspended recipient blocks history",
    );
    await expectRejected(
      () => persistMessageForActor({
        actorUserId: a, conversationId,
        clientMessageId: randomUUID(), body: "Should be blocked",
      }),
      (error) => error instanceof MessageSendError &&
        error.code === "CONVERSATION_UNAVAILABLE",
      "Suspended recipient blocks sending",
    );
    await sql`
      UPDATE "application_user_state" SET "status" = 'ACTIVE'
      WHERE "user_id" = ${b}
    `;
    const restored = await getConversationHistoryForActor(a, { conversationId });
    assert(restored.messages.length === 2, "Restoration did not recover history.");
    pass("Suspension and restoration privacy checks");
  } catch {
    // Provider error messages may contain queries or parameters. Do not echo them.
    testError = new Error(`Preview test stopped during ${stage}. No credentials logged.`);
  } finally {
    if (fixtureSetupAttempted) {
      try {
        // Only IDs belonging to this run can be removed. The synthetic
        // participant pair identifies any conversation even if creation
        // returned an error before the ID reached this test runner.
        await sql.transaction([
          sql`
            DELETE FROM "messages" WHERE "conversation_id" IN (
              SELECT "id" FROM "conversations"
              WHERE ("low_user_id" = ${a} AND "high_user_id" = ${b})
                 OR ("low_user_id" = ${b} AND "high_user_id" = ${a})
            )
          `,
          sql`
            DELETE FROM "conversation_members" WHERE "conversation_id" IN (
              SELECT "id" FROM "conversations"
              WHERE ("low_user_id" = ${a} AND "high_user_id" = ${b})
                 OR ("low_user_id" = ${b} AND "high_user_id" = ${a})
            )
          `,
          sql`
            DELETE FROM "conversations"
            WHERE ("low_user_id" = ${a} AND "high_user_id" = ${b})
               OR ("low_user_id" = ${b} AND "high_user_id" = ${a})
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
          SELECT (
            (SELECT COUNT(*) FROM "user"
             WHERE "id" IN (${a}, ${b}, ${outsider}))
            + (SELECT COUNT(*) FROM "application_user_state"
               WHERE "user_id" IN (${a}, ${b}, ${outsider}))
            + (SELECT COUNT(*) FROM "conversations"
               WHERE ("low_user_id" = ${a} AND "high_user_id" = ${b})
                  OR ("low_user_id" = ${b} AND "high_user_id" = ${a}))
          )::int AS residual
        `;
        assert(Number(remaining[0]?.residual) === 0,
          "Synthetic records remain after cleanup.");
        pass("All synthetic fixtures cleaned up");
      } catch {
        cleanupError = true;
        console.error("FAIL: Cleanup incomplete. Do not rerun until reviewed.");
        // Synthetic IDs are safe to share for targeted cleanup; never log URLs.
        console.error(`Synthetic run ID: ${runId}`);
        console.error(`Synthetic participant IDs: ${a}, ${b}, ${outsider}`);
      }
    }
  }
  if (testError) throw testError;
  if (cleanupError) throw new Error("Synthetic cleanup failed.");
  console.log("PHASE 14 PREVIEW STORE INTEGRATION: PASS");
  console.log("Note: Better Auth HTTP actions, Resend and browser UI were not tested.");
}

main().catch((error: unknown) => {
  // Do not print Neon SQL error objects, query parameters, URLs or credentials.
  console.error(error instanceof Error ? error.message : "Test failed.");
  process.exitCode = 1;
});
