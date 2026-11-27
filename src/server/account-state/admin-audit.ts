import "server-only";
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/server/db";
import { auditLog, user } from "@/server/db/schema";
import { requireAdminPage } from "./routing";
import { ADMIN_PAGE_SIZE, AUDIT_ACTIONS, encodeAdminCursor, isAdminStatus, pageOf, parseAuditQuery, type AdminParams } from "./admin-query";

export async function getAdminAuditPage(input: AdminParams) {
  await requireAdminPage();
  const query = parseAuditQuery(input);
  const actor = alias(user, "audit_actor");
  const conditions: SQL[] = [eq(auditLog.targetType, "USER"), inArray(auditLog.action, [...AUDIT_ACTIONS])];
  if (query.action !== "ALL") conditions.push(eq(auditLog.action, query.action));
  if (query.target) conditions.push(eq(auditLog.targetId, query.target));
  if (query.before) conditions.push(sql`(${auditLog.createdAt}, ${auditLog.id}) < (${query.before.at}::timestamptz, ${query.before.id}::text)`);
  // Preserve PostgreSQL microseconds for stable keyset pagination.
  const rows = await db.select({ id: auditLog.id, actorId: auditLog.actorUserId,
    actorName: actor.name, action: auditLog.action, targetId: auditLog.targetId,
    at: sql<string>`to_char(${auditLog.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    fromStatus: sql<string | null>`${auditLog.metadata}->>'from_status'`,
    toStatus: sql<string | null>`${auditLog.metadata}->>'to_status'`,
    fromRole: sql<string | null>`${auditLog.metadata}->>'from_role'`,
    toRole: sql<string | null>`${auditLog.metadata}->>'to_role'`,
  }).from(auditLog).leftJoin(actor, eq(auditLog.actorUserId, actor.id))
    .where(and(...conditions)).orderBy(desc(auditLog.createdAt), desc(auditLog.id)).limit(ADMIN_PAGE_SIZE + 1);
  const page = pageOf(rows, last => encodeAdminCursor(["audit-v1", query.action, query.target, last.at, last.id]));
  return { query, nextCursor: page.nextCursor, events: page.items.map(row => ({ ...row,
    fromStatus: isAdminStatus(row.fromStatus) ? row.fromStatus : null,
    toStatus: isAdminStatus(row.toStatus) ? row.toStatus : null,
    fromRole: row.fromRole === "MEMBER" || row.fromRole === "ADMIN" ? row.fromRole : null,
    toRole: row.toRole === "MEMBER" || row.toRole === "ADMIN" ? row.toRole : null,
  })) };
}
