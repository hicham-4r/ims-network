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
  let statusChecks = 0;
  let active = true;
  let revision = new Date("2026-11-05T00:00:00Z");

  let profile: PublicMemberProfile = {
    userId: "alumnus-1",
    displayName: "Test Alumni",
    program: "IMS",
    graduationYear: 2024,
    bio: "Test profile",
  };

  const backend: CacheBackend = {
    async get<T>(key: string) {
      return (entries.get(key) as T | undefined) ?? null;
    },
    async set(key, value, options) {
      assert.equal(options.ex, 60);
      entries.set(key, value);
      return "OK";
    },
    async del(key) {
      return entries.delete(key) ? 1 : 0;
    },
  };

  const keyPrefix = "ims-network:v1:development";

  const options = {
    userId: "alumnus-1",
    keyPrefix,
    backend,
    loadActiveSnapshot: async () => {
      statusChecks++;
      return active
        ? {
            userId: "alumnus-1",
            avatarUrl: "private-avatar-path",
            updatedAt: revision,
          }
        : null;
    },
    loadPublicSnapshot: async () => {
      reads++;
      return profile;
    },
  };

  const cold = await loadCachedMemberDetail(options);
  assert.equal(cold?.displayName, "Test Alumni");
  assert.equal(reads, 1);
  console.log("Cold member cache: PASS");

  const warm = await loadCachedMemberDetail(options);
  assert.equal(warm?.displayName, "Test Alumni");
  assert.equal(reads, 1);
  assert.equal(statusChecks, 2);
  console.log("Warm member cache: PASS");

  for (const value of entries.values()) {
    assert.equal(
      Object.hasOwn(value as object, "avatarUrl"),
      false,
    );
  }
  console.log("Private avatar path excluded: PASS");

  active = false;
  const suspended = await loadCachedMemberDetail(options);
  assert.equal(suspended, null);
  assert.equal(reads, 1);
  console.log("Suspended target denied: PASS");

  active = true;
  revision = new Date("2026-11-05T00:01:00Z");
  profile = {
    ...profile,
    displayName: "Updated Alumni",
  };

  const updated = await loadCachedMemberDetail(options);
  assert.equal(updated?.displayName, "Updated Alumni");
  assert.equal(reads, 2);
  console.log("Profile revision invalidation: PASS");

  const latestKey = memberCacheKey(
    keyPrefix,
    "alumnus-1",
    revision,
  );

  assert.equal(entries.has(latestKey), true);

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

  assert.equal(fallback?.displayName, "Updated Alumni");
  assert.equal(reads, 3);
  console.log("Redis outage fallback: PASS");

  console.log("ALL MEMBER CACHE TESTS PASSED");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});