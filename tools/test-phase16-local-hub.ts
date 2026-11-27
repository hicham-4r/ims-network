import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  registerLocalSocket,
  deliverLocalNotice,
  localSocketCount,
} from "../src/server/realtime/local-hub";

function mockSocket() {
  return {
    readyState: 1,
    bufferedAmount: 0,
    frames: [] as string[],
    closeCode: 0,

    send(payload: string) {
      this.frames.push(payload);
    },

    close(code = 1000) {
      this.closeCode = code;
      this.readyState = 3;
    },
  };
}

const alice = mockSocket();
const bob1 = mockSocket();
const bob2 = mockSocket();
const outsider = mockSocket();

const cleanup: Array<() => void> = [];

function attach(userId: string, socket: ReturnType<typeof mockSocket>) {
  const dispose = registerLocalSocket(userId, socket);
  assert.ok(dispose, "Expected registration to succeed.");
  cleanup.push(dispose);
}

try {
  attach("alice", alice);
  attach("bob", bob1);
  attach("bob", bob2);
  attach("outsider", outsider);

  assert.equal(localSocketCount(), 4);
  console.log("PASS: Socket registration");

  const notice = {
    type: "messages.changed" as const,
    eventId: randomUUID(),
  };

  assert.equal(deliverLocalNotice("bob", notice), 2);
  assert.equal(bob1.frames.length, 1);
  assert.equal(bob2.frames.length, 1);
  assert.equal(alice.frames.length, 0);
  assert.equal(outsider.frames.length, 0);

  console.log("PASS: Member-scoped notification isolation");

  const bob3 = mockSocket();
  attach("bob", bob3);

  const excess = mockSocket();
  assert.equal(registerLocalSocket("bob", excess), null);

  console.log("PASS: Per-member connection limit");

  assert.throws(() => registerLocalSocket("", mockSocket()));
  assert.throws(() => registerLocalSocket("bob", bob1));

  console.log("PASS: Invalid and duplicate registration rejected");

  const slow = mockSocket();
  slow.bufferedAmount = 65 * 1024;
  attach("slow-member", slow);

  assert.equal(deliverLocalNotice("slow-member", notice), 0);
  assert.equal(slow.closeCode, 1013);

  console.log("PASS: Slow consumer disconnected");

  assert.equal(deliverLocalNotice("missing", notice), 0);
  assert.throws(() => deliverLocalNotice("bob", {
    type: "messages.changed",
    eventId: "invalid",
  }));

  console.log("PASS: Invalid notification rejected");
} finally {
  for (const dispose of cleanup.reverse()) {
    dispose();
    dispose();
  }
}

assert.equal(localSocketCount(), 0);
console.log("PASS: Complete connection cleanup");
console.log("PHASE 16 LOCAL HUB: PASS");