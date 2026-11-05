import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { Ratelimit } from "@upstash/ratelimit";
import { config } from "dotenv";

import {
  evaluateRateLimit,
} from "../src/server/redis/rate-limit-core";

import {
  createRedisRuntime,
} from "../src/server/redis/config";

config({
  path: ".env.local",
  quiet: true,
});

async function main() {
  const now = Date.now();

  const allowed = await evaluateRateLimit(
    {
      async limit() {
        return {
          success: true,
          reset: now + 60000,
        };
      },
    },
    "test",
    "deny",
    now,
  );

  assert.equal(allowed.allowed, true);
  console.log("Allowed request: PASS");

  const blocked = await evaluateRateLimit(
    {
      async limit() {
        return {
          success: false,
          reset: now + 3000,
        };
      },
    },
    "test",
    "allow",
    now,
  );

  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "limited");
  assert.equal(blocked.retryAfterSeconds, 3);
  console.log("Exceeded limit: PASS");

  const timeoutBackend = {
    async limit() {
      return {
        success: true,
        reason: "timeout",
        reset: now,
      };
    },
  };

  const timeoutClosed = await evaluateRateLimit(
    timeoutBackend,
    "test",
    "deny",
    now,
  );

  assert.equal(timeoutClosed.allowed, false);
  assert.equal(timeoutClosed.reason, "unavailable");

  const timeoutOpen = await evaluateRateLimit(
    timeoutBackend,
    "test",
    "allow",
    now,
  );

  assert.equal(timeoutOpen.allowed, true);
  assert.equal(timeoutOpen.reason, "unavailable");
  console.log("Timeout policies: PASS");

  const failedBackend = {
    async limit(): Promise<never> {
      throw new Error("Redis unavailable");
    },
  };

  const failClosed = await evaluateRateLimit(
    failedBackend,
    "test",
    "deny",
  );

  assert.equal(failClosed.allowed, false);

  const failOpen = await evaluateRateLimit(
    failedBackend,
    "test",
    "allow",
  );

  assert.equal(failOpen.allowed, true);
  console.log("Outage policies: PASS");

  const missingBackend = await evaluateRateLimit(
    null,
    "test",
    "deny",
  );

  assert.equal(missingBackend.allowed, false);
  console.log("Missing Redis protection: PASS");

  const runtime = createRedisRuntime(process.env);

  if (runtime.namespace !== "development") {
    throw new Error(
      "Live test restricted to Development.",
    );
  }

  if (!runtime.redis) {
    throw new Error(
      "Development Redis is not configured.",
    );
  }

  const liveLimiter = new Ratelimit({
    redis: runtime.redis,
    limiter: Ratelimit.fixedWindow(2, "1 m"),
    prefix:
      `${runtime.keyPrefix}:ratelimit:smoke`,
    analytics: false,
    timeout: 1500,
    ephemeralCache: false,
  });

  const id = `smoke-${randomUUID()}`;

  const first = await liveLimiter.limit(id);
  const second = await liveLimiter.limit(id);
  const third = await liveLimiter.limit(id);

  assert.equal(first.reason, undefined);
  assert.equal(second.reason, undefined);
  assert.equal(third.reason, undefined);

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(third.success, false);

  console.log("Live Upstash rate limit: PASS");
  console.log("ALL RATE LIMIT TESTS PASSED");
  console.log(
    "Temporary test keys expire automatically.",
  );
}

main().catch((error: unknown) => {
  console.error(
    "Rate-limit test failed:",
    error instanceof Error
      ? error.message
      : "Unknown error",
  );

  process.exitCode = 1;
});