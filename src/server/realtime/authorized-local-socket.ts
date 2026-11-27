import { relayDiagnostic } from "./relay-diagnostics";
import type { LocalSocket } from "./local-hub";

export type AuthorizedLocalSocket = Readonly<{
  socket: LocalSocket;
  dispose(): void;
}>;

/**
 * Wrap the authenticated hub socket so that EVERY outbound relay notice
 * revalidates its individual Better Auth session and ACTIVE account.
 *
 * - Zero DB reads while idle.
 * - Multiple notices arriving during a read collapse into one refresh hint.
 * - Failures close the socket; no payload is sent on a failed authorization.
 * - A closed/disposed socket never sends after a late DB response.
 *
 * The hub's synchronous delivery count is only an attempted-notice count;
 * it must not be treated as confirmed delivery (PG reconciliation is required).
 */
export function createAuthorizedLocalSocket(
  underlying: LocalSocket,
  verify: () => Promise<boolean>,
  onRevoked: () => void,
): AuthorizedLocalSocket {
  let disposed = false;
  let running = false;
  let pending: string | null = null;

  function dispose() {
    disposed = true;
    pending = null;
  }

  function revoke() {
    if (disposed) return;
    dispose();
    try { onRevoked(); } catch { /* cleanup best effort */ }
    try { underlying.close(1008, "Session no longer active"); } catch {
      // Owner's close/error/timeout handlers perform final cleanup.
    }
  }

  async function flush() {
    if (running) return;
    running = true;
    try {
      while (!disposed && underlying.readyState === 1 && pending !== null) {
        let latest = pending;
        pending = null;

        let allowed = false;
        try { allowed = await verify(); } catch { allowed = false; }
        if (!allowed) {
          relayDiagnostic("relay_socket_authorization_failed");
          revoke();
          return;
        }
        if (disposed || underlying.readyState !== 1) return;

        // Newer events supersede older refresh hints while auth is checked.
        if (pending !== null) {
          latest = pending;
          pending = null;
        }

        try {
          underlying.send(latest);
          relayDiagnostic("relay_socket_sent");
        } catch {
          relayDiagnostic("relay_socket_send_failed");
          revoke();
          return;
        }
      }
    } finally {
      running = false;
      // No timer or busy loop: only new queued work can restart a flush.
      if (!disposed && underlying.readyState === 1 && pending !== null) {
        void flush();
      }
    }
  }

  const socket: LocalSocket = {
    get readyState() { return underlying.readyState; },
    get bufferedAmount() { return underlying.bufferedAmount; },
    send(payload: string) {
      if (disposed || underlying.readyState !== 1) return;
      // Activity is disposable. It must never overwrite an outstanding durable notice.
      if (payload.includes('"type":"chat.activity"') && (running || pending !== null)) return;
      pending = payload;
      if (!running) void flush();
    },
    close(code?: number, reason?: string) {
      dispose();
      underlying.close(code, reason);
    },
  };

  return { socket, dispose };
}
