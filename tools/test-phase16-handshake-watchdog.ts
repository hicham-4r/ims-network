import assert from "node:assert/strict";
import {
  createMessageRealtimeController,
  type MessageSocket,
} from "../src/app/(app)/messages/realtime-client-core";

type FakeSocket = MessageSocket & {
  message(value: string): void;
  end(code: number): void;
  closed: boolean;
};

function harness() {
  let now = 1_000;
  let visible = true;
  let nextId = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const sockets: FakeSocket[] = [];
  let reconciles = 0;
  const controller = createMessageRealtimeController({
    connect() {
      let handleMessage: (v: unknown) => void = () => {};
      let handleClose: (c: number) => void = () => {};
      const s: FakeSocket = {
        closed: false,
        onMessage(fn) { handleMessage = fn; },
        onClose(fn) { handleClose = fn; },
        onError() {},
        close() { s.closed = true; },
        message(v) { handleMessage(v); },
        end(c) { handleClose(c); },
      };
      sockets.push(s);
      return s;
    },
    schedule(callback, ms) {
      const id = ++nextId;
      timers.set(id, { at: now + ms, callback });
      return id;
    },
    cancel(id) { timers.delete(id); },
    now: () => now,
    random: () => 0.5,
    isVisible: () => visible,
    reconcile() { reconciles++; },
  });
  function advance(ms: number) {
    const end = now + ms;
    for (let i = 0; i < 100; i++) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].callback();
      if (i === 99) throw new Error("runaway retry timers");
    }
    now = end;
  }
  return { controller, sockets, advance,
    get timers() { return timers.size; },
    get reconciles() { return reconciles; },
    visibility(value: boolean) { visible = value; controller.visibilityChanged(); },
  };
}

function main() {
  const stalled = harness();
  stalled.controller.start();
  assert.equal(stalled.sockets.length, 1);
  stalled.advance(14_999);
  assert.equal(stalled.sockets[0].closed, false);
  stalled.advance(1);
  assert.equal(stalled.sockets[0].closed, true, "unready socket closed after 15s");
  stalled.sockets[0].message(JSON.stringify({ type: "ready", version: 1 }));
  stalled.sockets[0].end(1008); // stale close must never disable retries
  stalled.advance(999);
  assert.equal(stalled.sockets.length, 1, "watchdog applies backoff");
  stalled.advance(1);
  assert.equal(stalled.sockets.length, 2, "one replacement after timeout");
  stalled.controller.stop();
  assert.equal(stalled.timers, 0, "no timers after route exit");
  console.log("PASS: Silent transport is timed out; stale callbacks cannot defeat retry");

  const ready = harness();
  ready.controller.start();
  ready.sockets[0].message(JSON.stringify({ type: "ready", version: 1 }));
  ready.advance(20_000);
  assert.equal(ready.sockets.length, 1, "ready socket must not time out at 15s");
  assert.equal(ready.sockets[0].closed, false);
  assert.equal(ready.reconciles, 1, "ready reconciles PostgreSQL once");
  ready.controller.stop();
  assert.equal(ready.timers, 0);
  console.log("PASS: Ready cancels handshake watchdog and preserves PG reconciliation");

  const hidden = harness();
  hidden.controller.start();
  hidden.visibility(false);
  hidden.advance(100_000);
  assert.equal(hidden.sockets.length, 1, "no background retry");
  hidden.visibility(true);
  assert.equal(hidden.sockets.length, 2, "foreground mounts one new socket");
  hidden.sockets[1].end(1008);
  hidden.advance(100_000);
  assert.equal(hidden.sockets.length, 2, "policy rejection is terminal");
  hidden.controller.stop();
  assert.equal(hidden.timers, 0);
  console.log("PASS: Hidden tab has zero reconnects; 1008 remains terminal");
  console.log("PHASE 16.19K HANDSHAKE WATCHDOG: PASS");
}
main();
