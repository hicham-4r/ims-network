# Phase 16.19K–L: offline reliability integration checkpoint

**Scope:** local branch `feat/realtime-phase16`; no provider access, no migration,
no Redis flags, no Vercel deployment and no Git push.

## Why the larger batch

- A WebSocket that opens but never receives server `ready` previously occupied the
  tab's single socket slot forever. A 15-second no-ready watchdog now closes it
  and schedules bounded reconnect using the existing exponential backoff.
  Stale close/ready callbacks cannot override newer socket state.
- The Redis Stream reader already paced `null` early empty replies in 19J; now it
  also paces valid zero-entry batch replies, preventing potential command storms.
- Per-Function relay reader counters provide a **local signal**, not billed
  Upstash/Vercel measurements. They never record identities, secrets or bodies.
- A fake Redis transport exercises two different relay bridges with matching
  HMAC keys, a committed message, recipient isolation, repeated event IDs,
  session revocation, and last-detach cleanup. It does not prove live delivery.

## Non-negotiable invariants

1. PostgreSQL is durable truth; no Redis payload has message body or user email.
2. Never send a notification after an invalid Better Auth session check.
3. One app socket per visible messaging tab, zero app sockets on other routes.
4. Redis reader exists only for subscribed recipients; last detach cancels reads.
5. No background heartbeat/presence and no auth database polling while idle.
6. Reconnect and notification traffic remain bounded; no silent permanent hang.
7. A redis outage or duplicate event must not result in loss of persisted data.
8. Trial hard server lifetime remains 30 seconds; do NOT enable live relay yet.

## Verification

The Phase 16.19J suite is the prerequisite. From project PowerShell:

```powershell
& '.\tools\test-phase16-preflight.ps1' -Full
```

New tests: `test-phase16-handshake-watchdog.ts`,
`test-phase16-reader-counters.ts`, `test-phase16-offline-cross-instance.ts`.

## Remaining Preview integration gates

- Test the actual Preview database isolation and nonproduction account state;
  no secrets or session tokens in logs.
- Determine whether the server's 30-second trial lifetime should be replaced by
  a longer bounded lifecycle, **with observed Vercel function duration/cost**;
  current 5-minute backoff after repeated short-lived sessions can harm latency.
- Turn on relay only for a separately approved short Preview trial, measure
  Upstash commands, WS connections, auth reads, CPU and memory, and keep kill
  switch. Do not extrapolate raw in-memory counters as provider invoices.
- Real two-user chat: send, receive, read/unread, duplicate/reconnect,
  suspension/logout, Redis outage, no cross-user data leakage; demonstrate PG
  reconciliation after missed events.
- Verify browser visibility/route exit + 100 user model before any capacity claim.

## Deployment gate

Once offline suite passes and the above provider isolation is confirmed, combine
this milestone with the outstanding server-lifetime policy in **one** explicit
Preview deployment. No independent Vercel Development deployment.
