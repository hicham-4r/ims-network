import { and, eq, exists, isNull } from "drizzle-orm";

import type { requireActiveMember } from "@/server/account-state";
import { db } from "@/server/db";
import { nextProfileUpdatedAt } from "@/server/profile/revision";
import { applicationUserState, profiles } from "@/server/db/schema";

import { prepareAvatarImage } from "./validation";
import {
  deletePrivateAvatar,
  uploadPrivateAvatar,
} from "./storage";

type ActiveMember = Awaited<ReturnType<typeof requireActiveMember>>;

export class AvatarConflictError extends Error {
  constructor() {
    super("Your profile changed. Please try uploading again.");
    this.name = "AvatarConflictError";
  }
}

async function cleanupAvatar(pathname: string) {
  try {
    await deletePrivateAvatar(pathname);
  } catch {
    // Cleanup failures must not corrupt the committed profile.
    // A future maintenance task can remove abandoned assets.
    console.warn("Avatar storage cleanup was unsuccessful.");
  }
}

export async function replaceOwnAvatar(
  file: unknown,
  member: ActiveMember,
) {
  const processed = await prepareAvatarImage(file);

  const userId = member.session.user.id;
  const previousPath = member.profile.avatarUrl ?? null;

  let newPath: string | null = null;

  try {
    newPath = await uploadPrivateAvatar(processed);

    const expectedAvatar = previousPath === null
      ? isNull(profiles.avatarUrl)
      : eq(profiles.avatarUrl, previousPath);

    const [updated] = await db
      .update(profiles)
      .set({
        avatarUrl: newPath,
        updatedAt: nextProfileUpdatedAt,
      })
      .where(
        and(
          eq(profiles.userId, userId),
          expectedAvatar,
        exists(
          db
            .select({ userId: applicationUserState.userId })
            .from(applicationUserState)
            .where(
              and(
                eq(applicationUserState.userId, userId),
                eq(applicationUserState.status, "ACTIVE"),
              ),
            ),
        ),
        ),
      )
      .returning({
        userId: profiles.userId,
      });

    if (!updated) {
      throw new AvatarConflictError();
    }
  } catch (error) {
    if (newPath) {
      await cleanupAvatar(newPath);
    }

    throw error;
  }

  // Delete the previous file only after the DB update succeeds.
  if (previousPath && previousPath !== newPath) {
    await cleanupAvatar(previousPath);
  }

  return { success: true };
}
