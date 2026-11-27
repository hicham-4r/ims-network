import assert from "node:assert/strict";
import { SharedStreamReader } from "../src/server/realtime/stream-reader-core";

async function until(pred: () => boolean) {
  for (let n = 0; n < 100; n++) {
    if (pred()) return;
    await new Promise<void>((r) => setTimeout(r, 5));
  }
  throw new Error("mock stream reader timeout");
}
async function main() {
  const stream = "ims-network:v1:preview:realtime:events";
  let open = 0;
  let disconnects = 0;
  let reads = 0;
  const reader = new SharedStreamReader(stream, async () => {
    open++;
    let closed = false;
    return {
      async read() {
        reads++;
        // Zero-entry array is validly structured but must not cause a busy loop.
        return [[stream, []]];
      },
      disconnect() {
        if (closed) return;
        closed = true;
        disconnects++;
      },
    };
  }, () => { throw new Error("unexpected forwarded message"); });
  assert.deepEqual(reader.counters(), {
    connectAttempts: 0, openedConnections: 0,
    readAttempts: 0, emptyReplies: 0, forwardedNotices: 0,
    failedOperations: 0, activeSubscriptions: 0,
  });
  const release1 = reader.subscribe("a".repeat(43));
  const release2 = reader.subscribe("a".repeat(43));
  await until(() => reader.counters().emptyReplies === 1);
  await new Promise<void>((r) => setTimeout(r, 80));
  assert.equal(reads, 1, "empty structured replies must be paced");
  assert.equal(reader.counters().readAttempts, 1);
  assert.equal(reader.counters().activeSubscriptions, 2);
  assert.equal(reader.counters().openedConnections, 1);
  release1();
  assert.equal(reader.counters().activeSubscriptions, 1);
  release2();
  await until(() => disconnects === 1);
  assert.equal(reader.counters().activeSubscriptions, 0);
  await new Promise<void>((r) => setTimeout(r, 20));
  assert.equal(open, 1);
  assert.equal(reads, 1, "idle reader stops with last subscriber");
  console.log("PASS: Empty array pacing, connection sharing and zero idle reads");
  console.log("PASS: Per-instance counters omit IDs, tokens and payloads");
  console.log("PHASE 16.19L READER COUNTERS: PASS");
}
void main().catch((err: unknown) => { console.error(err); process.exitCode = 1; });
