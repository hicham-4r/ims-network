import { sql } from "drizzle-orm";

import { profiles } from "@/server/db/schema";

// Generate a strictly increasing millisecond timestamp
// for each committed update of the same profile row.
//
// PostgreSQL serializes concurrent updates to that row.
// This avoids identical JavaScript-millisecond cache versions.
export const nextProfileUpdatedAt = sql<Date>`
  greatest(
    date_trunc('milliseconds', clock_timestamp()),
    date_trunc('milliseconds', ${profiles.updatedAt})
      + interval '1 millisecond'
  )
`;