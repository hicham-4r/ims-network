import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  emitCommittedMessageNotice,
  resolveDirectMessageRecipient,
  type MessageNoticePublisher,
} from "../src/server/messaging/message-notice-core";

async function main() {
  const sender = randomUUID();
  const recipient = randomUUID();
  const pair = { low_user_id: sender, high_user_id: recipient };

  assert.equal(resolveDirectMessageRecipient(sender, pair), recipient);
  assert.equal(resolveDirectMessageRecipient(recipient, pair), sender);
  assert.throws(() => resolveDirectMessageRecipient(randomUUID(), pair));
  assert.throws(() => resolveDirectMessageRecipient(sender, {
    low_user_id: sender, high_user_id: sender,
  }));
  assert.throws(() => resolveDirectMessageRecipient(sender, {
    low_user_id: sender, high_user_id: null,
  }));
  console.log("PASS: Recipient is selected from locked database pair only");

  const eventId = randomUUID();
  const originInstanceId = randomUUID();
  const committed = {
    insertedNewMessage: true,
    recipientUserId: recipient,
    messageId: eventId,
    originInstanceId,
  };
  const observed: unknown[] = [];
  const publish: MessageNoticePublisher = async (notice) => {
    observed.push(notice);
    return true;
  };

  assert.equal(await emitCommittedMessageNotice(committed, publish), true);
  assert.deepEqual(observed, [{
    recipientUserId: recipient,
    eventId,
    originInstanceId,
  }]);
  assert.deepEqual(Object.keys(observed[0] as object).sort(), [
    "eventId", "originInstanceId", "recipientUserId",
  ]);
  console.log("PASS: A committed new insert publishes one metadata-only notice");

  assert.equal(await emitCommittedMessageNotice({
    ...committed, insertedNewMessage: false,
  }, publish), false);
  assert.equal(observed.length, 1);
  console.log("PASS: Idempotent replay creates no additional notice");

  const fail: MessageNoticePublisher = async () => {
    throw new Error("Simulated Redis failure");
  };
  assert.equal(await emitCommittedMessageNotice(committed, fail), false);
  assert.equal(await emitCommittedMessageNotice(committed, async () => false), false);
  console.log("PASS: Redis unavailable/rejected cannot fail a committed message");
  console.log("PHASE 16.19B MESSAGE NOTIFICATION: PASS");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
