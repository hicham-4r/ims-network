import { createHash } from "node:crypto";
import { z } from "zod";

import {
  readThroughCache,
  type CacheBackend,
} from "../redis/cache-core";

const publicMemberSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  program: z.string().nullable(),
  graduationYear: z.number().int().nullable(),
  bio: z.string().nullable(),
}).strict();

export type PublicMemberProfile =
  z.infer<typeof publicMemberSchema>;

class MissingActiveMemberSnapshotError extends Error {}

export type ActiveProfileSnapshot = {
  userId: string;
  avatarUrl: string | null;
  updatedAt: Date;
};

type Options = {
  userId: string;
  keyPrefix: string;
  backend: CacheBackend | null;
  loadActiveSnapshot:
    () => Promise<ActiveProfileSnapshot | null>;
  loadPublicSnapshot:
    (snapshot: ActiveProfileSnapshot) =>
      Promise<PublicMemberProfile | null>;
};

export function memberCacheKey(
  keyPrefix: string,
  userId: string,
  updatedAt: Date,
) {
  const digest = createHash("sha256")
    .update(userId)
    .update("\0")
    .update(updatedAt.toISOString())
    .digest("hex");

  return `${keyPrefix}:cache:member:${digest}`;
}

export async function loadCachedMemberDetail({
  userId,
  keyPrefix,
  backend,
  loadActiveSnapshot,
  loadPublicSnapshot,
}: Options) {
  // A fresh database-backed ACTIVE check happens
  // before every cache lookup.
  const snapshot = await loadActiveSnapshot();

  if (!snapshot || snapshot.userId !== userId) {
    return null;
  }

  const key = memberCacheKey(
    keyPrefix,
    userId,
    snapshot.updatedAt,
  );

  let profile: PublicMemberProfile;

  try {
    profile = await readThroughCache({
      backend,
      key,
      ttlSeconds: 60,
      schema: publicMemberSchema,
      loader: async () => {
        const loaded = await loadPublicSnapshot(snapshot);

        if (!loaded) {
          throw new MissingActiveMemberSnapshotError();
        }

        return loaded;
      },
    });
  } catch (error) {
    if (error instanceof MissingActiveMemberSnapshotError) {
      return null;
    }

    throw error;
  }

  if (!profile || profile.userId !== userId) {
    return null;
  }

  // Private Blob path is never placed in Redis.
  return {
    ...profile,
    avatarUrl: snapshot.avatarUrl,
    avatarUpdatedAt: snapshot.updatedAt,
  };
}