import {
  createMessageRealtimeController,
  parseRealtimeFrame,
  type MessageSocket,
  type ReconcileReason,
} from "../src/app/(app)/messages/realtime-client-core";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function equal(a: unknown, b: unknown, message: string) {
  assert(Object.is(a, b), `${message}: expected ${String(b)}, got ${String(a)}`);
}

type FakeSocket = MessageSocket & {
  message(input: unknown): void;
  disconnect(code: number): void;
  closed: boolean;
};

function testHarness() {
  let visible = true;
  let now = 10_000;
  let timerId = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const sockets: FakeSocket[] = [];
  const reconciles: ReconcileReason[] = [];

  const controller = createMessageRealtimeController({
    connect() {
      let onMessage: (data: unknown) => void = () => {};
      let onClose: (code: number) => void = () => {};
      
      const socket: FakeSocket = {
        closed: false,
        onMessage(handler) { onMessage = handler; },
        onClose(handler) { onClose = handler; },
        onError(handler) { void handler; },
        close() { socket.closed = true; },
        message(input) { onMessage(input); },
        disconnect(code) { onClose(code); },
      };
      sockets.push(socket);
      return socket;
    },
    schedule(callback, delayMs) {
      const id = ++timerId;
      timers.set(id, { at: now + delayMs, callback });
      return id;
    },
    cancel(id) { timers.delete(id); },
    now: () => now,
    random: () => 0.5,
    isVisible: () => visible,
    reconcile(reason) { reconciles.push(reason); },
  });
  function advance(ms: number) {
    const target = now + ms;
    let count = 0;
    while (true) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) break;
      if (++count > 100) throw new Error("Runaway scheduled task");
      now = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    now = target;
  }
  return {
    controller, sockets, reconciles, advance,
    setVisible(value: boolean) { visible = value; controller.visibilityChanged(); },
    get pendingTimers() { return timers.size; },
    get nextTimerMs() {
      const next = [...timers.values()].sort((a, b) => a.at - b.at)[0];
      return next === undefined ? null : next.at - now;
    },
  };
}

