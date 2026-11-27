import { and, eq, exists } from "drizzle-orm";

import {
  requireActiveMember,
} from "@/server/account-state";
import { db } from "@/server/db";
import { nextProfileUpdatedAt } from "@/server/profile/revision";
import { checkRateLimit } from "@/server/redis/rate-limit";
import {
  applicationUserState,
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
import { getProfileEditRateLimitMessage } from "./profile-edit-rate-limit";

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

  const rateLimit = await checkRateLimit(
    "profileEdit",
    session.user.id,
    "allow",
  );

  const rateLimitMessage =
    getProfileEditRateLimitMessage(rateLimit);

  if (rateLimitMessage) {
    throw new ProfileUpdateError(rateLimitMessage);
  }

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
      jobTitle: normalizeOptionalProfileText(parsed.data.jobTitle),
      company: normalizeOptionalProfileText(parsed.data.company),
      location: normalizeOptionalProfileText(parsed.data.location),
      skills: normalizeOptionalProfileText(parsed.data.skills),
      mentorship: normalizeOptionalProfileText(parsed.data.mentorship),

      updatedAt: nextProfileUpdatedAt,
    })
    .where(
      and(
        eq(profiles.userId, session.user.id),
        exists(
          db
            .select({
              userId: applicationUserState.userId,
            })
            .from(applicationUserState)
            .where(
              and(
                eq(
                  applicationUserState.userId,
                  session.user.id,
                ),
                eq(
                  applicationUserState.status,
                  "ACTIVE",
                ),
              ),
            ),
        ),
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
