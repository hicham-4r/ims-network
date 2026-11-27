import { reportFailure } from "@/server/observability/safe-events";
import {
  experimental_upgradeWebSocket,
} from "@vercel/functions";

import {
  requireActiveMember,
} from "@/server/account-state";

import {
  AccountAccessError,
} from "@/server/account-state/errors";

import {
  AuthenticationRequiredError,
} from "@/server/auth/session";




import { registerLocalSocket } from "@/server/realtime/local-hub";

import { attachRelayForAuthenticatedSocket } from "@/server/realtime/relay-runtime";

import { createAuthorizedLocalSocket } from "@/server/realtime/authorized-local-socket";
import { verifySocketSessionAccess } from "@/server/realtime/socket-access-db";
import { createSocketDeadline } from "@/server/realtime/socket-deadline";
import { previewSocketLifetimeMs } from "@/server/realtime/relay-activation-policy";
import { redisKeyPrefix } from "@/server/redis/client";

const privateHeaders = {
  "Cache-Control": "no-store",
};

function reject(status: number, message: string) {
  return new Response(message, {
    status,
    headers: privateHeaders,
  });
}

export async function GET(request: Request) {
  // Explicitly disabled outside Preview and until enabled.
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.IMS_PHASE16_WS_ENABLED !== "true"
  ) {
    return reject(404, "Not found");
  }

  const hostname = process.env.VERCEL_URL;

  if (!hostname) {
    return reject(503, "Unavailable");
  }

  // A WebSocket must originate from this exact deployment.
  if (
    request.headers.get("origin") !==
    `https://${hostname}`
  ) {
    return reject(403, "Forbidden");
  }

  // Reject non-WebSocket requests.
  if (
    request.headers.get("upgrade")?.toLowerCase() !==
    "websocket"
  ) {
    return reject(426, "WebSocket upgrade required");
  }

  // No URL-supplied authentication credentials.
  if (new URL(request.url).search) {
    return reject(400, "Invalid request");
  }

  let actorUserId = "";
  let actorSessionId = "";

  try {
    // Identity comes only from Better Auth.
    const { session } = await requireActiveMember();
    actorUserId = session.user.id;
    actorSessionId = session.session.id;
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return reject(401, "Authentication required");
    }

    if (error instanceof AccountAccessError) {
      return reject(403, "Access denied");
    }

    // Do not convert unexpected database/auth failures
    // into successful WebSocket upgrades.
    reportFailure("socket_access_unavailable");
    return reject(503, "Realtime temporarily unavailable");
  }

  return experimental_upgradeWebSocket((ws) => {
    // Register synchronously before handling frames.
    // Authorization is revalidated before each outgoing relay notice,
    // not on an idle polling timer. Each session is checked individually.
    const authorized = createAuthorizedLocalSocket(
      ws,
      () => verifySocketSessionAccess({
        userId: actorUserId,
        sessionId: actorSessionId,
      }),
      () => release(),
    );
    const unregister = registerLocalSocket(actorUserId, authorized.socket);

    if (!unregister) {
      authorized.dispose();
      ws.close(1013, "Connection capacity reached");
      return;
    }

    // Relay stays OFF until explicitly enabled on Preview. The socket
    // is already registered against its Better Auth session identity.
    let detachRelay: () => void;
    try {
      detachRelay = attachRelayForAuthenticatedSocket(actorUserId);
    } catch {
      reportFailure("relay_attach_failed");
      authorized.dispose();
      unregister();
      ws.close(1013, "Realtime unavailable");
      return;
    }

    // WS-only trial: 30s; explicitly enabled Preview relay trial: 150s.
    // Both close gracefully, with bounded teardown if the peer stalls.
    // No Redis/DB polls or new background timers beyond this socket lifetime.
    const deadline = createSocketDeadline({
      schedule(callback, delayMs) {
        return setTimeout(callback, delayMs);
      },
      cancel(timer) {
        clearTimeout(timer);
      },
      cleanup() {
        authorized.dispose();
        try {
          detachRelay();
        } finally {
          unregister();
        }
      },
      closeGracefully() {
        ws.close(1001, "Socket lifetime reached");
      },
      forceTerminate() {
        ws.terminate();
      },
    }, previewSocketLifetimeMs({
      VERCEL_ENV: process.env.VERCEL_ENV,
      IMS_PHASE16_WS_ENABLED: process.env.IMS_PHASE16_WS_ENABLED,
      IMS_PHASE16_RELAY_ENABLED: process.env.IMS_PHASE16_RELAY_ENABLED,
    }, redisKeyPrefix));

    const release = deadline.dispose;

    ws.on("message", () => {
      // Sending over WebSocket is not enabled yet.
      ws.close(1008, "Protocol not enabled");
    });

    ws.on("close", release);

    ws.on("error", () => {
      release();
      ws.terminate();
    });

    try {
      ws.send(JSON.stringify({
        type: "ready",
        version: 1,
      }));
    } catch {
      release();
      ws.terminate();
    }
  }, {
    maxPayload: 4096,
  });
}