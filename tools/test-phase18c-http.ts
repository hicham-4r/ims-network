import assert from "node:assert/strict";
import { boundAuthPostBody, isSupportedAuthRequest, MAX_AUTH_BODY_BYTES, validateAuthPostHeaders } from "../src/server/auth/http-boundary";
import { getAuthLimitKind } from "../src/server/auth/auth-gate-core";

import { evaluateRateLimit } from "../src/server/redis/rate-limit-core";

const base = "https://ims.example.test";
function post(path: string, body: string | null = "{}", extra: HeadersInit = {}) {
  const headers = new Headers({ origin: base, "content-type": "application/json" });
  new Headers(extra).forEach((value, key) => headers.set(key, value));
  return new Request(base + path, { method: "POST", body, headers });
}
async function main() {
  for (const route of ["sign-in/email", "sign-up/email", "sign-out", "get-session", "request-password-reset", "reset-password"]) {
    assert.equal(isSupportedAuthRequest(post("/api/auth/" + route)), true);
  }
  for (const route of ["verify-password", "verify-email", "send-verification-email", "delete-user", "update-user", "sign-in/social", "sign-up/email/", "sign-up%2femail", "sign-up//email"]) {
    assert.equal(isSupportedAuthRequest(post("/api/auth/" + route)), false);
  }
  assert.equal(isSupportedAuthRequest(new Request(base + "/api/auth/get-session")), true);
  assert.equal(isSupportedAuthRequest(new Request(base + "/api/auth/reset-password/test-token?callbackURL=%2Freset-password")), true);
  assert.equal(isSupportedAuthRequest(new Request(base + "/api/auth/verify-email")), false);
  assert.equal(validateAuthPostHeaders(post("/api/auth/sign-in/email"), base), null);
  assert.equal(validateAuthPostHeaders(post("/api/auth/sign-in/email", "{}", { origin: "https://other.test" }), base)?.status, 403);
  assert.equal(validateAuthPostHeaders(new Request(base + "/api/auth/sign-in/email", { method: "POST", body: "{}" }), base)?.status, 403);
  assert.equal(validateAuthPostHeaders(post("/api/auth/sign-in/email", "{}", { "content-type": "text/plain" }), base)?.status, 415);
  assert.equal(validateAuthPostHeaders(post("/api/auth/sign-in/email", "{}", { "content-encoding": "gzip" }), base)?.status, 415);
  assert.equal(validateAuthPostHeaders(post("/api/auth/sign-in/email", "{}", { "content-length": "-1" }), base)?.status, 400);
  assert.equal(validateAuthPostHeaders(post("/api/auth/sign-in/email", "{}", { "content-length": String(MAX_AUTH_BODY_BYTES + 1) }), base)?.status, 413);
  assert.equal(validateAuthPostHeaders(post("/api/auth/sign-out", null), base), null);
  const ok = await boundAuthPostBody(post("/api/auth/sign-in/email", '{"email":"test@example.test"}'));
  assert.ok(ok instanceof Request);
  assert.equal(await ok.text(), '{"email":"test@example.test"}');
  const exact = await boundAuthPostBody(post("/api/auth/sign-in/email", "x".repeat(MAX_AUTH_BODY_BYTES)));
  assert.ok(exact instanceof Request);
  assert.equal((await exact.arrayBuffer()).byteLength, MAX_AUTH_BODY_BYTES);
  const oversized = await boundAuthPostBody(post("/api/auth/sign-in/email", "x".repeat(MAX_AUTH_BODY_BYTES + 1)));
  assert.ok(oversized instanceof Response);
  assert.equal(oversized.status, 413);
  const mismatch = await boundAuthPostBody(post("/api/auth/sign-in/email", "{}", { "content-length": "1" }));
  assert.ok(mismatch instanceof Response);
  assert.equal(mismatch.status, 400);
  assert.equal(getAuthLimitKind(post("/api/auth/reset-password")), "recovery");
  const now = 10000;
  assert.equal((await evaluateRateLimit(null, "test", "deny", now)).allowed, false);
  assert.equal((await evaluateRateLimit({ limit: async () => ({ success: true, reset: now, reason: "timeout" }) }, "test", "deny", now)).allowed, false);
  const limited = await evaluateRateLimit({ limit: async () => ({ success: false, reset: now + 3000 }) }, "test", "deny", now);
  assert.equal(limited.reason, "limited");
  assert.equal(limited.retryAfterSeconds, 3);
  assert.equal((await evaluateRateLimit({ limit: async () => ({ success: true, reset: now }) }, "test", "deny", now)).allowed, true);
  console.log("PHASE 18C AUTH HTTP BOUNDARY AND RATE-LIMIT CORE: PASS");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
