# Hobby-Tier Budget

## Status

Initial planning document.

Actual provider quotas, pricing, and limits must be checked against current official provider documentation before a cost-sensitive implementation decision.

## Goal

Keep IMS Network practical for a personal, non-commercial Vercel Hobby deployment while maintaining a clean upgrade path if measured usage later requires a different plan.

## General Principles

- measure before optimizing
- avoid unnecessary infrastructure
- keep durable data in PostgreSQL
- use Redis only where it removes meaningful work or enables required coordination
- do not keep real-time connections open merely because a user is authenticated
- paginate potentially unbounded data
- keep browser and server payloads bounded
- do not add paid infrastructure without a measured reason

## Vercel

Current design principles:

- Server Components by default
- Client Components only for actual browser interaction
- static rendering for suitable public pages
- avoid unnecessary internal HTTP requests from Server Components
- no database work in middleware/proxy on every request
- keep function work bounded
- use one daily maintenance job when scheduled maintenance becomes necessary

Exact Hobby quotas are intentionally not duplicated here as permanent constants because provider limits can change.

## PostgreSQL / Neon

PostgreSQL remains the durable source of truth.

Budget principles:

- bounded queries
- correct indexes
- pagination
- avoid N+1 access patterns
- select only required columns on performance-sensitive paths
- separate development/test data from production
- measure query latency before adding complexity

## Redis / Upstash

Redis usage must remain measurable.

Initial intended uses:

- selected cache-aside reads
- rate limiting
- short-lived distributed coordination
- bounded real-time relay

Avoid baseline usage for:

- permanent message history
- sessions unless explicitly required by the auth architecture
- decorative presence systems
- high-frequency heartbeats
- typing indicators before measurement

Every cache requires an invalidation strategy.

## WebSockets

Real-time behavior must remain lazy.

Rules:

- no global authenticated-user WebSocket
- connect only while a feature actually needs real-time behavior
- initially messaging only
- normally one application WebSocket per active messaging browser tab
- reuse the socket across conversations
- disconnect when leaving the real-time surface
- stop reconnecting after logout or loss of authorization
- reconcile missed events from PostgreSQL

## Load Target

The architectural target is approximately 100 genuinely concurrent users under a representative workload.

This remains a target until verified by load testing.

Performance claims must be supported by evidence rather than estimates.

## Upgrade Rule

Do not recommend a paid provider upgrade merely because one exists.

A paid upgrade should be considered only when:

- measured usage approaches a relevant provider limit
- plan eligibility changes
- a required capability is unavailable on the current plan
- reliability requirements justify the change

Any upgrade recommendation should identify the exact measured limitation that motivated it.
