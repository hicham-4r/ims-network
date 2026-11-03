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

  const [existingProfile] = await db
    .select()
    .from(profiles)
    .where(
      eq(
        profiles.userId,
        user.id,
      ),
    )
    .limit(1);

  if (!existingProfile) {
    throw new Error(
      "Member profile could not be loaded.",
    );
  }

  return existingProfile;
}
