import { sql } from "drizzle-orm";

import { db } from "./index";
import { wrapDatabaseError } from "./errors";

export type DatabaseHealth = {
  ok: true;
  database: string;
  checkedAt: string;
};

export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  try {
    const result = await db.execute<{
      database_name: string;
      checked_at: Date | string;
    }>(
      sql`
        SELECT
          current_database() AS database_name,
          now() AS checked_at
      `,
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error("Database health query returned no rows.");
    }

    return {
      ok: true,
      database: row.database_name,
      checkedAt:
        row.checked_at instanceof Date
          ? row.checked_at.toISOString()
          : new Date(row.checked_at).toISOString(),
    };
  } catch (error) {
    throw wrapDatabaseError(error, "health check");
  }
}
