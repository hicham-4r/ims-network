# Engineering evidence and infrastructure budget

## Historical measured trials

| Trial | Result | Scope and limitations |
| --- | --- | --- |
| Phase 21F/G HTTP baseline | 300/300 successes; p50 1172 ms, p95 2289 ms, max 3190 ms | 100 distinct accounts, three waves; not sustained traffic |
| Later sustained HTTP trial | 300/300; median 231 ms, p95 1217 ms (reported) | Separate trial; not directly comparable to baseline |
| Phase 21JB, 26 Nov 2026 | 100/100 ready, confirmed overlap 100 for 60.076 s; p50 1336 ms, p95 1745 ms, max 2027 ms | Historical protected Preview with relay enabled at that time; no measured fan-out or monthly capacity claim |
| Production functional and realtime acceptance | Maintainer reported two-account delivery and reconnect after lease | Bounded functional checks, not a load benchmark |

The 100-socket trial is a high-end stress scenario, not expected normal traffic. No fabricated uptime, Lighthouse, active-user or throughput figures. Keep future benchmarks scoped by deployment, commit, workload, duration and counters.

## Pre-launch snapshot (28 Nov 2026, about 04:31 Morocco time)

| Metric | Before first Production deployment (27 Nov) | Final pre-launch |
| --- | --- | --- |
| Vercel fast data transfer | 78.23 MB | 88.18 MB |
| Vercel fast origin transfer | 45.37 MB | 50.67 MB |
| Vercel CDN requests | 13K | 15K |
| Vercel function invocations | 5.2K | 5.6K |
| Vercel active CPU | 28m 33s | 29m 58s |
| Vercel provisioned memory | 5.6 GB-h | 6.0 GB-h |
| Vercel build CPU | 1h 28m | 1h 44m |
| Neon Production compute | 0.1 CU-h | 0.46 CU-h |
| Neon Production storage | 33.01 MB | 33.21 MB |
| Redis commands | 9.1K | 11K / 500K displayed |
| Redis bandwidth | 747 KB | 885 KB |
| Redis storage | 17 KB | 23 KB |
| Redis cost shown | $0.00 | $0.00 |

These are dashboard snapshots reviewed during acceptance; Vercel/Redis counters may include earlier activity and may lag. Deltas are not isolated test consumption. No paid upgrade was needed at launch. The $0/month objective is conditional on actual use, plan terms and eligibility; not a guarantee of perpetual zero cost or availability. Redis idle-connection behavior was not independently established by the usage snapshots.

## Strategy

Use bounded indexed reads, revision-based cache and fresh authorization, request-scoped session deduplication, lazy sockets, bounded stream reader, no idle presence heartbeat, and measured resource increases for useful UI. Watch active CPU, Redis command rates, database compute and connection trends first. Keep provider billing windows and current allowances in view; do not extrapolate a short trial into a monthly forecast.

Provider references (check current limits): https://vercel.com/docs/plans/hobby ; https://neon.com/pricing ; https://upstash.com/pricing/redis ; https://docs.github.com/en/billing/concepts/product-billing/github-actions .
