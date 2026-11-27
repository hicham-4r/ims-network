import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { count } from "drizzle-orm";
import { db } from "@/server/db";
import { applicationUserState } from "@/server/db/schema";
import { requireAdminPage } from "./routing";
import { ADMIN_STATUSES } from "./admin-query";
import { applicationRoleLabel } from "./owner";

export const ADMIN_METRICS_TAG = "ims-admin-account-counts-v1";
// No identity, account details, audit data, or permissions are cached here.
async function loadCounts() {
  "use cache";
  cacheLife({ stale: 30, revalidate: 30, expire: 60 });
  cacheTag(ADMIN_METRICS_TAG);
  const rows = await db.select({ status: applicationUserState.status, total: count() })
    .from(applicationUserState).groupBy(applicationUserState.status);
  return ADMIN_STATUSES.map(status => ({ status, total: rows.find(row => row.status === status)?.total ?? 0 }));
}
export async function getAdminMetrics() {
  const context = await requireAdminPage(); // Never cache or skip the request-time gate.
  const counts = await loadCounts();
  return { actorRole: applicationRoleLabel({ ...context.accountState, userId: context.session.user.id }), counts, total: counts.reduce((sum, entry) => sum + entry.total, 0) };
}
