# Engineering evidence and infrastructure budget

## Measurements

| Evidence | Result | Limitations |
| --- | --- | --- |
| Phase 21F/G HTTP baseline | 300/300 successes; p50 1172 ms, p95 2289 ms, max 3190 ms | 100 distinct accounts, three waves; not sustained traffic, not final UI |
| Phase 21JB socket test, 2026-11-26 | 100 distinct, 100 ready, peak confirmed overlap 100; held 60076 ms; p50 1336 ms, p95 1745 ms, max 2027 ms readiness | Protected Preview; 0 unexpected notices, cleanup reported 100 suspended and 0 remaining. Does not measure message fan-out or monthly active use. |
| Phase 22 | Maintainer reported working final Preview | No independently captured final cross-browser or Lighthouse results |

The 100-socket test is a high-end stress scenario, not expected normal traffic. Keep workload, deployment, test duration, warm-up and resource snapshots with any future benchmark. Do not extrapolate to continuous monthly activity.

## Last observed historical provider snapshot (2026-11-27, before later community/polish deployments)

| Provider metric | Value |
| --- | --- |
| Vercel active CPU | 26m 52s |
| Vercel build CPU | 1h 18m |
| Vercel provisioned memory | 5.1 GB-h |
| Vercel function invocations | 4.9K |
| Vercel fast data transfer | 73.08 MB |
| Neon compute | 2.7 CU-h |
| Neon storage | 33.8 MB |
| Redis commands | 7.6K / 500K displayed |
| Redis storage | 9 KB / 250 MB displayed |
| Redis cost | $0.00 displayed |

Counters are cumulative and may lag; this is not current usage or isolated benchmark consumption. Review fresh counters before any live test. Track the provider's actual billing cycle and included quotas. GitHub Actions adds a separate compute budget; private repositories can incur charges after included usage. Set spending limits before running CI. Vercel Hobby eligibility is personal/noncommercial; confirm suitability for the actual alumni rollout, not just the portfolio demo. No paid service is added by this patch, but sustained cost cannot be guaranteed.

## Strategy

Prefer bounded, indexed queries, request-scoped auth, revision-based cache, lazy socket activation, shared bounded reader, no idle presence heartbeat, batched delivery notices and small client-side animations. Keep privacy/security checks even when they cost requests. Target a useful dashboard and avatars, not minimum possible requests. Use one Preview deployment per accepted feature batch. Reserve larger load tests for release gate.

Provider references (check current terms and limits): https://vercel.com/docs/plans/hobby ; https://docs.github.com/en/billing/concepts/product-billing/github-actions ; https://neon.com/pricing ; https://upstash.com/pricing/redis .
