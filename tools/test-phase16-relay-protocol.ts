import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  createRelayEntry,
  parseRelayFields,
  recipientRelayKey,
  projectMonthlyIdleReads,
  RELAY_MAXLEN,
  RELAY_BATCH_SIZE,
} from "../src/server/realtime/relay-protocol";

const prefix = "ims-network:v1:preview";
const secret = "x".repeat(48);
const alice = randomUUID();
const bob = randomUUID();
const eventId = randomUUID();
const originInstanceId = randomUUID();

const aliceKey = recipientRelayKey(alice, prefix, secret);
const bobKey = recipientRelayKey(bob, prefix, secret);

assert.notEqual(aliceKey, bobKey);
assert.equal(
  aliceKey,
  recipientRelayKey(alice, prefix, secret),
);
assert.ok(!aliceKey.includes(alice));
console.log("PASS: Stable pseudonymous recipient keys");

const event = createRelayEntry({
  prefix,
  secret,
  recipientUserId: alice,
  eventId,
  originInstanceId,
});

assert.equal(
  event.streamKey,
  "ims-network:v1:preview:realtime:events",
);

const flat = Object.entries(event.fields).flat();
assert.deepEqual(parseRelayFields(flat), event.fields);

assert.ok(!JSON.stringify(event).includes(alice));
assert.ok(!JSON.stringify(event).includes(secret));
console.log("PASS: Private notification envelope");

assert.equal(parseRelayFields(["v", "1"]), null);
assert.equal(
  parseRelayFields([...flat.slice(0, 6), "v", "1"]),
  null,
);
assert.equal(
  parseRelayFields(["v", "2", ...flat.slice(2)]),
  null,
);
console.log("PASS: Malformed relay entries rejected");

assert.throws(() =>
  recipientRelayKey(alice, "wrong:namespace", secret),
);
assert.throws(() =>
  createRelayEntry({
    prefix,
    secret,
    recipientUserId: alice,
    eventId: "invalid",
    originInstanceId,
  }),
);
console.log("PASS: Invalid namespace and event rejected");

assert.equal(projectMonthlyIdleReads(1), 86_400);
assert.equal(projectMonthlyIdleReads(5), 432_000);
assert.equal(projectMonthlyIdleReads(0), 0);
assert.throws(() => projectMonthlyIdleReads(-1));

assert.equal(RELAY_MAXLEN, 2000);
assert.equal(RELAY_BATCH_SIZE, 50);
console.log("PASS: Relay capacity and budget guards");

console.log("PHASE 16 RELAY PROTOCOL: PASS");