import assert from "node:assert/strict";
import {
  createLazyRelayAttacher,
} from "../src/server/realtime/relay-runtime-core";

let instances = 0;
let attachments = 0;
let detachments = 0;
const observed: string[] = [];
const attach = createLazyRelayAttacher(() => {
  instances++;
  return {
    attachAuthenticatedUser(userId: string) {
      attachments++;
      observed.push(userId);
      return () => { detachments++; };
    },
  };
});

const noop = attach("alice", false);
noop();
assert.equal(instances, 0);
assert.equal(attachments, 0);
console.log("PASS: Disabled feature opens no reader or subscription");

assert.throws(() => attach("", true));
assert.throws(() => attach(" ", true));
assert.throws(() => attach("x".repeat(256), true));
assert.equal(instances, 0);
console.log("PASS: Missing or invalid member identity rejected");

const detachAlice = attach("alice", true);
const detachBob = attach("bob", true);
assert.equal(instances, 1);
assert.equal(attachments, 2);
assert.deepEqual(observed, ["alice", "bob"]);
console.log("PASS: One bridge shared across authenticated members");

detachAlice();
detachAlice();
assert.equal(detachments, 1);
detachBob();
assert.equal(detachments, 2);
console.log("PASS: Per-connection detach is idempotent");

attach("charlie", false)();
assert.equal(attachments, 2);
const detachCharlie = attach("charlie", true);
assert.equal(instances, 1);
assert.equal(attachments, 3);
detachCharlie();
console.log("PASS: Reuse after previous subscribers detach");

let attempts = 0;
const failOnce = createLazyRelayAttacher(() => {
  attempts++;
  if (attempts === 1) throw new Error("Simulated missing config");
  return { attachAuthenticatedUser: () => () => {} };
});
assert.throws(() => failOnce("alice", true));
failOnce("alice", true)();
assert.equal(attempts, 2);
console.log("PASS: Configuration failure does not cache broken bridge");

console.log("PHASE 16 RELAY RUNTIME: PASS");
