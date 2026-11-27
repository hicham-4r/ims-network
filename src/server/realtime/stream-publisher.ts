import "server-only";
import { reportFailure } from "@/server/observability/safe-events";

import { serverEnv } from "@/server/env";
import {
  redis,
  redisKeyPrefix,
} from "@/server/redis/client";

import {
  appendRelayNoticeIfEnabled,
} from "./stream-publisher-core";

export type PublishMessageNoticeInput = {
  recipientUserId: string;
  eventId: string;
  originInstanceId: string;
  activity?: { conversationId: string; kind: "typing" | "active"; expiresAt: number };
};

// Best-effort notification only.
// The authenticated messaging service must persist the
// message in PostgreSQL before invoking this function.
//
// Redis failure cannot undo a committed message.
// Reconnected clients will reconcile from PostgreSQL.
export async function publishMessageNotice(
  input: PublishMessageNoticeInput,
): Promise<boolean> {
  if (input.activity && process.env.IMS_PHASE22_CHAT_ACTIVITY !== "true") return false;
  const client = redis;

  try {
    return await appendRelayNoticeIfEnabled(
      {
        VERCEL_ENV: process.env.VERCEL_ENV,
        IMS_PHASE16_WS_ENABLED: process.env.IMS_PHASE16_WS_ENABLED,
        IMS_PHASE16_RELAY_ENABLED: process.env.IMS_PHASE16_RELAY_ENABLED,
      },
      client
        ? (key, id, fields, options) =>
            client.xadd(key, id, fields, options)
        : null,
      {
        prefix: redisKeyPrefix,
        secret: serverEnv.BETTER_AUTH_SECRET,
        recipientUserId: input.recipientUserId,
        eventId: input.eventId,
        originInstanceId: input.originInstanceId,
        activity: input.activity,
      },
    );
  } catch {
    // Never include Redis credentials, raw user IDs,
    // private messages, or connection strings in logs.
    reportFailure("relay_publish_failed");
    return false;
  }
}