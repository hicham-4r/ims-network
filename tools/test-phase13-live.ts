import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { Ratelimit } from "@upstash/ratelimit";
import { config } from "dotenv";
import { z } from "zod";

import {
  readThroughCache,
  invalidateCachedKey,
  type CacheBackend,
} from "../src/server/redis/cache-core";
import {
  createRedisRuntime,
} from "../src/server/redis/config";

config({
  path: ".env.local",
  quiet: true,
});

async function main() {
  if (
    process.env.NODE_ENV === "production" ||
    (
      process.env.VERCEL_ENV &&
      process.env.VERCEL_ENV !== "development"
    )
  ) {
    throw new Error("Development-only test.");
  }

  const runtime = createRedisRuntime(process.env);

  if (runtime.namespace !== "development" || !runtime.redis) {
    throw new Error("Development Redis is not configured.");
  }

  const redis = runtime.redis;

  // Namespace checks use no real Redis credentials.
  const preview = createRedisRuntime({
    NODE_ENV: "test",
    VERCEL_ENV: "preview",
  });

  const production = createRedisRuntime({
    NODE_ENV: "test",
    VERCEL_ENV: "production",
  });

  assert.notEqual(runtime.keyPrefix, preview.keyPrefix);
  assert.notEqual(preview.keyPrefix, production.keyPrefix);
  assert.equal(preview.redis, null);
  assert.equal(production.redis, null);

  console.log("Environment namespaces: PASS");

  const runId = randomUUID();
  const cacheKey =
    `${runtime.keyPrefix}:test:phase13:${runId}:cache`;

  const backend: CacheBackend = {
    get: <T>(key: string) => redis.get<T>(key),
    set: (key, value, options) =>
      redis.set(key, value, { ex: options.ex }),
    del: (key) => redis.del(key),
  };

  const schema = z.object({
    id: z.string(),
    revision: z.number().int(),
  }).strict();

  let loaderCalls = 0;
  let revision = 1;

  const options = {
    backend,
    key: cacheKey,
    ttlSeconds: 60,
    schema,
    loader: async () => {
      loaderCalls++;
      return {
        id: "test-alumnus",
        revision,
      };
    },
  };

  try {
    const cold = await readThroughCache(options);
    assert.equal(cold.revision, 1);
    assert.equal(loaderCalls, 1);
    console.log("Live cold cache: PASS");

    const warm = await readThroughCache(options);
    assert.equal(warm.revision, 1);
    assert.equal(loaderCalls, 1);
    console.log("Live warm cache: PASS");

    const ttl = await redis.ttl(cacheKey);
    assert.ok(ttl > 0 && ttl <= 60);
    console.log("Cache expiration: PASS");

    revision = 2;

    const invalidated = await invalidateCachedKey(
      backend,
      cacheKey,
    );

    assert.equal(invalidated, true);

    const refreshed = await readThroughCache(options);
    assert.equal(refreshed.revision, 2);
    assert.equal(loaderCalls, 2);

    console.log("Live cache invalidation: PASS");

    const offlineBackend: CacheBackend = {
      async get() {
        throw new Error("Simulated outage");
      },
      async set() {
        throw new Error("Simulated outage");
      },
      async del() {
        throw new Error("Simulated outage");
      },
    };

    revision = 3;

    const fallback = await readThroughCache({
      ...options,
      backend: offlineBackend,
    });

    assert.equal(fallback.revision, 3);
    assert.equal(loaderCalls, 3);
    console.log("Redis outage fallback: PASS");

    const makeLimiter = (namespace: string) =>
      new Ratelimit({
        redis,
        limiter: Ratelimit.fixedWindow(1, "1 m"),
        prefix:
          `${runtime.keyPrefix}:test:phase13:${runId}:${namespace}`,
        analytics: false,
        ephemeralCache: false,
        timeout: 2000,
      });

    const limiterA = makeLimiter("namespace-a");
    const limiterB = makeLimiter("namespace-b");

    const subject = "integration-test";

    const first = await limiterA.limit(subject);
    const second = await limiterA.limit(subject);
    const isolated = await limiterB.limit(subject);

    assert.notEqual(first.reason, "timeout");
    assert.notEqual(second.reason, "timeout");
    assert.notEqual(isolated.reason, "timeout");

    assert.equal(first.success, true);
    assert.equal(second.success, false);
    assert.equal(isolated.success, true);

    console.log("Live rate-limit enforcement: PASS");
    console.log("Rate-limit namespace separation: PASS");

    console.log("ALL LIVE PHASE 13 TESTS PASSED");
  } finally {
    await redis.del(cacheKey);
  }
}

main().catch((error: unknown) => {
  console.error(
    "Live Phase 13 test failed:",
    error instanceof Error ? error.name : "Unknown error",
  );

  process.exitCode = 1;
});