# Phase 16.19N: Preview relay trial — read this before enabling

## What this patch does, and DOES NOT do

- Preview-only coordinated gate: `VERCEL_ENV=preview` + WS flag true + RELAY flag true + `ims-network:v1:preview` Redis namespace.
- WS-only smoke-test socket remains a **30-second** trial. Preview relay trials get a **150-second** bounded lease to exceed the client's 120-second stability threshold. Both use graceful 1001 closing with a 2-second fallback.
- The relay flag is **not enabled by this patch**. No provider settings or DB migrations are changed. Production remains untouched.
- This improves trial UX but does **not** prove $0 running costs or live delivery. Each active Redis reader can use one XREAD per 30 seconds. Multiple Vercel instances mean multiple readers.

## Mandatory preflight (do not paste credentials in chat)

1. Keep current working Git branch `feat/realtime-phase16`. Confirm latest Phase 16 J/K/L/H/I files and Phase N tests pass.
2. Confirm Preview's `DATABASE_URL`/`DATABASE_URL_POOLED` are on the intended non-production Neon branch; migrations applied; test member ACTIVE. Do not connect to Production DB. If unverified, STOP.
3. Verify Vercel project is the existing `cybotics/ims-network` Hobby account and Preview protection is on.
4. Confirm the Upstash REST URL/token and TCP `rediss://` URL are the **same intended Preview-safe Redis DB**, not two unrelated databases. The TCP URL is server-only, TLS and Preview-scoped; never paste it, put it in the project, or log it.
5. If Preview shares a single free Redis DB with another environment, confirm namespace isolation and cumulative command quota; use a physically distinct free resource only when available (Upstash Free may restrict account count). Do not share Production Redis data/credentials casually.
6. Verify `IMS_PHASE16_WS_ENABLED=true` in Preview. Keep `IMS_PHASE16_RELAY_ENABLED` false/absent until the short live trial. Missing TCP URL must fail closed.
7. Check Upstash current monthly command counter, Vercel current function memory/CPU baseline and remaining Hobby budget. Write down UTC start/stop and current counters; don't assume 500k is unused. Use `npx --no-install tsx .\tools\report-phase16-live-trial-budget.ts` as an *illustration* only.
8. Run `.\tools\test-phase16-live-trial-preflight.ps1 -Full` (normal build may reach configured services). Do not run deployments automatically.

## One controlled Preview deployment AFTER approving/confirming the above

Prefer **per-deployment** explicit flags, without changing Production or saved long-lived flags. Use current Vercel CLI syntax as validated at the time of deployment. The operator runs `vercel deploy --environment=preview --env IMS_PHASE16_RELAY_ENABLED=true --build-env IMS_PHASE16_RELAY_ENABLED=true` **only for a short, manually supervised trial**. This creates a Preview deployment; it does not overwrite old Preview URLs. Existing protected links could continue serving the trial until their sessions naturally close; the 150s lease bounds each current socket, but it does not disable new opens if someone continues visiting that URL. Keep trial URL private; do not rely on a mere later 'off' deployment to revoke old test URLs. End trial by disabling relay on that URL or deleting the trial deployment where supported, plus ensuring all old active sessions terminate, before assuming zero usage.

## Live acceptance, minimally sufficient

A. Verify unauthorized GET/upgrade/origin and URL-token security still reject. Check auth on each connection. No tokens in URLs/logs.
B. In **one ACTIVE test member** messaging page: exactly one app WS, `ready`, 0 WebSockets on dashboard/directory; moving between conversations reuses the socket, leaving messages closes it. Browser visibility background stops it. No Redis reader while no subscriber.
C. With **two authorized ACTIVE test accounts** in separate browser profiles/tabs, send a new direct message from A to B. Confirm PostgreSQL stored it, B updates live only in the authorized chat/inbox, no content in Redis notice, read/unread correct. Repeat same `clientMessageId` and confirm no duplicate durable row or XADD. Without a second account, don't claim cross-user success.
D. Disconnect B, send a message while absent, reconnect B. Validate message appears from PostgreSQL and that no transient Redis history is required; no loss/duplication/out-of-order updates.
E. Test revoked/suspended/rejected account using a safely authorized admin workflow in Preview; notifications must fail closed. Note: idle sockets do not proactively poll account state; revocation is checked on notices and each new connection.
F. Simulate Redis unavailability **only against Preview-safe resources**; already-committed PostgreSQL messages remain present. Do not delete DB contents, rotate credentials, or disable Production resources.
G. Observe stream-reader count per active Function, read/command delta over trial minutes, Function active CPU and provisioned memory, WS open/close and auth DB checks. No global 100-user capacity claim from two browsers.
H. Kill switch: stop visits to trial Preview, explicitly disable relay for follow-up builds, close test tabs, and use Vercel controls to remove the trial deployment if necessary; confirm Upstash counters stop rising once all trial sockets close. Verify project Preview default flags have not been persistently enabled.

## Hard stop conditions

- Any Preview connection to Production database/Redis or unknown environment;
- no authorized second test member for claims of two-user behavior;
- unexpected auth/session failures, permission bypass, private data in Redis/logs;
- Redis command storms or increasing reads with zero messaging subscribers;
- memory/CPU runaway, uncontrolled reconnect loops, unexpected billable plan;
- idempotency errors, lost messages, leaks across recipients.

## Cost and known limits (verify current official docs before trial)

As of November 2026: Upstash Redis Free advertises about 500,000 commands/month; Vercel Hobby Fluid Functions max 300 seconds and allowance around 360 GB-hours/month. Model input assumptions are illustrative, not provider-invoiced data. A 150-second active WebSocket holds memory longer, while it reduces churn and backoff risk; measure both. Redis command rate per active reader is at least approximately 120 reads/hour in the fully blocked idle case, plus publishing/other Redis uses. Reader counters represent local attempts, not global provider billing.
