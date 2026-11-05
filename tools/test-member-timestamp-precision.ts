import assert from "node:assert/strict";

import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

async function main() {
  if (
    process.env.NODE_ENV === "production" ||
    (
      process.env.VERCEL_ENV &&
      process.env.VERCEL_ENV !== "development"
    )
  ) {
    throw new Error("Development-only test.");
  }

  const url = process.env.DATABASE_URL_POOLED;

  if (!url) {
    throw new Error("Development database URL missing.");
  }

  const db = neon(url);

  const samples = await db`
    SELECT
      p.user_id,
      p.updated_at
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

  if (samples.length === 0) {
    console.log("No ACTIVE profiles to test.");
    return;
  }

  const sample = samples[0];

  // Do NOT convert an existing Date through String().
  // Date.toString() drops the fractional seconds.
  const raw: unknown = sample.updated_at;

  const date =
    raw instanceof Date
      ? raw
      : typeof raw === "string"
        ? new Date(raw)
        : new Date(Number.NaN);

  assert.ok(
    Number.isFinite(date.getTime()),
    "Database timestamp must parse as a Date.",
  );

  const iso = date.toISOString();

  const [result] = await db`
    SELECT
      (
        p.updated_at <>
        date_trunc('milliseconds', p.updated_at)
      ) AS high_precision,

      (
        p.updated_at =
        ${iso}::timestamptz
      ) AS exact_match,

      (
        date_trunc('milliseconds', p.updated_at) =
        ${iso}::timestamptz
      ) AS corrected_match

    FROM profiles p
    INNER JOIN application_user_state s
      ON s.user_id = p.user_id
    WHERE
      p.user_id = ${sample.user_id}
      AND s.status = 'ACTIVE'
    LIMIT 1
  `;

  assert.ok(result, "ACTIVE profile must still exist.");

  if (result.high_precision === true) {
    assert.equal(
      result.exact_match,
      false,
      "Exact comparison should reproduce the legacy mismatch.",
    );

    console.log("Legacy precision mismatch reproduced: PASS");
  }

  assert.equal(
    result.corrected_match,
    true,
    "Millisecond comparison must match the stored profile.",
  );

  console.log("Precision-safe timestamp comparison: PASS");
  console.log("No personal details displayed.");
  console.log("No database records modified.");
  console.log("ALL TIMESTAMP REGRESSION TESTS PASSED");
}

main().catch((error: unknown) => {
  console.error(
    "Timestamp regression failed:",
    error instanceof Error ? error.message : "Unknown error",
  );

  process.exitCode = 1;
});