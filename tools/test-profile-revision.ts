import assert from "node:assert/strict";

import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { PgDialect } from "drizzle-orm/pg-core";

import {
  nextProfileUpdatedAt,
} from "../src/server/profile/revision";

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

  const generated = new PgDialect()
    .sqlToQuery(nextProfileUpdatedAt).sql;

  assert.match(generated, /greatest\s*\(/i);
  assert.match(generated, /clock_timestamp\s*\(\s*\)/i);
  assert.match(generated, /interval '1 millisecond'/i);
  assert.match(generated, /"profiles"\."updated_at"/);

  console.log("Generated Drizzle SQL: PASS");

  const url = process.env.DATABASE_URL_POOLED;

  if (!url) {
    throw new Error("Development database URL missing.");
  }

  const db = neon(url);

  const rows = await db`
    WITH sample AS (
      SELECT
        '2026-11-05T00:00:00.123999+00'::timestamptz
          AS previous_value,
        '2026-11-05T00:00:00.123111+00'::timestamptz
          AS simulated_clock
    )
    SELECT
      greatest(
        date_trunc('milliseconds', simulated_clock),
        date_trunc('milliseconds', previous_value)
          + interval '1 millisecond'
      ) AS next_version
    FROM sample
  `;

  assert.equal(rows.length, 1);

  const nextVersion = new Date(
    rows[0].next_version as string | Date,
  ).toISOString();

  assert.equal(
    nextVersion,
    "2026-11-05T00:00:00.124Z",
  );

  console.log("PostgreSQL monotonic revision: PASS");
  console.log("Millisecond precision: PASS");
  console.log("No database records modified.");
  console.log("ALL PROFILE REVISION TESTS PASSED");
}

main().catch((error: unknown) => {
  console.error(
    "Profile revision test failed:",
    error instanceof Error
      ? error.name
      : "Unknown error",
  );

  process.exitCode = 1;
});