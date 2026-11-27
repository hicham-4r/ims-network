import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  applicationUserState,
  session as sessionTable,
} from "@/server/db/schema";

import {
  checkSocketSessionAccess,
  type SocketAccessRecord,
  type SocketSessionIdentity,
} from "./socket-access-core";

/**
 * One read-only, parameterized query. The session row disappears on logout
 * or revocation; ACTIVE state is checked at the time of delivery.
 *
 * Do not cache positive results beyond a concurrent notification burst.
 */
async function loadSocketAccessRecord(
  identity: SocketSessionIdentity,
): Promise<SocketAccessRecord | null> {
  const rows = await db
    .select({
      userId: sessionTable.userId,
      sessionId: sessionTable.id,
      expiresAt: sessionTable.expiresAt,
      accountStatus: applicationUserState.status,
    })
    .from(sessionTable)
    .innerJoin(
      applicationUserState,
      eq(applicationUserState.userId, sessionTable.userId),
    )
    .where(and(
      eq(sessionTable.id, identity.sessionId),
      eq(sessionTable.userId, identity.userId),
    ))
    .limit(1);

  return rows[0] ?? null;
}

/** Fail closed on missing/expired/revoked session, inactive user, DB outage. */
export async function verifySocketSessionAccess(
  identity: SocketSessionIdentity,
): Promise<boolean> {
  return checkSocketSessionAccess(identity, loadSocketAccessRecord);
}
