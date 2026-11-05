import assert from "node:assert/strict";

import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

async function main() {
  if (
    process.env.NODE_ENV === "production" ||
    (process.env.VERCEL_ENV &&
      process.env.VERCEL_ENV !== "development")
  ) {
    throw new Error("Development-only database test.");
  }

  const url = process.env.DATABASE_URL_POOLED;

  if (!url) {
    throw new Error("Development database URL missing.");
  }

  const db = neon(url);

  // Select a real ACTIVE member, prioritizing an older
  // timestamp that has sub-millisecond precision.
  const samples = await db`
    SELECT p.user_id, p.updated_at
    FROM profiles p
    INNER JOIN application_user_state s
      ON s.user_id = p.user_id
    WHERE s.status = 'ACTIVE'
    ORDER BY
      (
        p.updated_at <>
        date_trunc('milliseconds', p.updated_at)
      ) DESC,
      p.user_id
    LIMIT 1
  `;

  assert.equal(
    samples.length,
    1,
    "A Development ACTIVE member is needed.",
  );

  const sample = samples[0];

  const raw: unknown = sample.updated_at;
  const revision =
    raw instanceof Date
      ? raw
      : typeof raw === "string"
        ? new Date(raw)
        : new Date(Number.NaN);

  assert.ok(
    Number.isFinite(revision.getTime()),
    "Could not parse profile revision.",
  );

  const revisionIso = revision.toISOString();

  // Mirrors the corrected member-detail SQL conditions.
  const matched = await db`
    SELECT p.user_id
    FROM profiles p
    INNER JOIN application_user_state s
      ON s.user_id = p.user_id
    WHERE
      p.user_id = ${sample.user_id}
      AND s.status = 'ACTIVE'
      AND date_trunc('milliseconds', p.updated_at)
        = ${revisionIso}::timestamptz
    LIMIT 1
  `;

  assert.equal(matched.length, 1);
  console.log("Current ACTIVE profile revision: PASS");

  // The old revision must not match after a change.
  const staleRevision = new Date(
    revision.getTime() - 1000,
  ).toISOString();

  const stale = await db`
    SELECT p.user_id
    FROM profiles p
    INNER JOIN application_user_state s
      ON s.user_id = p.user_id
    WHERE
      p.user_id = ${sample.user_id}
      AND s.status = 'ACTIVE'
      AND date_trunc('milliseconds', p.updated_at)
        = ${staleRevision}::timestamptz
    LIMIT 1
  `;

  assert.equal(stale.length, 0);
  console.log("Outdated revision rejected: PASS");

  // An ACTIVE member must never satisfy SUSPENDED.
  const suspended = await db`
    SELECT p.user_id
    FROM profiles p
    INNER JOIN application_user_state s
      ON s.user_id = p.user_id
    WHERE
      p.user_id = ${sample.user_id}
      AND s.status = 'SUSPENDED'
    LIMIT 1
  `;

  assert.equal(suspended.length, 0);
  console.log("Inactive-status filtering: PASS");

  // EXPLAIN ANALYZE runs the read-only SELECT and
  // reports PostgreSQL's actual execution plan.
  const explanations = await db`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT p.user_id
    FROM profiles p
    INNER JOIN application_user_state s
      ON s.user_id = p.user_id
    WHERE
      p.user_id = ${sample.user_id}
      AND s.status = 'ACTIVE'
      AND date_trunc('milliseconds', p.updated_at)
        = ${revisionIso}::timestamptz
    LIMIT 1
  `;

  assert.equal(explanations.length, 1);

  const rawPlan: unknown =
    explanations[0]["QUERY PLAN"];

  const parsedPlan: unknown =
    typeof rawPlan === "string"
      ? JSON.parse(rawPlan)
      : rawPlan;

  assert.ok(
    Array.isArray(parsedPlan) &&
      parsedPlan.length > 0,
    "Unexpected PostgreSQL plan format.",
  );

  const details = parsedPlan[0] as {
    Plan?: {
      "Actual Rows"?: number;
      "Actual Total Time"?: number;
    };
    "Execution Time"?: number;
    "Planning Time"?: number;
  };

  assert.equal(details.Plan?.["Actual Rows"], 1);

  console.log(
    "Planning time (ms):",
    details["Planning Time"] ?? "unavailable",
  );

  console.log(
    "Execution time (ms):",
    details["Execution Time"] ?? "unavailable",
  );

  console.log("PostgreSQL execution plan: PASS");
  console.log("No personal details displayed.");
  console.log("No database records modified.");
  console.log("ALL MEMBER DETAIL DB TESTS PASSED");
}

main().catch((error: unknown) => {
  console.error(
    "Member-detail database test failed:",
    error instanceof Error
      ? error.message
      : "Unknown error",
  );

  process.exitCode = 1;
});