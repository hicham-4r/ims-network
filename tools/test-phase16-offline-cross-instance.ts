import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRelayBridge } from "../src/server/realtime/relay-bridge";
import { appendRelayNotice } from "../src/server/realtime/stream-publisher-core";
import { createAuthorizedLocalSocket } from "../src/server/realtime/authorized-local-socket";
import type { LocalSocket } from "../src/server/realtime/local-hub";
import type { StreamReadClient } from "../src/server/realtime/stream-reader-core";

async function until(predicate: () => boolean) {
  for (let n = 0; n < 100; n++) {
    if (predicate()) return;
    await new Promise<void>((r) => setTimeout(r, 5));
  }
  throw new Error("fake relay stream timed out");
}

async function main() {
  const prefix = "ims-network:v1:preview";
  const stream = `${prefix}:realtime:events`;
  const secret = "offline-preview-only-" + "x".repeat(45);
  const alice = randomUUID();
  const bob = randomUUID();
  const origin = randomUUID();
  let sequence = 0;
  let totalReads = 0;
  let connections = 0;
  const subscribers = new Set<{
    cursor: string;
    resolve: (x: unknown) => void;
    reject: (e: unknown) => void;
  }>();
  const persisted = new Set<string>(); // Mock PostgreSQL durable IDs; never Redis.
  const deliveredAlice: string[] = [];
  const deliveredBob: string[] = [];
  let bobAllowed = true;
  let bobAuthReads = 0;

  const connect = async (): Promise<StreamReadClient> => {
    connections++;
    const owned = new Set<(typeof subscribers extends Set<infer V> ? V : never)>();
    let closed = false;
    return {
      async read(k, cursor, blockMs, count) {
        assert.equal(k, stream);
        assert.equal(blockMs, 30000);
        assert.equal(count, 50);
        if (closed) throw Error("reader closed");
        totalReads++;
        return new Promise((resolve, reject) => {
          const q = { cursor, resolve, reject };
          subscribers.add(q);
          owned.add(q);
        });
      },
      disconnect() {
        if (closed) return;
        closed = true;
        for (const q of owned) {
          subscribers.delete(q);
          q.reject(Error("reader detached"));
        }
        owned.clear();
      },
    };
  };

  function fakeSocket(messages: string[]): LocalSocket {
    return {
      readyState: 1,
      bufferedAmount: 0,
      send(msg) { messages.push(msg); },
      close() {},
    };
  }
  const aliceSocket = fakeSocket(deliveredAlice);
  const bobSocket = fakeSocket(deliveredBob);
  const authorizedBob = createAuthorizedLocalSocket(
    bobSocket,
    async () => { bobAuthReads++; return bobAllowed; },
    () => {},
  );

  const instanceA = createRelayBridge({
    prefix, secret, connect,
    deliverToUser(u, n) {
      assert.equal(u, alice);
      aliceSocket.send(JSON.stringify(n));
      return 1;
    },
  });
  const instanceB = createRelayBridge({
    prefix, secret, connect,
    deliverToUser(u, n) {
      assert.equal(u, bob);
      authorizedBob.socket.send(JSON.stringify(n));
      return 1;
    },
  });
  const detachAlice = instanceA.attachAuthenticatedUser(alice);
  const detachBob = instanceB.attachAuthenticatedUser(bob);
  await until(() => subscribers.size === 2);
  assert.equal(connections, 2, "one reader per active fake instance");
  assert.equal(totalReads, 2);

  async function publish(recipientUserId: string, eventId: string) {
    const id = await appendRelayNotice(async (key, token, fields, opts) => {
      assert.equal(key, stream);
      assert.equal(token, "*");
      assert.equal(opts.trim.threshold, 2000);
      const nextId = `1000-${++sequence}`;
      const flattened = Object.entries(fields).flatMap(([k, v]) => [k, v]);
      for (const q of [...subscribers]) {
        subscribers.delete(q);
        // First read starts at '$': Fake Redis only delivers newly appended data.
        q.resolve([[stream, [[nextId, flattened]]]]);
      }
      return nextId;
    }, { prefix, secret, recipientUserId, eventId, originInstanceId: origin });
    assert.match(id, /^1000-\d+$/);
  }

  const message1 = randomUUID();
  persisted.add(message1); // PostgreSQL commit precedes best-effort publish.
  await publish(bob, message1);
  await until(() => deliveredBob.length === 1);
  assert.equal(deliveredAlice.length, 0, "Alice not a recipient");
  assert.equal(bobAuthReads, 1, "recipient session verified once per notice");
  assert.deepEqual(JSON.parse(deliveredBob[0]), { type: "messages.changed", eventId: message1 });
  assert.equal(JSON.stringify(deliveredBob).includes("offline-preview-only"), false);
  assert.equal(instanceB.readerCounters().forwardedNotices, 1);
  console.log("PASS: Offline cross-instance metadata notice; isolated recipient and auth");

  await until(() => subscribers.size === 2);
  await publish(bob, message1); // Duplicate event with same immutable ID.
  await new Promise<void>((r) => setTimeout(r, 20));
  assert.equal(deliveredBob.length, 1, "duplicate event suppressed by router");
  console.log("PASS: Duplicate relay event not delivered twice");

  await until(() => subscribers.size === 2);
  bobAllowed = false; // Mock revoked Better Auth session.
  const message2 = randomUUID();
  persisted.add(message2);
  await publish(bob, message2);
  await until(() => bobAuthReads >= 2);
  await new Promise<void>((r) => setTimeout(r, 20));
  assert.equal(deliveredBob.length, 1, "revoked session receives no notice");
  assert.equal(persisted.has(message2), true, "durable PG message remains after relay rejection");
  console.log("PASS: Revoked session fails closed; durable message unchanged");

  detachAlice();
  detachBob();
  detachBob();
  authorizedBob.dispose();
  await until(() => instanceA.readerCounters().activeSubscriptions === 0 &&
    instanceB.readerCounters().activeSubscriptions === 0);
  await new Promise<void>((r) => setTimeout(r, 20));
  const callsAfterDetach = totalReads;
  await new Promise<void>((r) => setTimeout(r, 20));
  assert.equal(totalReads, callsAfterDetach, "no idle reads after last detach");
  console.log("PASS: Last detach shuts down idle Redis readers");
  console.log("PHASE 16.19K-L OFFLINE CROSS-INSTANCE: PASS");
}
void main().catch((e: unknown) => { console.error(e); process.exitCode = 1; });
