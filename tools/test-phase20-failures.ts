import assert from "node:assert/strict";
import { createFailureReporter, type FailureEvent } from "../src/server/observability/safe-events";
import { evaluateRateLimit } from "../src/server/redis/rate-limit-core";
import { emitCommittedMessageNotice } from "../src/server/messaging/message-notice-core";
import { resolveTurnstileConfig, verifyTurnstile } from "../src/server/auth/turnstile-core";

async function main() {
  let now = 1;
  const lines: string[] = [];
  const report = createFailureReporter(line => lines.push(line), () => now);
  for (let i = 0; i < 1000; i++) report("rate_limit_unavailable");
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), { component: "ims-network", schema: 1, level: "warn", event: "rate_limit_unavailable" });
  report("fake-secret-or-user-id" as FailureEvent);
  assert.equal(lines.length, 1);
  report("relay_publish_failed");
  assert.equal(lines.length, 2);
  now += 59999; report("rate_limit_unavailable"); assert.equal(lines.length, 2);
  now += 1; report("rate_limit_unavailable"); assert.equal(lines.length, 3);
  assert.doesNotThrow(() => createFailureReporter(() => { throw new Error("sink failed"); })("maintenance_failed"));
  const unavailable = { async limit() { throw new Error("synthetic provider failure"); } };
  const timeout = { async limit() { return { success: true, reason: "timeout", reset: now }; } };
  for (const backend of [null, unavailable, timeout]) {
    assert.equal((await evaluateRateLimit(backend, "synthetic", "deny", now)).allowed, false);
    const decision = await evaluateRateLimit(backend, "synthetic", "allow", now);
    assert.equal(decision.allowed, true); assert.equal(decision.reason, "unavailable");
  }
  assert.equal(await emitCommittedMessageNotice({ insertedNewMessage: true, recipientUserId: "synthetic-user", messageId: "synthetic-message", originInstanceId: "synthetic-instance" }, async () => { throw new Error("synthetic Redis outage"); }), false);
  const config = resolveTurnstileConfig({ NODE_ENV: "production", VERCEL_ENV: "preview" }, undefined, "https://example.invalid");
  assert.equal(config.mode, "invalid");
  const result = await verifyTurnstile({ mode: "real", secret: "synthetic", hostname: "example.invalid" }, "signup", "synthetic-token", async () => { throw new Error("synthetic timeout"); });
  assert.equal(result?.status, 503);
  assert.equal((await result?.text())?.includes("synthetic"), false);
  console.log("PHASE 20A OFFLINE FAILURE BOUNDARIES: PASS");
}
void main().catch(() => { console.error("PHASE 20A OFFLINE FAILURE BOUNDARIES: FAIL"); process.exitCode = 1; });
