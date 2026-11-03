import { eq } from "drizzle-orm";

import {
  requireActiveMember,
} from "@/server/account-state";
import { db } from "@/server/db";
import {
  profiles,
} from "@/server/db/schema";

import {
  normalizeOptionalProfileText,
  normalizeProfileText,
  normalizeSearchText,
} from "./normalize";
import {
  profileUpdateSchema,
} from "./validation";

export class ProfileUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileUpdateError";
  }
}

export async function getOwnProfile() {
  const {
    profile,
  } = await requireActiveMember();

  return profile;
}

export async function updateOwnProfile(
  input: unknown,
) {
  const parsed =
    profileUpdateSchema.safeParse(input);

  if (!parsed.success) {
    throw new ProfileUpdateError(
      "Invalid profile information.",
    );
  }

  const {
    session,
  } = await requireActiveMember();

  const displayName =
    normalizeProfileText(
      parsed.data.displayName,
    );

  const program =
    normalizeOptionalProfileText(
      parsed.data.program,
    );

  const bio =
    normalizeOptionalProfileText(
      parsed.data.bio,
    );

  const [updatedProfile] = await db
    .update(profiles)
    .set({
      displayName,

      displayNameSearch:
        normalizeSearchText(displayName),

      program,

      programSearch:
        program
          ? normalizeSearchText(program)
          : null,

      graduationYear:
        parsed.data.graduationYear,

      bio,

      updatedAt: new Date(),
    })
    .where(
      eq(
        profiles.userId,
        session.user.id,
      ),
    )
    .returning();

  if (!updatedProfile) {
    throw new ProfileUpdateError(
      "Profile could not be updated.",
    );
  }

  return updatedProfile;
}
