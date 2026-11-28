# Portfolio case study — IMS Network

**Project maintainer:** [hicham-4r](https://github.com/hicham-4r)

**Live:** https://ims-network.vercel.app

**Release:** v1.0.0, 28 November 2026.

## Problem and approach

Build a private professional space for ESITH IMS alumni: discover peers, share professional profiles, communicate and moderate community participation without unnecessary infrastructure cost. The solution is a full-stack, responsive PWA with explicit administrative approval and independent verification of alumni eligibility.

## Design decisions and trade-offs

| Challenge | Decision | Trade-off |
| --- | --- | --- |
| Private membership | Separate authentication from ACTIVE account authorization | Approval is manual |
| Durable chat and reliability | PostgreSQL persistence, optimistic UUID-based sends and bounded reconciliation | Relay is best effort; receipts are scoped |
| Cross-instance realtime | TLS Redis stream reader and lazy WebSockets | Bounded lease, not permanent presence |
| Free-tier isolation | Production-only Redis; protected Preview PostgreSQL limiter | Preview uses manual message refresh |
| Account recovery without verification | Single-use member codes; verified-address owner recovery | Recovery is not guaranteed without saved credentials or code |
| Browser performance | Request-scoped auth, revision-based cache, responsive UI | Security checks remain necessary even when they cost queries |
| Operational reliability | Guarded source bundles, exact migrations, CI and manual release | Explicit release review instead of automatic cloud mutations |

An authentication incident was identified during controlled Production acceptance: a request-time session query ran into prerendering cancellation and framework logging exposed sensitive parameters. A targeted request boundary and safe logger were implemented, potentially exposed sessions revoked, and Preview/Production retested before launch. This is a useful case study in fixing both correctness and observability, without publishing the original logs.

## Evidence and demonstrations

Historical tests include 300/300 HTTP reads and 100/100 socket readiness with 60.076 seconds of confirmed overlap. These are scoped trials, not production throughput or sustained monthly capacity. The maintainer reported successful public launch and PWA checks. See [performance evidence](phase23-performance-evidence.md) and [release acceptance](phase26-release-evidence.md).

For portfolio screenshots, use isolated synthetic accounts (not live alumni), redact identifiers and browser chrome, and capture dashboard, directory, chat, mobile layout and moderation. Do not commit private screenshots, actual messages, recovery links, tokens or provider dashboards. No screenshots are included in this bundle. Explain limitations rather than inventing metrics or implying institutional endorsement.

## Suggested short portfolio description

Designed and developed IMS Network, an independent full-stack alumni networking PWA for ESITH IMS. Built secure membership approval, professional discovery, realtime private messaging, account recovery and moderation using Next.js, TypeScript, PostgreSQL and Redis, with automated CI and measured free-tier infrastructure usage. Launched the initial public version after controlled Production and PWA acceptance.
