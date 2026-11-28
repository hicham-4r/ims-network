# Environment configuration — current release

Names and nonsecret settings only. Use independent secrets in each environment; no live credentials in Git, CI, screenshots or tickets. This guide supersedes the earlier Preview relay trial configuration. See `.env.example` locally for template syntax; source remains authoritative.

## Connection settings

| Variable | Purpose |
| --- | --- |
| DATABASE_URL | Direct Neon connection; migration tooling |
| DATABASE_URL_POOLED | Pooled runtime Neon connection |
| BETTER_AUTH_SECRET | Independent server-only signing secret (at least 32 characters) |
| BETTER_AUTH_URL | Canonical HTTPS origin in Production; Preview derives from VERCEL_URL |
| IMS_OWNER_USER_ID | Existing owner identifier, server-only, per environment |
| BLOB_READ_WRITE_TOKEN | Environment-specific private store |
| NEXT_PUBLIC_TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY | Widget site key / server challenge secret |
| RESEND_API_KEY / RESEND_FROM_EMAIL | Verified-address recovery sender; provider limits apply |
| CRON_SECRET | Independent maintenance bearer credential |
| UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN / UPSTASH_REDIS_TCP_URL | Production only; same dedicated Redis database; verified rediss TLS |

## Production settings at launch

| Variable | Value |
| --- | --- |
| BETTER_AUTH_URL | https://ims-network.vercel.app |
| IMS_PRODUCTION_REDIS_DEDICATED | true |
| IMS_PRODUCTION_REDIS_ISOLATION_VERIFIED | true, only after isolation is actually verified |
| IMS_PRODUCTION_REALTIME_ENABLED | true |
| IMS_PHASE16_WS_ENABLED / IMS_PHASE16_RELAY_ENABLED | true |
| IMS_PRIVACY_DATA_ENABLED / IMS_RECOVERY_CODES_ENABLED / IMS_PHASE22_CHAT_ACTIVITY | true |
| IMS_PHASE22_RELAY_DIAGNOSTICS / IMS_PHASE21_PROFILE | false |
| IMS_TURNSTILE_TEST_MODE | false |
| IMS_MAINTENANCE_MODE | inspect |

No Preview limiter flags in Production. Keep Vercel Authentication enabled with Standard Protection: public canonical Production domain, protected Preview and generated deployment URLs; verify actual anonymous behavior. Use All Deployments to contain a suspected authorization incident. The current recovery sender supports sending to the verified owner's mailbox; do not assume arbitrary recipient delivery.

## Preview and Development

Preview must use separate direct and pooled Neon URLs, separate auth secret/owner, private Blob and widget configuration. `IMS_PREVIEW_DB_RATE_LIMIT_ENABLED=true` requires `IMS_PREVIEW_RATE_LIMIT_DB_HOST` pinned to the intended direct Neon hostname and the matching pooled host. Provision the reviewed Preview-only `ims_preview_testing.rate_limits` table using the established guarded procedure. Keep WS, relay and chat activity disabled; no Production-only flags or Redis credentials. Development is also Redis-free; some mutations fail closed without an authorized limiter. Use non-Production data only. Never enable Turnstile test mode in Production.

Provider settings are operator-managed; environment changes require a new deployment to take effect in runtime. Old deployments retain old configuration snapshots. Revoke old credentials, retire vulnerable deployments and verify isolation before enabling new infrastructure. CI receives no hosted service secrets.
