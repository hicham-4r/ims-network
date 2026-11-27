import assert from "node:assert/strict";

import {
  checkSocketSessionAccess,
  type SocketAccessRecord,
} from "../src/server/realtime/socket-access-core";
import {
  createAuthorizedLocalSocket,
} from "../src/server/realtime/authorized-local-socket";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function tick() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function mockSocket() {
  return {
    readyState: 1,
    bufferedAmount: 0,
    frames: [] as string[],
    closeCode: 0,
    send(payload: string) { this.frames.push(payload); },
    close(code = 1000) { this.closeCode = code; this.readyState = 3; },
  };
}

async function main() {
  const identity = { userId: "alice", sessionId: "session-a" };
  const valid: SocketAccessRecord = {
    ...identity,
    expiresAt: new Date("2030-01-01T00:00:00Z"),
    accountStatus: "ACTIVE",
  };
  const now = new Date("2026-11-15T00:00:00Z");

  let queries = 0;
  const lookup = async () => { queries++; return valid; };
  assert.equal(await checkSocketSessionAccess(identity, lookup, now), true);
  assert.equal(queries, 1);
  assert.equal(await checkSocketSessionAccess({ ...identity, sessionId: "wrong" }, lookup, now), false);
  assert.equal(await checkSocketSessionAccess({ ...identity, userId: "other" }, lookup, now), false);
  console.log("PASS: Valid exact session and account only");

  for (const record of [
    null,
    { ...valid, accountStatus: "SUSPENDED" },
    { ...valid, accountStatus: "REJECTED" },
    { ...valid, accountStatus: "PENDING_APPROVAL" },
    { ...valid, expiresAt: now },
    { ...valid, expiresAt: new Date("invalid") },
  ]) {
    assert.equal(await checkSocketSessionAccess(identity, async () => record, now), false);
  }
  assert.equal(await checkSocketSessionAccess(identity, async () => { throw new Error("DB down"); }, now), false);
  assert.equal(await checkSocketSessionAccess({ userId: " ", sessionId: "session-a" }, lookup, now), false);
  console.log("PASS: Pending, revoked, suspended, expired and DB outage fail closed");

  const allowedSocket = mockSocket();
  let checked = 0;
  const allowed = createAuthorizedLocalSocket(allowedSocket, async () => { checked++; return true; }, () => {});
  allowed.socket.send("notice-one");
  await tick();
  assert.deepEqual(allowedSocket.frames, ["notice-one"]);
  assert.equal(checked, 1);
  allowed.dispose();
  console.log("PASS: Authorized notification delivered with one query");

  const disabledSocket = mockSocket();
  let revoked = 0;
  const denied = createAuthorizedLocalSocket(disabledSocket, async () => false, () => { revoked++; });
  denied.socket.send("sensitive-notice");
  await tick();
  assert.equal(disabledSocket.frames.length, 0);
  assert.equal(disabledSocket.closeCode, 1008);
  assert.equal(revoked, 1);
  denied.socket.send("after-revoke");
  await tick();
  assert.equal(disabledSocket.frames.length, 0);
  console.log("PASS: Suspended/revoked socket never receives notification");

  const pendingAuth = deferred<boolean>();
  const slowSocket = mockSocket();
  let slowChecks = 0;
  const slow = createAuthorizedLocalSocket(slowSocket, () => {
    slowChecks++;
    return pendingAuth.promise;
  }, () => {});
  slow.socket.send("hint-1");
  slow.socket.send("hint-2");
  slow.socket.send("hint-3");
  assert.equal(slowChecks, 1);
  pendingAuth.resolve(true);
  await tick();
  assert.deepEqual(slowSocket.frames, ["hint-3"]);
  slow.dispose();
  console.log("PASS: Bursts coalesce into one authorized refresh hint");

  const expiredAuth = deferred<boolean>();
  const closedSocket = mockSocket();
  const closed = createAuthorizedLocalSocket(closedSocket, () => expiredAuth.promise, () => {});
  closed.socket.send("late-hint");
  closed.dispose();
  expiredAuth.resolve(true);
  await tick();
  assert.deepEqual(closedSocket.frames, []);
  console.log("PASS: No late send after socket cleanup");

  const outageSocket = mockSocket();
  const outage = createAuthorizedLocalSocket(outageSocket, async () => { throw new Error("DB unavailable"); }, () => {});
  outage.socket.send("never");
  await tick();
  assert.equal(outageSocket.frames.length, 0);
  assert.equal(outageSocket.closeCode, 1008);
  console.log("PASS: Authorization check failures close connections");

  console.log("PHASE 16 SOCKET ACCESS: PASS");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
