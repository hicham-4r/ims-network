# Phase 16.19J — Redis relay cost and failure preflight

## Contract and intent

- Keep `IMS_PHASE16_RELAY_ENABLED` **absent or false** until Preview-only live-trial approval.
- One lazy stream reader **per Function instance with active local recipients**, never a global reader. Zero active subscribers means zero read work.
- One browser-tab application WebSocket while messaging is active; never attach on dashboard, directory, or profile.
- Redis stream notices are disposable hints; **PostgreSQL owns durable messages** and the client re-fetches after reconnect.
- The reader is paced after unexpectedly early empty XREAD responses. Persistently failing connections back off up to 120 seconds rather than retrying indefinitely every 8 seconds.
- No new logs containing cookies, authentication tokens, recipient keys, user IDs, Redis URLs, message bodies, or private message content.

## Risks and tradeoffs

1. Redis XREAD with BLOCK 30 seconds normally costs a read per 30 seconds per active reader. Upstash Free advertised 500,000 commands/month as of 2026-11-22; **revalidate the provider limit at trial time**.
2. One continuous reader: ~86,400 reads per 30-day month. Six continuous readers: ~518,400 reads before publications, caching or rate limiting. These are projections, not measured billing.
3. Rapid empty replies can exhaust quotas if unpaced. This patch enforces the intended 30-second idle-read cadence even if upstream responds immediately.
4. When Redis fails, automatic retry is bounded to 120 seconds after repeated failures. This can delay live notifications after an outage; message durability is unaffected, because PostgreSQL is authoritative and the browser reconciles on reconnect.
5. If the 30-second trial socket lifetime remains enabled, the client can reach a five-minute reconnect delay. **Do not claim realtime readiness until the server/client policy is tuned and measured on Preview.**
6. Vercel CPU, memory, connection counts, and auth DB reads must be measured from the actual Preview deployment. A monthly Redis projection alone cannot guarantee $0.

## Measuring and projecting

Run from `C:\dev\ims-network`:

```powershell
npx --no-install tsx .\tools\report-phase16-relay-budget.ts 2 0.5 100 1000 1
```

This is an illustrative scenario (**not** a measurement): 2 average concurrent reader instances, each active 0.5 hours/day, 100 daily publications, 1,000 other Redis commands/day, and 1 recipient socket per notice. Adjust these values after looking at the Upstash dashboard and actual observed connections.

Record: daily active-reader hours, max concurrent Function instances, Redis usage before/after a short controlled run, DB auth reads per delivered notice, Function CPU/duration/memory, and reconnect count per messaging tab.

Recommended quota decision: review trend near 50-60%; reduce optional traffic near 75-80%; never disable security or durable storage to avoid paid usage.

## Preview integration gate (NOT performed by this patch)

- Non-production Neon and Upstash resources independently verified.
- Negative authentication/authorization tests, including revoked/suspended accounts, pass.
- `/api/ws` still rejects invalid origin, query tokens, oversized frames and unauthorized handshakes.
- One socket per active messaging tab; zero on other routes; detached sockets produce no Redis calls.
- Two authorized test members exchange actual durable messages; Redis interruption/reconnect catches up from PostgreSQL.
- Logs do not leak secrets; command count measured under a documented scenario.
- Only then consider enabling the Preview-only relay for a strictly bounded trial with explicit approval.
