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
    throw new Error("Development-only audit.");
  }

  const url = process.env.DATABASE_URL_POOLED;

  if (!url) {
    throw new Error("Development database URL missing.");
  }

  const sql = neon(url);

  // Read-only aggregate: no personal details displayed.
  const [summary] = await sql`
    SELECT
      count(*)::integer AS active_profiles,
      count(*) FILTER (
        WHERE p.updated_at <>
          date_trunc('milliseconds', p.updated_at)
      )::integer AS high_precision_profiles
    FROM profiles p
    INNER JOIN application_user_state s
      ON s.user_id = p.user_id
    WHERE s.status = 'ACTIVE'
  `;

  console.log(
    "Active profiles inspected:",
    Number(summary.active_profiles),
  );

  console.log(
    "Sub-millisecond timestamp profiles:",
    Number(summary.high_precision_profiles),
  );

  // Prefer a high-precision example if one exists.
  const samples = await sql`
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
    console.log("No active profile available for comparison.");
    console.log("No records modified.");
    return;
  }

  const sample = samples[0];
  const jsDate = new Date(String(sample.updated_at));

  if (Number.isNaN(jsDate.getTime())) {
    throw new Error("Timestamp conversion failed.");
  }

  const [result] = await sql`
    SELECT
      (
        updated_at =
        ${jsDate.toISOString()}::timestamptz
      ) AS exact_match,

      (
        date_trunc('milliseconds', updated_at) =
        date_trunc(
          'milliseconds',
          ${jsDate.toISOString()}::timestamptz
        )
      ) AS millisecond_match

    FROM profiles
    WHERE user_id = ${sample.user_id}
    LIMIT 1
  `;

  console.log(
    "Exact timestamp comparison:",
    result.exact_match === true ? "PASS" : "FAIL",
  );

  console.log(
    "Millisecond comparison:",
    result.millisecond_match === true ? "PASS" : "FAIL",
  );

  if (result.exact_match === false) {
    console.log(
      "PRECISION MISMATCH CONFIRMED: " +
      "member detail comparison requires correction.",
    );
  } else {
    console.log(
      "Sample comparison passed. " +
      "Other/future rows still need precision-safe handling.",
    );
  }

  console.log("No personal details displayed.");
  console.log("No database records modified.");
  console.log("PHASE 13 TIMESTAMP AUDIT COMPLETE");
}

main().catch((error: unknown) => {
  console.error(
    "Timestamp audit failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
});