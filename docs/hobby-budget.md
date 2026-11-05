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

## Phase 13 Redis Command Budget

Reviewed: 2026-11-05
Status: Implemented locally; final release checks pending.

### Provider budget

Upstash Redis Free snapshot:
- 500,000 commands per month
- 256 MB maximum storage
- 10 GB monthly bandwidth
- One Free database per account

Official sources:
- https://upstash.com/pricing/redis
- https://upstash.com/docs/redis/sdks/ratelimit-ts/costs

Recheck current provider limits before deployment.

### Current implementation

Redis:
- @upstash/redis and @upstash/ratelimit
- Server-only access
- Versioned environment key namespaces
- Development credentials stored locally
- PostgreSQL remains authoritative

Member-detail cache:
- TTL: 60 seconds
- Warm read: approximately 1 Redis GET
- Cold read: approximately 1 GET plus 1 SET
- Fresh PostgreSQL ACTIVE-target check before cache lookup
- Private avatar storage pathname excluded
- Cache key includes profile ID and updated_at revision
- Profile and avatar writes advance revision timestamps
- Superseded cache entries expire naturally
- Redis failures fall back to PostgreSQL

Directory:
- 40 requests/minute per authenticated member
- Fixed-window rate limiting
- PostgreSQL directory queries remain bounded
- Directory result caching not yet implemented
- ACTIVE visibility must remain fresh

Profile editing:
- 12 updates/10 minutes per authenticated member
- Fixed-window rate limiting
- Redis outages currently fail open
- SQL UPDATE checks ACTIVE account status

Authentication:
- Upstash gate integrated with Better Auth POST handler
- Sign-in: 90 requests/10 minutes per trusted IP
- Sign-up: 25 requests/30 minutes per trusted IP
- Password recovery: 20 requests/15 minutes per IP
- Verification resend: 20 requests/15 minutes per IP
- Recovery and verification use distinct endpoint counters
- Sliding-window algorithms
- HMAC-based identifiers; raw IPs not stored as Redis keys
- HTTP 429 with Retry-After for exceeded limits
- HTTP 503 for unavailable enabled high-risk protection
- Better Auth built-in protections remain separate
- Shared campus IP behavior needs operational review

Message sending:
- Rate-limit primitive exists
- No message sending implemented yet
- Actual enforcement belongs to Phase 14

### Redis command estimates

For regional Upstash limits with analytics disabled:

Fixed-window limiter:
- First check: 3 commands
- Subsequent allowed check: approximately 2 commands

Sliding-window limiter:
- First check: 5 commands
- Subsequent allowed check: approximately 4 commands

Actual usage depends on the algorithm state, caching,
SDK behavior, and deployment configuration.

### Illustrative monthly workload

Assume 100 active users over 30 days:

- Directory: 30,000 requests = 60,000-90,000 commands
- Member detail: 15,000 views, 20% misses = 18,000 commands
- Profile editing: 800 updates = 1,600-2,400 commands

Illustrative subtotal: 79,600-110,400 commands/month.

This excludes authentication, recovery, integration tests,
future messaging, realtime relay and other Redis operations.

These are workload assumptions, not observed usage.

### Environment isolation decision

Development:
- Uses the ims-network-dev Upstash database
- Redis integration and tests verified locally

Vercel Preview:
- Uses independent Neon Preview and private Preview Blob
- No Upstash REST credentials currently configured
- Redis profile caching disabled
- Custom member-search/profile-edit limiters fail open
- Custom authentication Redis gate is bypassed
- Better Auth production-mode limiter remains configured
- Its effective protection needs route-level verification
- No claim of distributed Preview protection yet

Production:
- No Redis credentials configured
- No production release approved
- Do not deploy the Redis-enabled application to Production
  without reviewing fail-closed authentication behavior

Different Redis key namespaces are logical separation,
not independent security boundaries.

Development credentials must not be copied into Preview
or Production without an explicit reviewed decision.

### Tests completed

- Redis PING and temporary read/write
- Cache cold and warm reads
- Cache invalidation
- Simulated Redis outages
- Live Redis rate-limit counters
- Authentication gate 429 and 503 decisions
- Invalid sign-in HTTP smoke test
- Profile revision SQL test
- Member-cache negative security tests
- TypeScript, ESLint and build checks

Mocked tests do not establish complete production security.

### Monitoring

- Inspect actual command consumption in Upstash Console
- Investigate sustained consumption above 70% of quota
- Measure latency before adding directory caches
- Keep temporary test keys bounded and expiring
- Do not use production-wide KEYS scans
- Reassess command costs before Phase 16 realtime relay

### Outstanding Phase 13 work

- Full authenticated rate-limit route verification
- Profile/cache integration against real account state changes
- Review directory caching versus freshness and measured benefit
- Document actual provider command usage
- Obtain independent Preview Redis credentials if required
- Verify Preview behavior and deployment protections
- Final regression, secret review and controlled Git commit
