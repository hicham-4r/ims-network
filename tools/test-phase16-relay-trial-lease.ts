import assert from "node:assert/strict";
import { createSocketDeadline } from "../src/server/realtime/socket-deadline";

function verifyLifetime(duration: 30_000 | 150_000) {
  let now = 0;
  let id = 0;
  const timers = new Map<number, {at:number, callback:()=>void}>();
  let cleanup = 0, close = 0, termination = 0;
  const deadline = createSocketDeadline({
    schedule(callback, delayMs) {
      const n = ++id; timers.set(n, { at: now + delayMs, callback }); return n;
    },
    cancel(n) { timers.delete(n); },
    cleanup() { cleanup++; },
    closeGracefully() { close++; },
    forceTerminate() { termination++; },
  }, duration);
  function advance(ms: number) {
    const finish = now + ms;
    for (let i = 0; i < 20; i++) {
      const [tid,t] = [...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0] ?? [];
      if (tid === undefined || !t || t.at > finish) break;
      now = t.at; timers.delete(tid); t.callback();
    }
    now = finish;
  }
  advance(duration - 1);
  assert.equal(cleanup, 0); assert.equal(close, 0);
  advance(1);
  assert.equal(cleanup, 1); assert.equal(close, 1);
  deadline.dispose(); deadline.dispose();
  advance(4000);
  assert.equal(cleanup, 1); assert.equal(termination, 0);
  assert.equal(timers.size, 0);
}
verifyLifetime(30_000);
verifyLifetime(150_000);
console.log("PASS: WS-only 30s and Preview relay 150s leases close exactly once");
console.log("PASS: Timers and reader-cleanup lifetimes are bounded");
console.log("PHASE 16.19N SOCKET TRIAL LEASE: PASS");
