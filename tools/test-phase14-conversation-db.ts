import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL_POOLED;

if (!url) {
  throw new Error("Development database URL is missing.");
}

const hostname = new URL(url).hostname;

if (
  !hostname.endsWith(".neon.tech") ||
  process.env.VERCEL_ENV ||
  process.env.NODE_ENV === "production"
) {
  throw new Error("Unsafe database test environment.");
}

const sql = neon(url);

const userA = randomUUID();
const userB = randomUUID();
const userC = randomUUID();
const conversationId = randomUUID();

const emailA = `ims-test-${userA}@example.invalid`;
const emailB = `ims-test-${userB}@example.invalid`;
const emailC = `ims-test-${userC}@example.invalid`;

function createConversationQuery(
  actorId: string,
  targetId: string,
  id: string,
) {
  return sql`
    WITH eligible_pair AS (
      SELECT
        LEAST(
          ${actorId}::text COLLATE "C",
          ${targetId}::text COLLATE "C"
        ) AS low_user_id,
        GREATEST(
          ${actorId}::text COLLATE "C",
          ${targetId}::text COLLATE "C"
        ) AS high_user_id
      WHERE
        EXISTS (
          SELECT 1
          FROM "application_user_state"
          WHERE "user_id" = ${actorId}
            AND "status" = 'ACTIVE'
        )
        AND EXISTS (
          SELECT 1
          FROM "application_user_state"
          WHERE "user_id" = ${targetId}
            AND "status" = 'ACTIVE'
        )
    ),
    inserted AS (
      INSERT INTO "conversations" (
        "id", "low_user_id", "high_user_id"
      )
      SELECT
        ${id}, low_user_id, high_user_id
      FROM eligible_pair
      ON CONFLICT ("low_user_id", "high_user_id")
        DO NOTHING
      RETURNING
        "id", "low_user_id", "high_user_id"
    ),
    inserted_members AS (
      INSERT INTO "conversation_members" (
        "conversation_id", "user_id"
      )
      SELECT
        inserted."id",
        participant."user_id"
      FROM inserted
      CROSS JOIN LATERAL (
        VALUES
          (inserted."low_user_id"),
          (inserted."high_user_id")
      ) AS participant("user_id")
      RETURNING "user_id"
    )
    SELECT
      (SELECT count(*)::int FROM inserted)
        AS created_count,
      (SELECT count(*)::int FROM inserted_members)
        AS member_count
  `;
}

function expectCount(
  value: unknown,
  expected: number,
  description: string,
) {
  if (Number(value) !== expected) {
    throw new Error(`${description}: expected ${expected}`);
  }
}

async function main() {
  console.log("PHASE 14 DATABASE CONTRACT TEST");
  console.log("Using isolated synthetic users.");

  // Every statement below belongs to one transaction.
  // On SQL failure PostgreSQL rolls everything back.
  // On success the final statements delete all fixtures.
  const results = await sql.transaction([
    sql`
      INSERT INTO "user" (
        "id", "name", "email", "email_verified"
      )
      VALUES
        (${userA}, 'IMS Test A', ${emailA}, true),
        (${userB}, 'IMS Test B', ${emailB}, true),
        (${userC}, 'IMS Test C', ${emailC}, true)
      RETURNING "id"
    `,

    sql`
      INSERT INTO "application_user_state" (
        "user_id", "status"
      )
      VALUES
        (${userA}, 'ACTIVE'),
        (${userB}, 'ACTIVE'),
        (${userC}, 'SUSPENDED')
      RETURNING "user_id"
    `,

    // First creation.
    createConversationQuery(
      userA,
      userB,
      conversationId,
    ),

    // Reversed pair must not create a duplicate.
    createConversationQuery(
      userB,
      userA,
      randomUUID(),
    ),

    // Suspended participant must not be eligible.
    createConversationQuery(
      userA,
      userC,
      randomUUID(),
    ),

    sql`
      SELECT count(*)::int AS count
      FROM "conversations"
      WHERE "id" = ${conversationId}
    `,

    sql`
      SELECT count(*)::int AS count
      FROM "conversation_members"
      WHERE "conversation_id" = ${conversationId}
    `,

    // Cleanup is part of the same transaction.
    sql`
      DELETE FROM "conversation_members"
      WHERE "conversation_id" = ${conversationId}
      RETURNING "user_id"
    `,

    sql`
      DELETE FROM "conversations"
      WHERE "id" = ${conversationId}
      RETURNING "id"
    `,

    sql`
      DELETE FROM "application_user_state"
      WHERE "user_id" IN (${userA}, ${userB}, ${userC})
      RETURNING "user_id"
    `,

    sql`
      DELETE FROM "user"
      WHERE "id" IN (${userA}, ${userB}, ${userC})
      RETURNING "id"
    `,
  ]);

  expectCount(results[0].length, 3, "Test users");
  expectCount(results[1].length, 3, "Test account states");

  expectCount(
    results[2][0]?.created_count,
    1,
    "First conversation creation",
  );
  expectCount(
    results[2][0]?.member_count,
    2,
    "Initial memberships",
  );

  expectCount(
    results[3][0]?.created_count,
    0,
    "Duplicate conversation prevention",
  );

  expectCount(
    results[4][0]?.created_count,
    0,
    "Suspended member rejection",
  );

  expectCount(
    results[5][0]?.count,
    1,
    "Conversation row count",
  );
  expectCount(
    results[6][0]?.count,
    2,
    "Conversation membership count",
  );

  expectCount(results[7].length, 2, "Membership cleanup");
  expectCount(results[8].length, 1, "Conversation cleanup");
  expectCount(results[9].length, 3, "Account-state cleanup");
  expectCount(results[10].length, 3, "User cleanup");

  // Independently verify that no synthetic users remain.
  const remaining = await sql`
    SELECT count(*)::int AS count
    FROM "user"
    WHERE "id" IN (${userA}, ${userB}, ${userC})
  `;

  expectCount(
    remaining[0]?.count,
    0,
    "Persistent fixture cleanup",
  );

  console.log("First conversation creation: PASS");
  console.log("Exactly two memberships: PASS");
  console.log("Reversed duplicate prevention: PASS");
  console.log("Suspended participant rejection: PASS");
  console.log("Conversation uniqueness: PASS");
  console.log("Synthetic fixture cleanup: PASS");
  console.log("PHASE 14 DATABASE CONTRACT: PASS");
}

main().catch((error: unknown) => {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "UNKNOWN";

  console.error(`Database contract test failed (${code}).`);
  process.exitCode = 1;
});
