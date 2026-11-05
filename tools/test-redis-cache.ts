import assert from "node:assert/strict";

import { z } from "zod";

import {
  invalidateCachedKey,
  readThroughCache,
  type CacheBackend,
} from "../src/server/redis/cache-core";

async function main() {
  const entries = new Map<string, unknown>();

  let dbReads = 0;
  let cacheWrites = 0;
  let cacheReads = 0;

  const backend: CacheBackend = {
    async get<T>(key: string) {
      cacheReads++;
      return (entries.get(key) as T | undefined) ?? null;
    },

    async set(key, value, options) {
      assert.equal(options.ex, 60);
      cacheWrites++;
      entries.set(key, value);
      return "OK";
    },

    async del(key) {
      return entries.delete(key) ? 1 : 0;
    },
  };

  const schema = z.object({
    id: z.string(),
    displayName: z.string(),
  });

  const key =
    "ims-network:v1:development:cache:test-member";

  const loader = async () => {
    dbReads++;
    return {
      id: "test-member",
      displayName: "Test Alumni",
    };
  };

  const options = {
    backend,
    key,
    ttlSeconds: 60,
    schema,
    loader,
  };

  const cold = await readThroughCache(options);

  assert.equal(cold.displayName, "Test Alumni");
  assert.equal(dbReads, 1);
  assert.equal(cacheWrites, 1);
  console.log("Cold cache: PASS");

  const warm = await readThroughCache(options);

  assert.equal(warm.displayName, "Test Alumni");
  assert.equal(dbReads, 1);
  assert.equal(cacheReads, 2);
  console.log("Warm cache: PASS");

  assert.equal(
    await invalidateCachedKey(backend, key),
    true,
  );

  await readThroughCache(options);

  assert.equal(dbReads, 2);
  console.log("Cache invalidation: PASS");

  entries.set(key, {
    id: 123,
    displayName: null,
  });

  const validated = await readThroughCache(options);

  assert.equal(validated.id, "test-member");
  assert.equal(dbReads, 3);
  console.log("Invalid cached data: PASS");

  const offlineBackend: CacheBackend = {
    async get() {
      throw new Error("Redis unavailable");
    },

    async set() {
      throw new Error("Redis unavailable");
    },

    async del() {
      throw new Error("Redis unavailable");
    },
  };

  const fallback = await readThroughCache({
    ...options,
    backend: offlineBackend,
  });

  assert.equal(fallback.id, "test-member");
  assert.equal(dbReads, 4);

  assert.equal(
    await invalidateCachedKey(offlineBackend, key),
    false,
  );

  console.log("Redis outage fallback: PASS");

  const disabled = await readThroughCache({
    ...options,
    backend: null,
  });

  assert.equal(disabled.id, "test-member");
  assert.equal(dbReads, 5);
  console.log("Redis disabled fallback: PASS");

  await assert.rejects(
    readThroughCache({
      ...options,
      backend: null,
      loader: async () => {
        throw new Error("PostgreSQL unavailable");
      },
    }),
    /PostgreSQL unavailable/,
  );

  console.log("Authoritative read failure: PASS");
  console.log("ALL CACHE FOUNDATION TESTS PASSED");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});