import assert from "node:assert/strict";

import {
  loadCachedMemberDetail,
  memberCacheKey,
  type PublicMemberProfile,
} from "../src/server/members/detail-cache";

import type {
  CacheBackend,
} from "../src/server/redis/cache-core";

async function main() {
  const entries = new Map<string, unknown>();
  let reads = 0;
  let writes = 0;
  let dbLoads = 0;

  const backend: CacheBackend = {
    async get<T>(key: string) {
      reads++;
      return (entries.get(key) as T | undefined) ?? null;
    },

    async set(key, value, options) {
      assert.equal(options.ex, 60);
      writes++;
      entries.set(key, value);
      return "OK";
    },

    async del(key) {
      return entries.delete(key) ? 1 : 0;
    },
  };

  const keyPrefix = "ims-network:v1:development";

  const snapshot = {
    userId: "alumnus-a",
    avatarUrl: "private-avatar-path",
    updatedAt: new Date("2026-11-05T02:00:00Z"),
  };

  const profile: PublicMemberProfile = {
    userId: "alumnus-a",
    displayName: "Alumni Test",
    program: "IMS",
    graduationYear: 2024,
    bio: null,
  };

  const options = {
    userId: "alumnus-a",
    keyPrefix,
    backend,
    loadActiveSnapshot: async () => snapshot,
    loadPublicSnapshot: async () => {
      dbLoads++;
      return profile;
    },
  };

  // Test 1: Inactive target cannot access Redis.
  const inactive = await loadCachedMemberDetail({
    ...options,
    loadActiveSnapshot: async () => null,
    loadPublicSnapshot: async () => {
      throw new Error("Unauthorized DB load");
    },
  });

  assert.equal(inactive, null);
  assert.equal(reads, 0);
  assert.equal(writes, 0);
  console.log("Inactive target denied before Redis: PASS");

  // Test 2: Snapshot identity must match the target.
  const wrongTarget = await loadCachedMemberDetail({
    ...options,
    userId: "alumnus-b",
  });

  assert.equal(wrongTarget, null);
  assert.equal(reads, 0);
  console.log("Cross-member snapshot mismatch denied: PASS");

  // Test 3: Missing profiles cannot be negatively cached.
  const missing = await loadCachedMemberDetail({
    ...options,
    loadPublicSnapshot: async () => null,
  });

  assert.equal(missing, null);
  assert.equal(entries.size, 0);
  assert.equal(writes, 0);
  console.log("Missing profile not cached: PASS");

  // Test 4: Authorized cold and warm reads.
  const cold = await loadCachedMemberDetail(options);
  assert.equal(cold?.userId, "alumnus-a");
  assert.equal(dbLoads, 1);

  const warm = await loadCachedMemberDetail(options);
  assert.equal(warm?.displayName, "Alumni Test");
  assert.equal(dbLoads, 1);
  console.log("Authorized cold/warm reads: PASS");

  // Test 5: Suspending a cached target denies access.
  const readsBeforeSuspension = reads;

  const suspended = await loadCachedMemberDetail({
    ...options,
    loadActiveSnapshot: async () => null,
  });

  assert.equal(suspended, null);
  assert.equal(reads, readsBeforeSuspension);
  console.log("Cached suspended member denied: PASS");

  // Test 6: Private avatar paths stay outside Redis.
  const cacheKey = memberCacheKey(
    keyPrefix,
    snapshot.userId,
    snapshot.updatedAt,
  );

  const cached = entries.get(cacheKey);

  assert.ok(cached && typeof cached === "object");
  assert.equal(Object.hasOwn(cached, "avatarUrl"), false);
  console.log("Private avatar path excluded: PASS");

  // Test 7: Cache keys isolate members and namespaces.
  assert.notEqual(
    memberCacheKey(keyPrefix, "alumnus-a", snapshot.updatedAt),
    memberCacheKey(keyPrefix, "alumnus-b", snapshot.updatedAt),
  );

  assert.notEqual(
    memberCacheKey(
      "ims-network:v1:preview",
      "alumnus-a",
      snapshot.updatedAt,
    ),
    cacheKey,
  );

  assert.notEqual(
    memberCacheKey(
      keyPrefix,
      "alumnus-a",
      new Date(snapshot.updatedAt.getTime() + 1),
    ),
    cacheKey,
  );

  console.log("Cache key separation and revisions: PASS");

  // Test 8: A public-data identity mismatch is rejected.
  const mismatchedProfile = await loadCachedMemberDetail({
    ...options,
    backend: null,
    loadPublicSnapshot: async () => ({
      ...profile,
      userId: "alumnus-b",
    }),
  });

  assert.equal(mismatchedProfile, null);
  console.log("Cross-member payload mismatch denied: PASS");

  // Test 9: Redis outage falls back to the database.
  const offlineBackend: CacheBackend = {
    async get() {
      throw new Error("Redis offline");
    },
    async set() {
      throw new Error("Redis offline");
    },
    async del() {
      throw new Error("Redis offline");
    },
  };

  const fallback = await loadCachedMemberDetail({
    ...options,
    backend: offlineBackend,
  });

  assert.equal(fallback?.userId, "alumnus-a");
  console.log("Redis outage fallback: PASS");

  // Test 10: Real database failures must propagate.
  await assert.rejects(
    loadCachedMemberDetail({
      ...options,
      backend: null,
      loadPublicSnapshot: async () => {
        throw new Error("PostgreSQL unavailable");
      },
    }),
    /PostgreSQL unavailable/,
  );

  console.log("Database failures not hidden: PASS");
  console.log("ALL PHASE 13 SECURITY TESTS PASSED");
}

main().catch((error: unknown) => {
  console.error(
    "Security regression failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
});