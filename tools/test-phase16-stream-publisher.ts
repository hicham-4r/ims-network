import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  appendRelayNotice,
  type StreamAppend,
} from "../src/server/realtime/stream-publisher-core";

async function main() {
const prefix = "ims-network:v1:preview";
const secret = "x".repeat(48);
const recipientUserId = randomUUID();
const eventId = randomUUID();
const originInstanceId = randomUUID();

const input = {
  prefix,
  secret,
  recipientUserId,
  eventId,
  originInstanceId,
};

let calls = 0;

const append: StreamAppend = async (
  key,
  id,
  fields,
  options,
) => {
  calls++;

  assert.equal(
    key,
    "ims-network:v1:preview:realtime:events",
  );

  assert.equal(id, "*");
  assert.equal(fields.v, "1");
  assert.equal(fields.e, eventId);
  assert.equal(fields.o, originInstanceId);

  assert.ok(typeof fields.r === "string");
  assert.ok(!fields.r.includes(recipientUserId));

  assert.equal(options.trim.type, "MAXLEN");
  assert.equal(options.trim.threshold, 2000);
  assert.equal(options.trim.comparison, "~");

  assert.deepEqual(
    Object.keys(fields).sort(),
    ["e", "o", "r", "v"],
  );

  return "1000-0";
};

const streamId = await appendRelayNotice(
  append,
  input,
);

assert.equal(streamId, "1000-0");
assert.equal(calls, 1);

console.log("PASS: Exactly one bounded Redis XADD");
console.log("PASS: Namespace and private notification fields");
console.log("PASS: Approximate stream trimming");

// Invalid input must be rejected before any write.
await assert.rejects(
  appendRelayNotice(append, {
    ...input,
    eventId: "invalid",
  }),
);

assert.equal(calls, 1);
console.log("PASS: Invalid event rejected before Redis write");

await assert.rejects(
  appendRelayNotice(async () => {
    throw new Error("Simulated Redis failure");
  }, input),
);

console.log("PASS: Redis failure propagates to adapter");

await assert.rejects(
  appendRelayNotice(async () => "invalid", input),
);

console.log("PASS: Invalid Redis response rejected");
console.log("PHASE 16 STREAM PUBLISHER: PASS");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});