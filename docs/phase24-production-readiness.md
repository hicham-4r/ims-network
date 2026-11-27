# Phase 24 — Production readiness (release candidate, not launch)

Use a fresh Neon project in Frankfurt, PostgreSQL 18, `neondb`, separate from Development and Preview. No legacy or synthetic data import. Verify the provider's recovery path and confirm no deployment points to it. Initialize the nine reviewed migrations once; never retry an uncertain write blindly. The owner bootstrap creates a fresh credential account and ACTIVE/ADMIN state in a locked transaction on an empty database; set the returned ID as Production-only `IMS_OWNER_USER_ID`. Reuse your email and name; re-enter professional fields and upload the avatar after sign-in. No sessions, old password hashes, recovery codes or avatar tokens are copied. Email is deliberately unverified; existing owner recovery restrictions remain. Use a unique password stored securely and establish a controlled administrative recovery procedure before launch. No public bootstrap endpoint is created.

## Redis: dedicated Production database

Upstash is exclusive to Production. Remove Redis credentials from all Preview, Development, branch overrides and local environment files; retire old credential-bearing deployments and rotate the database credentials before enabling the new Production environment. Verify old REST and TCP credentials are rejected; close any surviving TCP clients. Do not flush the database. Preview must stay protected and use its own pinned Neon database and `ims_preview_testing.rate_limits` schema, provisioned by the guarded add-on helper. Preview auth and mutation limits still fail closed; reads follow existing failure policies. Preview has no distributed cache, sockets, live typing or presence; refresh manually to test persisted messages. Offline suites cover relay behavior. No continuous polling or added Production SQL queries.

## Production-only configuration

- DATABASE_URL and DATABASE_URL_POOLED: new isolated Production database.
- BETTER_AUTH_URL: exact canonical HTTPS origin (no trailing slash); BETTER_AUTH_SECRET: independent random secret of at least 32 chars.
- IMS_OWNER_USER_ID: new owner ID returned by the guarded bootstrap.
- UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN and UPSTASH_REDIS_TCP_URL: fresh dedicated Production credentials, default TCP user, same existing database.
- NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY: real widget scoped to canonical hostname; IMS_TURNSTILE_TEST_MODE=false.
- BLOB_READ_WRITE_TOKEN: separate private Production store; confirm free-tier eligibility and storage isolation.
- RESEND_API_KEY / RESEND_FROM_EMAIL: approved recovery sender; no mandatory verification on registration.
- CRON_SECRET: independent random URL-safe secret; IMS_MAINTENANCE_MODE=inspect initially; no audit pruning until reviewed.
- IMS_PRIVACY_DATA_ENABLED / IMS_RECOVERY_CODES_ENABLED: enable after controlled acceptance.
- IMS_PHASE16_WS_ENABLED=true, IMS_PHASE16_RELAY_ENABLED=true, IMS_PRODUCTION_REALTIME_ENABLED=true and IMS_PRODUCTION_REDIS_DEDICATED=true and IMS_PRODUCTION_REDIS_ISOLATION_VERIFIED=true ONLY after actual credential revocation and origin verification. The last two flags default to off; isolation flag records operator verification, not automatic proof of revocation.
- IMS_PHASE22_CHAT_ACTIVITY=true after bounded trial; IMS_PHASE22_RELAY_DIAGNOSTICS=false; IMS_PHASE21_PROFILE=false.

Keep Git-triggered deployment disabled. No Production deployment authorized. Test Preview regression first. Validate canonical domain, owner sign-in and authorization, registration approval, two-account realtime including reconnect, recovery, privacy, avatars, denied access, quota and deployment protection before opening to alumni. Vercel WebSocket beta and duration limits remain relevant; the 150-second lease and lazy connections remain unchanged. No added idle polling, dependencies, paid services or migrations beyond the nine existing files. Free-tier sustainability requires actual measurements; it is not guaranteed by this patch.
