import { relayDiagnostic } from "./relay-diagnostics";
import {
  LocalRelayRouter,
  type RelayRouterDependencies,
} from "./local-relay-router";
import {
  SharedStreamReader,
  type StreamReadFactory,
} from "./stream-reader-core";
import { relayStreamKey } from "./relay-protocol";

export type RelayBridgeConfig = Readonly<{
  prefix: string;
  secret: string;
  connect: StreamReadFactory;
  deliverToUser: RelayRouterDependencies["deliverToUser"];
}>;

/**
 * Compose the reader and recipient router without opening a connection.
 *
 * Create ONE bridge per server Function instance (in a lazy singleton),
 * not one bridge per WebSocket. Attach only AFTER verifying the actual
 * Better Auth session, ACTIVE account status and local socket registration.
 *
 * Notifications are advisory only; PostgreSQL remains the source of truth.
 */
export function createRelayBridge(config: RelayBridgeConfig) {


  const reader = new SharedStreamReader(
    relayStreamKey(config.prefix),
    config.connect,
    (notice) => {
      // The callback executes after the first asynchronous stream read.
      const queued = router?.onNotice(notice) ?? 0;
      relayDiagnostic(queued > 0 ? "relay_route_queued" : "relay_route_not_queued");
    },
  );

  const router = new LocalRelayRouter({
    prefix: config.prefix,
    secret: config.secret,
    subscribeToRelay: (recipientKey) => reader.subscribe(recipientKey),
    deliverToUser: config.deliverToUser,
  });

  return {
    /** Never pass user input here; the caller must derive userId from session. */
    attachAuthenticatedUser(userId: string): () => void {
      return router.attach(userId);
    },
    subscriptionStats() {
      return {
        members: router.activeMemberCount(),
        socketReferences: router.activeReferenceCount(),
        streamSubscriptions: reader.subscriptionCount(),
      };
    },
    /** Read-only counters, for offline tests / trusted internal diagnostics. */
    readerCounters() {
      return reader.counters();
    },
  };
}
