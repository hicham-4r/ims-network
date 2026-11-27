import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  decodeStreamRead,
  SharedStreamReader,
  type StreamReadClient,
} from "../src/server/realtime/stream-reader-core";
import { RELAY_BATCH_SIZE, RELAY_BLOCK_MS } from "../src/server/realtime/relay-protocol";

async function waitFor(condition: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for fake reader.");
}

async function main() {
  const stream = "ims-network:v1:preview:realtime:events";
  const aliceKey = "a".repeat(43);
  const bobKey = "b".repeat(43);
  const eventId = randomUUID();
  const originId = randomUUID();
  const flatFields = (recipientKey: string) => [
    "v", "1", "e", eventId, "r", recipientKey, "o", originId,
  ];

  const decoded = decodeStreamRead(
    [[stream, [["1000-0", flatFields(aliceKey)]]]],
    stream,
    "$",
  );
  assert.deepEqual(decoded, {
    nextId: "1000-0",
    notices: [{ recipientKey: aliceKey, eventId }],
  });
  assert.deepEqual(decodeStreamRead(null, stream, "1000-0"), {
    nextId: "1000-0", notices: [],
  });
  console.log("PASS: Bounded Redis XREAD reply decoded");

  assert.deepEqual(
    decodeStreamRead([[stream, [["1000-1", ["broken", "entry"]]]]], stream, "1000-0"),
    { nextId: "1000-1", notices: [] },
  );
  assert.throws(() => decodeStreamRead([["wrong", []]], stream, "$"));
  assert.throws(() => decodeStreamRead([[stream, [["1000-0", flatFields(aliceKey)]]]], stream, "1000-0"));
  assert.throws(() => decodeStreamRead([[stream, Array.from({ length: RELAY_BATCH_SIZE + 1 }, (_, i) => [`${1000+i}-0`, flatFields(aliceKey)])]], stream, "$"));
  console.log("PASS: Invalid entries isolated and invalid batches rejected");

  type Pending = {
    resolve(value: unknown): void;
    reject(reason?: unknown): void;
  };
  const pending: Pending[] = [];
  const readCursors: string[] = [];
  let connections = 0;
  let disconnects = 0;
  let readCount = 0;
  const received: Array<{ recipientKey: string; eventId: string }> = [];

  const reader = new SharedStreamReader(stream, async (): Promise<StreamReadClient> => {
    connections++;
    return {
      read(key, cursor, blockMs, count) {
        assert.equal(key, stream);
        assert.equal(blockMs, RELAY_BLOCK_MS);
        assert.equal(count, RELAY_BATCH_SIZE);
        readCursors.push(cursor);
        readCount++;
        return new Promise<unknown>((resolve, reject) => pending.push({ resolve, reject }));
      },
      disconnect() {
        disconnects++;
        for (const read of pending.splice(0)) read.reject(new Error("Reader disconnected"));
      },
    };
  }, (notice) => received.push(notice));

  assert.equal(connections, 0);
  const detachA = reader.subscribe(aliceKey);
  const detachA2 = reader.subscribe(aliceKey);
  const detachB = reader.subscribe(bobKey);
  await waitFor(() => readCount >= 1);
  assert.equal(connections, 1);
  assert.equal(reader.subscriptionCount(), 3);
  console.log("PASS: One lazy reader shared among subscribers");

  pending.shift()?.resolve([[stream, [["1000-0", flatFields(bobKey)], ["1000-1", flatFields(aliceKey)]]]]);
  await waitFor(() => readCount >= 2);
  assert.equal(received.length, 2);
  assert.deepEqual(received.map((x) => x.recipientKey), [bobKey, aliceKey]);
  assert.deepEqual(readCursors.slice(0, 2), ["$", "1000-1"]);
  console.log("PASS: Recipient isolation and continuous stream cursor");

  detachA();
  detachA();
  detachA2();
  assert.equal(reader.subscriptionCount(), 1);
  assert.equal(disconnects, 0);

  pending.shift()?.resolve([[stream, [["1000-2", flatFields(aliceKey)], ["1000-3", flatFields(bobKey)]]]]);
  await waitFor(() => readCount >= 3);
  assert.equal(received.length, 3);
  assert.equal(received[2].recipientKey, bobKey);
  console.log("PASS: Unsubscribed recipients receive no notifications");

  detachB();
  await waitFor(() => disconnects >= 1);
  assert.equal(reader.subscriptionCount(), 0);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(connections, 1);
  console.log("PASS: Last subscriber closes reader and releases resources");
  console.log("PHASE 16 SHARED STREAM READER: PASS");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
