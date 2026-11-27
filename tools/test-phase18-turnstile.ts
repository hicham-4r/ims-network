import assert from "node:assert/strict";
import { resolveTurnstileConfig, getTurnstileAction, isCanonicalAuthPost, readCaptchaToken, verifyTurnstile } from "../src/server/auth/turnstile-core";

async function main() {
  const url = "https://ims-network.vercel.app";
  const site = "1x00000000000000000000AA";
  const secret = "1x0000000000000000000000000000000AA";
  const real = resolveTurnstileConfig({ NODE_ENV: "production", VERCEL_ENV: "production", TURNSTILE_SECRET_KEY: "real-secret-example" }, "real-site-example", url);
  assert.equal(real.mode, "real");
  assert.equal(resolveTurnstileConfig({ NODE_ENV: "development" }, undefined, url).mode, "disabled");
  assert.equal(resolveTurnstileConfig({ NODE_ENV: "production" }, undefined, url).mode, "invalid");
  assert.equal(resolveTurnstileConfig({ VERCEL_ENV: "preview", NODE_ENV: "production" }, undefined, url).mode, "invalid");
  for (const flag of ["true", "false", undefined]) {
    assert.equal(resolveTurnstileConfig({ NODE_ENV: "production", VERCEL_ENV: "production", IMS_TURNSTILE_TEST_MODE: flag, TURNSTILE_SECRET_KEY: secret }, site, url).mode, "invalid");
  }
  const test = resolveTurnstileConfig({ NODE_ENV: "production", VERCEL_ENV: "preview", IMS_TURNSTILE_TEST_MODE: "true", TURNSTILE_SECRET_KEY: secret }, site, url);
  assert.equal(test.mode, "test");
  assert.equal(resolveTurnstileConfig({ NODE_ENV: "production", VERCEL_ENV: "preview", TURNSTILE_SECRET_KEY: secret }, site, url).mode, "invalid");
  assert.equal(resolveTurnstileConfig({ NODE_ENV: "production", VERCEL_ENV: "preview", IMS_TURNSTILE_TEST_MODE: "true", TURNSTILE_SECRET_KEY: "real-secret" }, site, url).mode, "invalid");
  const req = (path: string, token?: string) => new Request(url + path, { method: "POST", headers: token ? { "x-captcha-response": token } : {} });
  assert.equal(getTurnstileAction(req("/api/auth/sign-up/email")), "signup");
  assert.equal(getTurnstileAction(req("/api/auth/request-password-reset")), "recovery");
  assert.equal(getTurnstileAction(req("/api/auth/sign-in/email")), null);
  for (const path of ["/api/auth/sign-up/email/", "/api/auth/sign-up//email", "/api/auth/sign%2dup/email", "/api/auth/SIGN-UP/email", "/api/auth/sign-up/email;test"]) assert.equal(isCanonicalAuthPost(req(path)), false);
  assert.equal(isCanonicalAuthPost(req("/api/auth/sign-up/email")), true);
  assert.equal(readCaptchaToken(req("/api/auth/sign-up/email", "a".repeat(2049))), null);
  assert.equal(readCaptchaToken(req("/api/auth/sign-up/email", "a,b")), null);
  assert.equal(readCaptchaToken(req("/api/auth/sign-up/email", "test-token_123")), "test-token_123");
  let calls = 0;
  const fake = (value: unknown, status = 200): typeof fetch => async (input, options) => {
    calls++;
    assert.equal(input, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.equal(options?.method, "POST"); assert.equal(options?.cache, "no-store"); assert.equal(options?.redirect, "error");
    return Response.json(value, { status });
  };
  assert.equal((await verifyTurnstile(real, "signup", null, fake({ success: true })))?.status, 400);
  assert.equal(calls, 0);
  assert.equal(await verifyTurnstile(real, "signup", "test", fake({ success: true, hostname: "ims-network.vercel.app", action: "signup" })), null);
  for (const result of [{ success: false }, { success: true }, { success: true, hostname: "wrong.example", action: "signup" }, { success: true, hostname: "ims-network.vercel.app", action: "recovery" }, { success: "true" }]) {
    assert.equal((await verifyTurnstile(real, "signup", "test", fake(result)))?.status, 403);
  }
  assert.equal((await verifyTurnstile(real, "signup", "test", fake({}, 500)))?.status, 503);
  assert.equal((await verifyTurnstile(real, "signup", "test", async () => { throw new Error("provider unavailable"); }))?.status, 503);
  assert.equal(await verifyTurnstile(test, "signup", "test", fake({ success: true, hostname: "example.com" })), null);
  assert.equal((await verifyTurnstile(test, "signup", "test", fake({ success: false, "error-codes": ["timeout-or-duplicate"] })))?.status, 403);
  console.log("PHASE 18 TURNSTILE OFFLINE: PASS");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