function main() {
  const eventId = "550e8400-e29b-41d4-a716-446655440000";
  equal(parseRealtimeFrame(JSON.stringify({ type: "ready", version: 1 }))?.type,
    "ready", "valid ready");
  equal(parseRealtimeFrame(JSON.stringify({ type: "messages.changed", eventId }))?.type,
    "messages.changed", "valid notice");
  assert(parseRealtimeFrame("<not json>") === null, "invalid frames rejected");
  assert(parseRealtimeFrame("x".repeat(513)) === null, "oversized frames rejected");
  assert(parseRealtimeFrame(JSON.stringify({ type: "messages.changed", eventId: "x" })) === null,
    "bad IDs rejected");
  console.log("PASS: Strict metadata-only frame parsing");

  const h = testHarness();
  h.controller.start();
  h.controller.start();
  equal(h.sockets.length, 1, "one WebSocket for messaging layout");
  h.sockets[0].message(JSON.stringify({ type: "ready", version: 1 }));
  h.advance(250);
  equal(h.reconciles.length, 1, "ready reconciles from PG");
  equal(h.reconciles[0], "ready", "initial readiness reason");
  console.log("PASS: One socket and initial PostgreSQL reconciliation");

  const notice = JSON.stringify({ type: "messages.changed", eventId });
  h.sockets[0].message(notice);
  h.sockets[0].message(notice);
  h.sockets[0].message(JSON.stringify({ type: "messages.changed",
    eventId: "550e8400-e29b-41d4-a716-446655440001" }));
  h.advance(1499);
  equal(h.reconciles.length, 1, "debounce/read-budget throttle");
  h.advance(1);
  equal(h.reconciles.length, 2, "coalesced notice reconciliation");
  equal(h.reconciles[1], "notice", "notice reason");
  h.sockets[0].message(notice);
  h.advance(2000);
  equal(h.reconciles.length, 2, "deduped ID not reconciled again");
  console.log("PASS: Deduplication and bounded coalesced refresh");

  h.sockets[0].disconnect(1006);
  equal(h.sockets.length, 1, "retry not immediate");
  h.advance(999);
  equal(h.sockets.length, 1, "retry backoff enforced");
  h.advance(1);
  equal(h.sockets.length, 2, "one replacement socket");
  h.sockets[1].message(JSON.stringify({ type: "ready", version: 1 }));
  h.advance(250);
  equal(h.reconciles.at(-1), "ready", "reconnect uses database reconciliation");
  console.log("PASS: Backoff, reconnect and PostgreSQL recovery");

  h.setVisible(false);
  assert(h.sockets[1].closed, "hidden tab disconnects socket");
  h.advance(100_000);
  equal(h.sockets.length, 2, "no hidden reconnect");
  h.setVisible(true);
  equal(h.sockets.length, 3, "reconnect on tab visibility");
  h.sockets[2].message(JSON.stringify({ type: "ready", version: 1 }));
  h.advance(250);
  equal(h.reconciles.at(-1), "ready", "foreground recovers PG events");
  console.log("PASS: Zero background sockets, foreground PG recovery");

  h.sockets[2].disconnect(1008);
  h.advance(100_000);
  equal(h.sockets.length, 3, "policy close never reconnects");
  h.controller.stop();
  equal(h.pendingTimers, 0, "stop clears timers");
  console.log("PASS: 1008 stops retry; route exit closes/cleans up");

  const g = testHarness();
  g.controller.start();
  const expectedBackoff = [1000, 2000, 4000, 8000, 16000,
    32000, 64000, 128000, 256000, 300000, 300000];
  for (let i = 0; i < expectedBackoff.length; i++) {
    equal(g.sockets.length, i + 1, "exactly one active attempt");
    g.sockets[i].disconnect(1006);
    equal(g.nextTimerMs, expectedBackoff[i], "bounded exponential retry delay");
    g.advance(expectedBackoff[i] - 1);
    equal(g.sockets.length, i + 1, "no early reconnect");
    g.advance(1);
    equal(g.sockets.length, i + 2, "one reconnect after delay");
  }
  g.controller.stop();
  equal(g.pendingTimers, 0, "no reconnect timers after leaving route");
  console.log("PASS: Outage retries grow to bounded five-minute interval");

  // Repeated `ready` frames and normal short-lived server closures must not
  // reset backoff. Without this guard, the temporary 30s server deadline
  // would cause a constant DB/WS reconnect cycle.
  const s = testHarness();
  s.controller.start();
  for (let i = 0; i < 4; i++) {
    s.sockets[i].message(JSON.stringify({ type: "ready", version: 1 }));
    s.advance(250); // Database-backed ready reconciliation remains scheduled.
    s.advance(30_000);
    s.sockets[i].disconnect(1001);
    equal(s.nextTimerMs, 1000 * (2 ** i), "short ready must not reset retries");
    s.advance(1000 * (2 ** i));
    equal(s.sockets.length, i + 2, "one socket after a short-lived close");
  }
  s.controller.stop();
  console.log("PASS: Short authenticated sessions never reset backoff");

  // After a genuinely stable authenticated interval, the next retry can be
  // prompt again. A successful handshake alone is not sufficient.
  const stable = testHarness();
  stable.controller.start();
  stable.sockets[0].disconnect(1006);
  stable.advance(1000);
  stable.sockets[1].disconnect(1006);
  stable.advance(2000);
  stable.sockets[2].message(JSON.stringify({ type: "ready", version: 1 }));
  stable.advance(120_001);
  stable.sockets[2].disconnect(1001);
  equal(stable.nextTimerMs, 1000, "stable ready connection resets streak");
  stable.controller.stop();
  console.log("PASS: Stable authenticated connections reset backoff");

  const x = testHarness();
  x.controller.start();
  x.sockets[0].message(JSON.stringify({ type: "messages.changed", eventId }));
  x.controller.stop();
  x.advance(100_000);
  equal(x.reconciles.length, 0, "no refresh after navigation away");
  equal(x.sockets.length, 1, "no socket after navigation away");
  console.log("PASS: No refresh/socket after messaging route exit");
  console.log("PHASE 16.19I REALTIME CLIENT RECONNECT: PASS");
}

main();
