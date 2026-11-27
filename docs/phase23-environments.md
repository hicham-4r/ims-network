# Environment checklist (names only, never values)

Do not print, upload or commit actual secrets. This is a checklist, not a runnable env file. Development uses `.env.local`; Vercel Preview and future Production use separately scoped settings. Production must not reuse Preview credentials or synthetic data.

| Setting | Purpose |
| --- | --- |
| DATABASE_URL | Direct Neon connection for migrations |
| DATABASE_URL_POOLED | Pooled runtime Neon connection |
| BETTER_AUTH_SECRET | Server-only session signing secret (minimum 32 characters) |
| BETTER_AUTH_URL | Canonical URL outside Preview; Preview derives URL from VERCEL_URL |
| RESEND_API_KEY / RESEND_FROM_EMAIL | Password-recovery mail provider and sender |
| UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN | Cache, rate limits and stream publication |
| UPSTASH_REDIS_TCP_URL | Verified `rediss://` URL for same isolated Redis; do not include quotes |
| BLOB_READ_WRITE_TOKEN | Private avatar storage |
| NEXT_PUBLIC_TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY | Challenge configuration; public site key only may be exposed |
| IMS_OWNER_USER_ID | Owner identity, server-only |
| CRON_SECRET | Maintenance authorization |
| IMS_MAINTENANCE_MODE / IMS_PRIVACY_DATA_ENABLED / IMS_RECOVERY_CODES_ENABLED | Operational feature gates; review separately |
| IMS_PHASE16_WS_ENABLED / IMS_PHASE16_RELAY_ENABLED | Current Preview real-time gates |
| IMS_PHASE22_CHAT_ACTIVITY | Preview activity gate |
| IMS_PHASE22_RELAY_DIAGNOSTICS / IMS_PHASE21_PROFILE | Temporary diagnostics; normally disabled |
| IMS_TURNSTILE_TEST_MODE | Preview-only test mode; never enable in Production |

Keep the working TCP connection settings and credentials. Review actual implementation and provider settings before release; this list is not a validation of current values. No hosted credentials are needed for the offline quality runner. CI must never receive database, Redis, Blob or mail secrets. No environment modifications are included in this patch.
