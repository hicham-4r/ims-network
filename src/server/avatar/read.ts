import { and, eq } from "drizzle-orm";

import { requireActiveMember } from "@/server/account-state";
import { db } from "@/server/db";
import {
  applicationUserState,
  profiles,
} from "@/server/db/schema";

import { isManagedAvatarPath } from "./storage";

export async function getVisibleAvatarPath(
  userId: string,
): Promise<string | null> {
  // Always authorize the viewer first.
  await requireActiveMember();

  if (
    typeof userId !== "string" ||
    userId.length < 1 ||
    userId.length > 255
  ) {
    return null;
  }

  const [member] = await db
    .select({
      avatarPath: profiles.avatarUrl,
    })
    .from(profiles)
    .innerJoin(
      applicationUserState,
      eq(
        applicationUserState.userId,
        profiles.userId,
      ),
    )
    .where(
      and(
        eq(profiles.userId, userId),
        eq(applicationUserState.status, "ACTIVE"),
      ),
    )
    .limit(1);

  const pathname = member?.avatarPath;

  return isManagedAvatarPath(pathname)
    ? pathname
    : null;
}
