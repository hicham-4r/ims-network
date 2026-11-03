import {
  asc,
  eq,
} from "drizzle-orm";

import { db } from "@/server/db";
import {
  applicationUserState,
  user,
} from "@/server/db/schema";

import { requireAdminPage } from "./routing";

export async function getAdminAccountsPageData() {
  const context =
    await requireAdminPage();

  const accounts = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,

      status: applicationUserState.status,
      role: applicationUserState.role,

      approvedAt:
        applicationUserState.approvedAt,

      rejectedAt:
        applicationUserState.rejectedAt,

      rejectionReason:
        applicationUserState.rejectionReason,

      suspendedAt:
        applicationUserState.suspendedAt,

      suspensionReason:
        applicationUserState.suspensionReason,

      updatedAt:
        applicationUserState.updatedAt,
    })
    .from(applicationUserState)
    .innerJoin(
      user,
      eq(
        applicationUserState.userId,
        user.id,
      ),
    )
    .orderBy(
      asc(applicationUserState.status),
      asc(user.createdAt),
    )
    .limit(100);

  return {
    ...context,
    accounts,
  };
}
