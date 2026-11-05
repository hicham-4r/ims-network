import { and, eq, sql } from "drizzle-orm";

import { requireActiveMember } from "@/server/account-state";
import { db } from "@/server/db";
import {
  applicationUserState,
  profiles,
} from "@/server/db/schema";
import {
  redis,
  redisKeyPrefix,
} from "@/server/redis/client";

import {
  loadCachedMemberDetail,
} from "./detail-cache";

export async function getActiveMemberById(userId: string) {
  // Authenticate and authorize the viewer first.
  await requireActiveMember();

  if (
    typeof userId !== "string" ||
    userId.length < 1 ||
    userId.length > 255
  ) {
    return null;
  }

  return loadCachedMemberDetail({
    userId,
    keyPrefix: redisKeyPrefix,
    backend: redis,

    loadActiveSnapshot: async () => {
      const [snapshot] = await db
        .select({
          userId: profiles.userId,
          avatarUrl: profiles.avatarUrl,
          updatedAt: profiles.updatedAt,
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

      return snapshot ?? null;
    },

    loadPublicSnapshot: async (snapshot) => {
      const [profile] = await db
        .select({
          userId: profiles.userId,
          displayName: profiles.displayName,
          program: profiles.program,
          graduationYear: profiles.graduationYear,
          bio: profiles.bio,
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
            eq(profiles.userId, snapshot.userId),
            // PostgreSQL may store microseconds, but JS Date
            // retains only milliseconds. Compare at the
            // precision used for the versioned cache key.
            sql<boolean>`
              date_trunc('milliseconds', ${profiles.updatedAt}) =
              ${snapshot.updatedAt.toISOString()}::timestamptz
            `,
            eq(applicationUserState.status, "ACTIVE"),
          ),
        )
        .limit(1);

      return profile ?? null;
    },
  });
}