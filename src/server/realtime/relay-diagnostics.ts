// Preview-only, fixed vocabulary; never log raw error messages, IDs, URLs or content.
const events = [
  "relay_enabled",
  "relay_disabled",
  "relay_tcp_connected",
  "relay_tcp_failed",
  "relay_tcp_auth_failed",
  "relay_tcp_permission_denied",
  "relay_tcp_tls_failed",
  "relay_tcp_timeout",
  "relay_tcp_dns_failed",
  "relay_tcp_closed",
  "relay_stream_read_started",
  "relay_stream_read_failed",
  "relay_stream_empty",
  "relay_stream_batch",
  "relay_notice_matched",
  "relay_notice_unmatched",
  "relay_route_queued",
  "relay_route_not_queued",
  "relay_socket_authorization_failed",
  "relay_socket_sent",
  "relay_socket_send_failed",
] as const;
export type RelayDiagnostic = typeof events[number];
const allowed = new Set<string>(events);
export function createRelayDiagnosticReporter(
  enabled: () => boolean,
  sink: (line: string) => void,
  clock: () => number = Date.now,
) {
  const last = new Map<RelayDiagnostic, number>();
  return (event: RelayDiagnostic) => {
    try {
      if (!enabled() || !allowed.has(event)) return;
      const now = clock();
      const previous = last.get(event);
      if (previous !== undefined && now - previous < 60_000 && now >= previous) return;
      last.set(event, now);
      sink(JSON.stringify({ component: "ims-network", schema: 1, event }));
    } catch { /* Diagnostics must not affect delivery. */ }
  };
}
export const relayDiagnostic = createRelayDiagnosticReporter(
  () => process.env.VERCEL_ENV === "preview" && process.env.IMS_PHASE22_RELAY_DIAGNOSTICS === "true",
  line => console.info(line),
);
// Classify internally; only a fixed event leaves this function.
export function classifyRelayTcpFailure(error: unknown): RelayDiagnostic {
  if (!(error instanceof Error)) return "relay_tcp_failed";
  const code = "code" in error ? String(error.code) : "";
  const detail = `${code} ${error.message}`;
  if (/WRONGPASS|NOAUTH|invalid password|authentication/i.test(detail)) return "relay_tcp_auth_failed";
  if (/NOPERM|permission/i.test(detail)) return "relay_tcp_permission_denied";
  if (/TLS|SSL|CERT|certificate/i.test(detail)) return "relay_tcp_tls_failed";
  if (/timeout|ETIMEDOUT/i.test(detail)) return "relay_tcp_timeout";
  if (/ENOTFOUND|EAI_AGAIN/i.test(detail)) return "relay_tcp_dns_failed";
  if (/closed|ECONNRESET|ECONNREFUSED/i.test(detail)) return "relay_tcp_closed";
  return "relay_tcp_failed";
}
