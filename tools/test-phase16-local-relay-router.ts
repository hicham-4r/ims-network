import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { recipientRelayKey } from "../src/server/realtime/relay-protocol";
import { LocalRelayRouter } from "../src/server/realtime/local-relay-router";

const prefix = "ims-network:v1:preview";
const secret = "local-test-secret-" + "x".repeat(40);
const alice = randomUUID();
const bob = randomUUID();
const aliceKey = recipientRelayKey(alice, prefix, secret);
const bobKey = recipientRelayKey(bob, prefix, secret);

let subscriptions = 0;
let released = 0;
const active = new Set<string>();
const delivered: Array<{ userId: string; eventId: string }> = [];

const router = new LocalRelayRouter({
  prefix,
  secret,
  subscribeToRelay(key) {
    subscriptions++;
    assert.ok(!active.has(key));
    active.add(key);
    return () => {
      released++;
      active.delete(key);
    };
  },
  deliverToUser(userId, notice) {
    delivered.push({ userId, eventId: notice.eventId });
    return 1;
  },
});

const detachAlice1 = router.attach(alice);
const detachAlice2 = router.attach(alice);
const detachBob = router.attach(bob);
assert.equal(subscriptions, 2);
assert.equal(active.size, 2);
assert.equal(router.activeMemberCount(), 2);
assert.equal(router.activeReferenceCount(), 3);
console.log("PASS: One relay subscription per authenticated member");

const event1 = randomUUID();
assert.equal(router.onNotice({ recipientKey: aliceKey, eventId: event1 }), 1);
assert.deepEqual(delivered, [{ userId: alice, eventId: event1 }]);
assert.equal(router.onNotice({ recipientKey: aliceKey, eventId: event1 }), 0);
assert.equal(router.onNotice({ recipientKey: bobKey, eventId: randomUUID() }), 1);
assert.equal(delivered[1].userId, bob);
console.log("PASS: Private recipient routing and duplicate suppression");

assert.equal(router.onNotice({ recipientKey: "invalid", eventId: randomUUID() }), 0);
assert.equal(router.onNotice({ recipientKey: aliceKey, eventId: "not-uuid" }), 0);
assert.equal(router.onNotice({ recipientKey: "z".repeat(43), eventId: randomUUID() }), 0);
assert.equal(delivered.length, 2);
console.log("PASS: Invalid and unknown events ignored");

detachAlice1();
detachAlice1();
assert.equal(released, 0);
assert.equal(router.activeReferenceCount(), 2);
assert.equal(router.onNotice({ recipientKey: aliceKey, eventId: randomUUID() }), 1);

detachAlice2();
assert.equal(released, 1);
assert.equal(router.activeMemberCount(), 1);
assert.equal(router.onNotice({ recipientKey: aliceKey, eventId: randomUUID() }), 0);
detachBob();
assert.equal(released, 2);
assert.equal(active.size, 0);
assert.equal(router.activeReferenceCount(), 0);
console.log("PASS: Reference-counted unsubscribe and idempotent cleanup");

const failed = new LocalRelayRouter({
  prefix,
  secret,
  subscribeToRelay() { throw new Error("simulated reader failure"); },
  deliverToUser() { throw new Error("should not deliver"); },
});
assert.throws(() => failed.attach(alice), /simulated reader failure/);
assert.equal(failed.activeMemberCount(), 0);
assert.equal(failed.activeReferenceCount(), 0);
console.log("PASS: Failed reader subscription leaves no stale member state");

console.log("PHASE 16 LOCAL RELAY ROUTER: PASS");
