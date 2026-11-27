import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  profiles,
} from "@/server/db/schema";

import {
  normalizeProfileText,
  normalizeSearchText,
} from "./normalize";

type UserIdentity = {
  id: string;
  name: string;
};

export async function ensureUserProfile(
  user: UserIdentity,
) {
  const load = async () => {
    const [profile] = await db.select().from(profiles)
      .where(eq(profiles.userId, user.id)).limit(1);
    return profile;
  };
  const existing = await load();
  if (existing) return existing;

  const displayName =
    normalizeProfileText(user.name);

  if (displayName.length < 2) {
    throw new Error(
      "User name is not valid for profile creation.",
    );
  }

  const [createdProfile] = await db
    .insert(profiles)
    .values({
      userId: user.id,
      displayName,
      displayNameSearch:
        normalizeSearchText(displayName),
    })
    .onConflictDoNothing({
      target: profiles.userId,
    })
    .returning();

  if (createdProfile) {
    return createdProfile;
  }

  const existingProfile = await load();

  if (!existingProfile) {
    throw new Error(
      "Member profile could not be loaded.",
    );
  }

  return existingProfile;
}
