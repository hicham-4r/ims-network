import assert from "node:assert/strict";

import {
  evaluateAuthRequestGate,
  getAuthLimitKind,
  getTrustedAuthSubject,
} from "../src/server/auth/auth-gate-core";

function makeRequest(
  path: string,
  method = "POST",
  headers?: HeadersInit,
) {
  return new Request(
    `https://example.test${path}`,
    { method, headers },
  );
}

async function main() {
  assert.equal(
    getAuthLimitKind(
      makeRequest("/api/auth/sign-in/email"),
    ),
    "auth",
  );

  assert.equal(
    getAuthLimitKind(
      makeRequest("/api/auth/sign-up/email"),
    ),
    "signup",
  );

  assert.equal(
    getAuthLimitKind(
      makeRequest("/api/auth/request-password-reset"),
    ),
    "recovery",
  );

  assert.equal(
    getAuthLimitKind(
      makeRequest("/api/auth/send-verification-email"),
    ),
    null,
  );

  assert.equal(
    getAuthLimitKind(
      makeRequest("/api/auth/get-session", "GET"),
    ),
    null,
  );

  console.log("Endpoint classification: PASS");

  const forgedLocal = makeRequest(
    "/api/auth/sign-in/email",
    "POST",
    {
      "x-forwarded-for": "203.0.113.50",
      "x-vercel-forwarded-for": "203.0.113.51",
    },
  );

  assert.equal(
    getTrustedAuthSubject(forgedLocal, undefined),
    "local-development",
  );

  console.log("Untrusted local headers ignored: PASS");

  const trusted = makeRequest(
    "/api/auth/sign-in/email",
    "POST",
    {
      "x-vercel-forwarded-for": "203.0.113.60",
    },
  );

  assert.equal(
    getTrustedAuthSubject(trusted, "preview"),
    "203.0.113.60",
  );

  console.log("Vercel IP validation: PASS");

  const invalid = makeRequest(
    "/api/auth/sign-in/email",
    "POST",
    {
      "x-vercel-forwarded-for": "203.0.113.1, 198.51.100.1",
    },
  );

  assert.equal(
    getTrustedAuthSubject(invalid, "preview"),
    null,
  );

  console.log("Malformed IP rejected: PASS");

  const allowed = await evaluateAuthRequestGate(
    trusted,
    "preview",
    async (kind, subject, policy) => {
      assert.equal(kind, "auth");
      assert.equal(
        subject,
        "203.0.113.60:/api/auth/sign-in/email",
      );
      assert.equal(policy, "deny");

      return {
        allowed: true,
        reason: "allowed",
        retryAfterSeconds: 0,
      };
    },
  );

  assert.equal(allowed, null);
  console.log("Allowed authentication: PASS");

  const blocked = await evaluateAuthRequestGate(
    trusted,
    "preview",
    async () => ({
      allowed: false,
      reason: "limited",
      retryAfterSeconds: 45,
    }),
  );

  assert.equal(blocked?.status, 429);
  assert.equal(
    blocked.headers.get("Retry-After"),
    "45",
  );

  const blockedBody = await blocked.json();

  assert.equal(blockedBody.code, "RATE_LIMITED");

  console.log("HTTP 429 and Retry-After: PASS");

  const unavailable = await evaluateAuthRequestGate(
    trusted,
    "preview",
    async () => ({
      allowed: false,
      reason: "unavailable",
      retryAfterSeconds: null,
    }),
  );

  assert.equal(unavailable?.status, 503);
  console.log("Redis outage fail-closed: PASS");

  const invalidIp = await evaluateAuthRequestGate(
    invalid,
    "preview",
    async () => {
      throw new Error("Should not call Redis");
    },
  );

  assert.equal(invalidIp?.status, 503);
  console.log("Missing trusted IP rejected: PASS");

  const untouched = await evaluateAuthRequestGate(
    makeRequest("/api/auth/get-session", "GET"),
    "preview",
    async () => {
      throw new Error("Unexpected rate-limit check");
    },
  );

  assert.equal(untouched, null);
  console.log("Unprotected routes unchanged: PASS");

  console.log("ALL AUTH GATE TESTS PASSED");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});