import "server-only";
import { relayDiagnostic } from "./relay-diagnostics";

import { serverEnv } from "@/server/env";
import { redisKeyPrefix } from "@/server/redis/client";

import { deliverLocalNotice } from "./local-hub";
import { createRelayBridge } from "./relay-bridge";
import { createLazyRelayAttacher } from "./relay-runtime-core";
import { createConfiguredTcpReaderFactory } from "./stream-reader-tcp";
import { isPreviewRelayActive } from "./relay-activation-policy";

// Constructed once per module/Function instance, never per WebSocket.
// The underlying reader starts only on the first attached member and stops
// when the last member detaches. No TCP connection is made on module import.
const attachLazy = createLazyRelayAttacher(() =>
  createRelayBridge({
    prefix: redisKeyPrefix,
    secret: serverEnv.BETTER_AUTH_SECRET,
    connect: createConfiguredTcpReaderFactory(),
    deliverToUser: deliverLocalNotice,
  }),
);

/**
 * Only call AFTER Better Auth + ACTIVE-account validation and successful
 * local socket registration. The user ID must come from the server session.
 *
 * This feature gate is deliberately separate from the WS handshake gate.
 * No live Redis reader is allowed until a later, explicit Preview-only rollout.
 */
export function attachRelayForAuthenticatedSocket(userId: string): () => void {
  const enabled = isPreviewRelayActive({
    VERCEL_ENV: process.env.VERCEL_ENV,
    IMS_PHASE16_WS_ENABLED: process.env.IMS_PHASE16_WS_ENABLED,
    IMS_PHASE16_RELAY_ENABLED: process.env.IMS_PHASE16_RELAY_ENABLED,
  }, redisKeyPrefix);
  relayDiagnostic(enabled ? "relay_enabled" : "relay_disabled");
  return attachLazy(userId, enabled);
}
