// Fixed event names only. No arbitrary metadata, errors, request data or identifiers.
const events = [
  "auth_internal_error", "auth_internal_warning",
  "auth_handler_unavailable", "session_lookup_failed", "rate_limit_unavailable",
  "relay_publish_failed", "relay_attach_failed", "socket_access_unavailable",
  "avatar_access_unavailable", "avatar_upload_failed", "avatar_read_failed",
  "avatar_cleanup_failed", "password_reset_delivery_failed", "maintenance_failed",
  "recovery_failed", "privacy_failed",
] as const;
export type FailureEvent = typeof events[number];
const allowed: ReadonlySet<string> = new Set(events);
const intervalMs = 60_000;

// Instance-local suppression: bounded by the static event vocabulary. No timer,
// network, Redis, or DB dependency. Not a distributed counter or exact rate metric.
export function createFailureReporter(
  sink: (line: string) => void,
  clock: () => number = Date.now,
): (event: FailureEvent) => void {
  const last = new Map<FailureEvent, number>();
  return event => {
    if (!allowed.has(event)) return;
    try {
      const now = clock();
      const previous = last.get(event);
      if (previous !== undefined && now >= previous && now - previous < intervalMs) return;
      last.set(event, now);
      sink(JSON.stringify({ component: "ims-network", schema: 1, level: "warn", event }));
    } catch {
      // Telemetry cannot change request results, even if the sink fails.
    }
  };
}
export const reportFailure = createFailureReporter(line => console.warn(line));
