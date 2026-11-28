import "server-only";

import { and, asc, eq, gt, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@/server/db";
import { applicationUserState, user, profiles, moderationReviewers } from "@/server/db/schema";
import { requireAdminPage } from "./routing";
import { ADMIN_PAGE_SIZE, encodeAdminCursor, escapeSearch, pageOf, parseAccountQuery, validId, type AdminParams } from "./admin-query";

const accountColumns = {
  userId: user.id, name: user.name, email: user.email, createdAt: user.createdAt,
  status: applicationUserState.status, role: applicationUserState.role,
  approvedAt: applicationUserState.approvedAt, rejectedAt: applicationUserState.rejectedAt,
  rejectionReason: applicationUserState.rejectionReason, suspendedAt: applicationUserState.suspendedAt,
  suspensionReason: applicationUserState.suspensionReason, updatedAt: applicationUserState.updatedAt,
};

export async function getAdminAccountsPageData(input: AdminParams = {}) {
  const context = await requireAdminPage();
  const query = parseAccountQuery(input);
  const conditions: SQL[] = [];
  if (query.status !== "ALL") conditions.push(eq(applicationUserState.status, query.status));
  if (query.q) {
    const prefix = escapeSearch(query.q) + "%";
    const condition = or(ilike(user.name, prefix), ilike(user.email, prefix));
    if (condition) conditions.push(condition);
  }
  if (query.afterId) conditions.push(gt(user.id, query.afterId));
  const rows = await db.select(accountColumns).from(applicationUserState)
    .innerJoin(user, eq(applicationUserState.userId, user.id))
    .where(and(...conditions)).orderBy(asc(user.id)).limit(ADMIN_PAGE_SIZE + 1);
  const page = pageOf(rows, last => encodeAdminCursor(["accounts-v1", query.status, query.q, last.userId]));
  return { ...context, query, accounts: page.items, nextCursor: page.nextCursor };
}

export async function getAdminAccountDetail(id: string) {
  const context = await requireAdminPage();
  if (!validId(id)) return null;
  const [account] = await db.select({ ...accountColumns,
    displayName: profiles.displayName, program: profiles.program, department: profiles.department,
    graduationYear: profiles.graduationYear, approvedBy: applicationUserState.approvedBy,
    moderatorUserId: moderationReviewers.userId,
  }).from(applicationUserState).innerJoin(user, eq(applicationUserState.userId, user.id))
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .leftJoin(moderationReviewers, eq(moderationReviewers.userId, user.id))
    .where(eq(user.id, id)).limit(1);
  return account ? { ...context, account } : null;
}
