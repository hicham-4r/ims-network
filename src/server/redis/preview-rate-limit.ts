import "server-only";
import { neon } from "@neondatabase/serverless";
import { previewRateLimitAllowed } from "./access-policy";
import { createPreviewLimiter, type PreviewLimitKind } from "./preview-rate-limit-core";

export function previewLimiter(kind: PreviewLimitKind) {
  if (!previewRateLimitAllowed(process.env)) return null;
  const url = process.env.DATABASE_URL_POOLED;
  if (!url) return null;
  const sql = neon(url);
  return createPreviewLimiter(kind, async (key, limit, seconds) => {
    // The conflict row is locked by PostgreSQL. No read-then-write race and no
    // new counter row per window. Expired counters reset on the next request.
    const rows = await sql`INSERT INTO ims_preview_testing.rate_limits AS r (key, hits, reset_at)
      VALUES (${key}, 1, statement_timestamp() + ${seconds}::int * interval '1 second')
      ON CONFLICT (key) DO UPDATE SET
        hits = CASE WHEN r.reset_at <= statement_timestamp() THEN 1 ELSE r.hits + 1 END,
        reset_at = CASE WHEN r.reset_at <= statement_timestamp() THEN EXCLUDED.reset_at ELSE r.reset_at END
      WHERE r.reset_at <= statement_timestamp() OR r.hits < ${limit}
      RETURNING hits`;
    if (rows.length > 1 || (rows.length === 1 && (!Number.isInteger(rows[0].hits) || rows[0].hits < 1 || rows[0].hits > limit))) {
      throw new Error("Unexpected Preview rate-limit result.");
    }
    return rows.length === 1;
  });
}
