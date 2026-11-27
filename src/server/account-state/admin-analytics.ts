import "server-only";
import { cacheLife } from "next/cache";
import { neon } from "@neondatabase/serverless";
import { serverEnv } from "@/server/env";
import { requireAdminPage } from "./routing";
async function loadRegistrationCounts() {
  "use cache";
  cacheLife({stale:60,revalidate:120,expire:300});
  const sql=neon(serverEnv.DATABASE_URL_POOLED);
  const [,rows]=await sql.transaction([sql`SET LOCAL statement_timeout='5s'`,sql`WITH months AS (SELECT generate_series(date_trunc('month',now() AT TIME ZONE 'UTC')-interval '11 months',date_trunc('month',now() AT TIME ZONE 'UTC'),interval '1 month') AS month), counts AS (SELECT date_trunc('month',u.created_at) AS month,count(*)::int AS total FROM "user" u JOIN application_user_state s ON s.user_id=u.id WHERE u.created_at>=date_trunc('month',now() AT TIME ZONE 'UTC')-interval '11 months' GROUP BY 1) SELECT to_char(m.month,'YYYY-MM') AS month,COALESCE(c.total,0) AS total FROM months m LEFT JOIN counts c ON c.month=m.month ORDER BY m.month`]);
  return rows.map(row=>({month:String(row.month),total:Number(row.total)}));
}
export async function getRegistrationCounts(){await requireAdminPage();return loadRegistrationCounts();}
