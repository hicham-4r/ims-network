import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { Ratelimit } from "@upstash/ratelimit";
import { config } from "dotenv";

import {
  evaluateAuthRequestGate,
} from "../src/server/auth/auth-gate-core";
import {
  createRedisRuntime,
} from "../src/server/redis/config";
import {
  evaluateRateLimit,
} from "../src/server/redis/rate-limit-core";

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
    throw new Error("Development Redis required.");
  }

  const redis = runtime.redis;

  // Use an isolated namespace with expiring test counters.
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(2, "1 m"),
    prefix:
      `${runtime.keyPrefix}:test:auth-http:${randomUUID()}`,
    analytics: false,
    ephemeralCache: false,
    timeout: 2000,
  });

  const request = new Request(
    "https://example.test/api/auth/sign-in/email",
    {
      method: "POST",
      headers: {
        "x-vercel-forwarded-for": "203.0.113.7",
      },
    },
  );

  let checks = 0;

  const check = async (
    kind: "auth" | "signup" | "recovery",
    subject: string,
    policy: "deny",
  ) => {
    assert.equal(kind, "auth");
    assert.equal(
      subject,
      "203.0.113.7:/api/auth/sign-in/email",
    );
    assert.equal(policy, "deny");

    checks++;

    return evaluateRateLimit(
      {
        limit: (identifier) => limiter.limit(identifier),
      },
      subject,
      policy,
    );
  };

  const first = await evaluateAuthRequestGate(
    request,
    "preview",
    check,
  );

  assert.equal(first, null);
  console.log("First permitted request: PASS");

  const second = await evaluateAuthRequestGate(
    request,
    "preview",
    check,
  );

  assert.equal(second, null);
  console.log("Second permitted request: PASS");

  const third = await evaluateAuthRequestGate(
    request,
    "preview",
    check,
  );

  assert.equal(third?.status, 429);

  const retryAfter = Number(
    third?.headers.get("Retry-After"),
  );

  assert.ok(
    Number.isInteger(retryAfter) &&
    retryAfter >= 1 &&
    retryAfter <= 60,
  );

  const body = await third!.json();
  assert.equal(body.code, "RATE_LIMITED");

  assert.equal(
    third?.headers.get("Cache-Control"),
    "no-store",
  );

  assert.equal(checks, 3);

  console.log("Live Redis HTTP 429 decision: PASS");
  console.log("Retry-After response: PASS");

  const outage = await evaluateAuthRequestGate(
    request,
    "preview",
    async () => ({
      allowed: false,
      reason: "unavailable",
      retryAfterSeconds: null,
    }),
  );

  assert.equal(outage?.status, 503);
  console.log("Redis outage HTTP 503: PASS");

  const missingIp = await evaluateAuthRequestGate(
    new Request(
      "https://example.test/api/auth/sign-in/email",
      { method: "POST" },
    ),
    "preview",
    async () => {
      throw new Error("Unexpected Redis check.");
    },
  );

  assert.equal(missingIp?.status, 503);
  console.log("Missing trusted IP: PASS");

  const sessionRequest = await evaluateAuthRequestGate(
    new Request(
      "https://example.test/api/auth/get-session",
      { method: "GET" },
    ),
    "preview",
    async () => {
      throw new Error("GET must not be rate limited.");
    },
  );

  assert.equal(sessionRequest, null);
  console.log("Session GET unaffected: PASS");

  console.log("ALL LIVE AUTH GATE TESTS PASSED");
  console.log("Temporary test counters expire automatically.");
}

main().catch((error: unknown) => {
  console.error(
    "Live auth gate test failed:",
    error instanceof Error
      ? error.message
      : "Unknown error",
  );

  process.exitCode = 1;
});