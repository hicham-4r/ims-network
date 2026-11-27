# Phase 20A — Observability and failure testing

## Boundaries and privacy
Fixed event vocabulary, JSON lines, one event per name per 60 seconds per warm instance. No request metadata, exceptions, IDs, tokens, user content or provider responses are passed to the reporter. Not an exact counter and not distributed. No timers or external telemetry. The app-owned logger cannot guarantee that Next.js, Better Auth, database drivers or provider/platform logs are free of sensitive data. Inspect those separately. Do not share raw logs, query strings, headers, email addresses or SQL parameters. Auth responses returned by Better Auth are preserved; wrapper sanitizes thrown exceptions only. Do not treat 503 as evidence of a particular provider failure.

## Failure matrix
| Case | Expected | Evidence required |
|---|---|---|
| Redis limiter unavailable / timeout | protected writes fail closed; existing explicitly allowed reads keep policy | offline injected tests; live disposable deployment |
| Redis relay fails after committed message | message remains in PostgreSQL, refresh/reconnect reconciles | offline boundary test; live isolated relay trial |
| PostgreSQL unavailable | no authorization bypass; selected API boundaries return safe errors | structural checks; live isolated deployment with deliberately invalid test DB configuration |
| WebSocket disconnect | bounded reconnect and reconciliation | existing client tests; browser offline/online on protected Preview |
| Resend failure | generic recovery response; fixed delivery failure event for verified legacy account only | controlled provider test; no real recipients outside approved test mailbox |
| Blob failure | no raw exception from selected access/read paths; failed upload does not intentionally replace prior avatar | live disposable profile; check DB and Blob state; ambiguous commit outcomes still need review |
| Missing configuration | disabled features stay disabled; protected gates fail closed | offline policy tests; isolated Preview |
| Cold cache | authoritative loader used; no cache required for durable data | offline cache tests; measure real queries on isolated Preview |
| Turnstile timeout/outage | fail closed, safe 503 | offline injected test; real-key verification before launch |

Do not edit shared saved credentials, shut down shared services, revoke real keys, run load tests on production or expose a fault-injection endpoint. For live faults, use an explicitly disposable protected Preview and isolated test data, with per-deployment settings; if safe isolation cannot be established, defer the live test. Retire obsolete trial deployments. Never enable destructive maintenance just to collect metrics. Confirm normal recovery afterwards. Check Vercel Logs for fixed events and redact all other log content. For each row record timestamp, deployment, setup, expected vs observed status, durable-data check, and PASS/FAIL/NOT RUN. No claim of all-provider testing until observed.

## Resource measurement worksheet (manual, no new services)
Before a short trial, note UTC start/end, deployment identifier, provider billing/reset window and quota values as displayed. Record Vercel function invocations, active CPU time, provisioned memory time, transfer, errors; Neon compute time, storage, transfer and query stats where available; Upstash commands and transfer; Blob storage/operations/transfer. Record units and dashboard reporting lag. Separate idle, dashboard browsing, member search, messaging with relay on/off and post-close idle; keep trials isolated and short. Record counts of users/tabs/actions and actual elapsed time. For each metric subtract baseline from end; do not use negative deltas (reset/reporting delay). Do not subtract overlapping project traffic as though isolated. Record measured per-workload delta and projected monthly workload separately; projection is an estimate, not a guarantee. Stop if a quota alarm or unexpected command growth appears. Check the Blob token warning privately; never rotate shared credentials merely to induce failure.

## Remaining launch gates
Phase 19 concurrency and destructive cleanup on disposable data, actual account erasure procedure, real Turnstile keys, dependency findings, production relay policy, privileged recovery and final log review. Phase 21 owns representative 100-concurrent target and measured p50/p95, error rate, capacity and bottleneck evidence. Phase 20A is not a live outage or capacity certification.
