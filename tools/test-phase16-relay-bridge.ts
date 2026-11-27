import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createRelayBridge } from "../src/server/realtime/relay-bridge";
import { recipientRelayKey } from "../src/server/realtime/relay-protocol";
import type { StreamReadClient } from "../src/server/realtime/stream-reader-core";

async function waitFor(condition: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (condition()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for the fake Redis reader.");
}

async function main() {
  const prefix = "ims-network:v1:preview";
  const secret = "offline-relay-test-" + "x".repeat(40);
  const stream = `${prefix}:realtime:events`;
  const alice = randomUUID();
  const bob = randomUUID();
  const aliceKey = recipientRelayKey(alice, prefix, secret);
  const bobKey = recipientRelayKey(bob, prefix, secret);
  const origin = randomUUID();

  let connections = 0;
  let disconnects = 0;
  let readCalls = 0;
  const pending: Array<{
    resolve(value: unknown): void;
    reject(reason: unknown): void;
  }> = [];
  const delivered: Array<{ userId: string; eventId: string }> = [];

  const bridge = createRelayBridge({
    prefix,
    secret,
    connect: async (): Promise<StreamReadClient> => {
      connections++;
      return {
        read(key, cursor, blockMs, count) {
          assert.equal(key, stream);
          assert.match(cursor, /^(\$|[0-9]+-[0-9]+)$/);
          assert.equal(blockMs, 30_000);
          assert.equal(count, 50);
          readCalls++;
          return new Promise<unknown>((resolve, reject) => {
            pending.push({ resolve, reject });
          });
        },
        disconnect() {
          disconnects++;
          // Simulate aborting the outstanding blocking XREAD.
          for (const request of pending.splice(0)) {
            request.reject(new Error("Reader disconnected"));
          }
        },
      };
    },
    deliverToUser(userId, notice) {
      delivered.push({ userId, eventId: notice.eventId });
      return 1;
    },
  });

  assert.equal(connections, 0);
  assert.deepEqual(bridge.subscriptionStats(), {
    members: 0, socketReferences: 0, streamSubscriptions: 0,
  });
  console.log("PASS: No Redis connection when idle");

  const detachAlice1 = bridge.attachAuthenticatedUser(alice);
  const detachAlice2 = bridge.attachAuthenticatedUser(alice);
  const detachBob = bridge.attachAuthenticatedUser(bob);
  await waitFor(() => readCalls === 1);
  assert.equal(connections, 1);
  assert.deepEqual(bridge.subscriptionStats(), {
    members: 2, socketReferences: 3, streamSubscriptions: 2,
  });
  console.log("PASS: One reader for multiple sockets and members");

  const aliceEvent = randomUUID();
  const bobEvent = randomUUID();
  const fields = (recipientKey: string, eventId: string) => [
    "v", "1", "e", eventId, "r", recipientKey, "o", origin,
  ];
  pending.shift()?.resolve([[
    stream,
    [
      ["1000-0", fields(aliceKey, aliceEvent)],
      ["1000-1", fields(bobKey, bobEvent)],
      ["1000-2", fields(aliceKey, aliceEvent)],
      ["1000-3", fields("z".repeat(43), randomUUID())],
    ],
  ]]);
  await waitFor(() => readCalls >= 2);
  assert.deepEqual(delivered, [
    { userId: alice, eventId: aliceEvent },
    { userId: bob, eventId: bobEvent },
  ]);
  console.log("PASS: Recipient isolation and duplicate suppression");

  detachAlice1();
  assert.deepEqual(bridge.subscriptionStats(), {
    members: 2, socketReferences: 2, streamSubscriptions: 2,
  });
  detachAlice2();
  assert.deepEqual(bridge.subscriptionStats(), {
    members: 1, socketReferences: 1, streamSubscriptions: 1,
  });

  pending.shift()?.resolve([[
    stream,
    [
      ["1000-4", fields(aliceKey, randomUUID())],
      ["1000-5", fields(bobKey, randomUUID())],
    ],
  ]]);
  await waitFor(() => readCalls >= 3);
  assert.equal(delivered.length, 3);
  assert.equal(delivered[2].userId, bob);
  console.log("PASS: Detached user no longer receives notifications");

  detachBob();
  detachBob();
  await waitFor(() => disconnects === 1);
  assert.deepEqual(bridge.subscriptionStats(), {
    members: 0, socketReferences: 0, streamSubscriptions: 0,
  });
  await new Promise<void>((resolve) => setTimeout(resolve, 30));
  assert.equal(connections, 1);
  console.log("PASS: Last detach stops shared TCP reader");

  console.log("PHASE 16 RELAY BRIDGE: PASS");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
