import { and, eq } from "drizzle-orm";

import { requireActiveMember } from "@/server/account-state";
import { db } from "@/server/db";
import {
  applicationUserState,
  profiles,
} from "@/server/db/schema";

export async function getActiveMemberById(userId: string) {
  // Always authorize the viewer before accessing member data.
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
      userId: profiles.userId,
      displayName: profiles.displayName,
      program: profiles.program,
      graduationYear: profiles.graduationYear,
      bio: profiles.bio,
      avatarUrl: profiles.avatarUrl,
      avatarUpdatedAt: profiles.updatedAt,
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

  return member ?? null;
}
