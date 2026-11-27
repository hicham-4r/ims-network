import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  appendRelayNoticeIfEnabled,
  isPreviewRelayPublishEnabled,
  type RelayPublishEnvironment,
  type StreamAppend,
} from "../src/server/realtime/stream-publisher-core";

async function main() {
  const enabled: RelayPublishEnvironment = {
    VERCEL_ENV: "production",
    BETTER_AUTH_URL: "https://example.org",
    IMS_PRODUCTION_REDIS_DEDICATED: "true",
    IMS_PRODUCTION_REDIS_ISOLATION_VERIFIED: "true",
    IMS_PRODUCTION_REALTIME_ENABLED: "true",
    IMS_PHASE16_WS_ENABLED: "true",
    IMS_PHASE16_RELAY_ENABLED: "true",
  };
  const input = {
    prefix: "ims-network:v1:production",
    secret: "test-secret-".repeat(4),
    recipientUserId: randomUUID(),
    eventId: randomUUID(),
    originInstanceId: randomUUID(),
  };
  let writes = 0;
  const append: StreamAppend = async () => {
    writes++;
    return "1000-0";
  };

  const disabled: RelayPublishEnvironment[] = [
    {},
    { ...enabled, VERCEL_ENV: "preview" },
    { ...enabled, IMS_PRODUCTION_REDIS_DEDICATED: "false" },
    { ...enabled, VERCEL_ENV: "development" },
    { ...enabled, VERCEL_ENV: undefined },
    { ...enabled, IMS_PHASE16_WS_ENABLED: "false" },
    { ...enabled, IMS_PHASE16_WS_ENABLED: undefined },
    { ...enabled, IMS_PHASE16_RELAY_ENABLED: "false" },
    { ...enabled, IMS_PHASE16_RELAY_ENABLED: undefined },
    { ...enabled, IMS_PHASE16_RELAY_ENABLED: "TRUE" },
  ];
  for (const env of disabled) {
    assert.equal(isPreviewRelayPublishEnabled(env), false);
    assert.equal(await appendRelayNoticeIfEnabled(env, append, input), false);
  }
  assert.equal(writes, 0);
  console.log("PASS: All disabled/Preview/development cases do zero XADD");

  // Environment can say Preview while the actual Redis namespace is not.
  assert.equal(
    await appendRelayNoticeIfEnabled(enabled, append, {
      ...input, prefix: "ims-network:v1:preview",
    }),
    false,
  );
  assert.equal(writes, 0);
  console.log("PASS: Refuses non-Production Redis namespace");

  assert.equal(await appendRelayNoticeIfEnabled(enabled, null, input), false);
  assert.equal(writes, 0);
  console.log("PASS: Missing Redis client does zero XADD");

  assert.equal(isPreviewRelayPublishEnabled(enabled), false);
  assert.equal(await appendRelayNoticeIfEnabled(enabled, append, input), true);
  assert.equal(writes, 1);
  console.log("PASS: Fully enabled Production sends exactly one XADD");

  await assert.rejects(
    appendRelayNoticeIfEnabled(enabled, async () => {
      throw new Error("Simulated failure without credentials");
    }, input),
  );
  await assert.rejects(
    appendRelayNoticeIfEnabled(enabled, append, { ...input, eventId: "bad" }),
  );
  assert.equal(writes, 1);
  console.log("PASS: Redis failures propagate to best-effort adapter; invalid input does not write");
  console.log("PHASE 16.19A PUBLISHER GATE: PASS");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
