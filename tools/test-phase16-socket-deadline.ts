import { createSocketDeadline } from "../src/server/realtime/socket-deadline";

function check(ok: boolean, label: string) {
  if (!ok) throw new Error(label);
}

function harness(throwOnClose = false) {
  let now = 0;
  let nextId = 0;
  let releases = 0;
  let closes = 0;
  let terminated = 0;
  const timers = new Map<number, { when: number; callback: () => void }>();

  const lifetime = createSocketDeadline({
    schedule(callback, delayMs) {
      const id = ++nextId;
      timers.set(id, { when: now + delayMs, callback });
      return id;
    },
    cancel(id) { timers.delete(id); },
    cleanup() { releases++; },
    closeGracefully() {
      closes++;
      if (throwOnClose) throw new Error("mock socket failure");
    },
    forceTerminate() { terminated++; },
  });

  function advance(ms: number) {
    const target = now + ms;
    for (let count = 0; count < 100; count++) {
      const next = [...timers].sort((a, b) => a[1].when - b[1].when)[0];
      if (!next || next[1].when > target) break;
      now = next[1].when;
      timers.delete(next[0]);
      next[1].callback();
      if (count === 99) throw new Error("unbounded timer scheduling");
    }
    now = target;
  }

  return {
    lifetime, advance,
    snapshot() { return { releases, closes, terminated, timers: timers.size }; },
  };
}

function main() {
  const normal = harness();
  normal.advance(29_999);
  check(normal.snapshot().releases === 0, "No premature cleanup");
  normal.advance(1);
  check(normal.snapshot().releases === 1, "Cleanup on deadline exactly once");
  check(normal.snapshot().closes === 1, "Graceful close initiated");
  check(normal.snapshot().terminated === 0, "Not force-terminated on time");
  normal.lifetime.dispose(); // Socket close event.
  normal.lifetime.dispose();
  normal.advance(10_000);
  check(normal.snapshot().releases === 1, "Idempotent cleanup");
  check(normal.snapshot().terminated === 0, "Close cancels force fallback");
  check(normal.snapshot().timers === 0, "No timers after close");
  console.log("PASS: Deadline graceful close, immediate cleanup, close cancellation");

  const blocked = harness();
  blocked.advance(30_000);
  blocked.advance(1_999);
  check(blocked.snapshot().terminated === 0, "Grace window is respected");
  blocked.advance(1);
  check(blocked.snapshot().terminated === 1, "Dead peer force-terminated");
  blocked.lifetime.dispose();
  check(blocked.snapshot().releases === 1, "Forced fallback releases once");
  check(blocked.snapshot().timers === 0, "Forced fallback cancels timers");
  console.log("PASS: Unresponsive peer has bounded force-termination fallback");

  const early = harness();
  early.lifetime.dispose(); // Route exit/session revocation/error.
  early.advance(60_000);
  check(early.snapshot().releases === 1, "Early close cleans once");
  check(early.snapshot().closes === 0, "No late close after dispose");
  check(early.snapshot().terminated === 0, "No late terminate after dispose");
  console.log("PASS: Early release cancels both timers");

  const failing = harness(true);
  failing.advance(30_000);
  check(failing.snapshot().releases === 1, "Cleanup before close failure");
  check(failing.snapshot().terminated === 1, "Close exception forces termination");
  check(failing.snapshot().timers === 0, "No leftover timers after exception");
  console.log("PASS: Close error fails closed without timer leak");

  console.log("PHASE 16.19H SOCKET DEADLINE: PASS");
}

main();
