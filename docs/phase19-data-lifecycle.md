# Phase 19A — bounded maintenance and data lifecycle

## Activation and scope

One Vercel cron schedule at 04:00 UTC daily, production deployments only. Hobby timing may vary within the hour. Preview is manually testable, not automatically scheduled. The installer does not deploy or enable maintenance. Default is disabled. Set `CRON_SECRET` to a unique 32–128 character URL-safe random secret per environment (at least 32 random bytes recommended). Never use auth secrets, passwords, URL parameters, or chat messages for this value. Set `IMS_MAINTENANCE_MODE=inspect` first, then `cleanup` only after verifying the isolated target and backup. No other value permits execution. `IMS_MAINTENANCE_AUDIT_RETENTION_DAYS` must be unset or exactly `365`; leave unset until the owner approves the retention policy. Explicitly setting 365 in cleanup mode opts in to permanent audit pruning. Changing these values requires a new deployment. The endpoint does not accept user-specified limits, modes or dates. Do not disable Deployment Protection to test.

## Implementation and cost

- GET `/api/cron/maintenance` requires the exact Authorization Bearer secret; no session cookie, URL token, user agent, or forwarded-header bypass. No database load before authentication and mode gating. Responses are non-cacheable and contain counts only.
- Inspect mode returns capped candidate counts, not totals. No deletion or row locks in inspect mode. Cleanup deletes at most 200 expired sessions, 200 expired verification records, and (only when explicitly opted in) 100 old audit rows per invocation, excluding Phase 19C deletion request events. A full batch may mean more remain. Expiry is rechecked and uses UTC timestamps with a 24-hour grace period. No active sessions or unexpired recovery credentials are selected.
- Cleanup uses a transaction-scoped advisory lock and skips locked rows; concurrent invocations can return skipped. Repeated calls cannot delete the same rows twice; each can process another batch. One daily schedule, not a daily hard quota. Do not expose the secret. A 5s SQL statement timeout and 1s lock timeout bound database work; timeout rolls back the transaction. Expiry columns currently lack indexes; scans may occur. Monitor query duration before proposing an expiry index migration.
- No Redis calls, Blob listing, new dependencies, new tables, or background polling. Daily invocation may wake Neon; actual CPU and usage require measurement. No provider quotas are guaranteed.

## Retention policy and deletion boundaries

| Data | Policy |
| --- | --- |
| Sessions / temporary auth records | Expired plus 24 hours, bounded cleanup when enabled |
| Audit records | Retain by default; proposed 365-day policy, explicit opt-in required; Phase 19C deletion request events excluded |
| Pending/rejected/unverified accounts | Retain; age alone is not sufficient justification for deletion |
| Active/suspended accounts and profiles | Retain; suspension is not erasure |
| Messages and conversations | Retain; no automatic removal or access for unrelated admins |
| Avatar assets | Existing replacement cleanup; no orphan sweeper yet |
| Backups | Provider retention may outlast changes to live data; verify actual plan and policy |

Conversation, participant and sender foreign keys restrict account deletion. Do not cascade-delete chat history or remove accounts directly. Owner must first decide whether participant removal anonymizes history or erases content, and define authorization, storage cleanup, and audit handling. Manual requests should verify the requester through a trusted independent channel and document decisions without copying message content into audit logs. Phase 19A itself does not implement export, deletion, orphan-blob sweeping or password recovery for unverified accounts. See Phase 19B recovery codes and Phase 19C privacy data documentation for the later gated features. Never set emailVerified to true merely to recover an account; never share or set a user's password through an administrator chat. Recovery for accounts without verified addresses requires a dedicated independently authenticated recovery mechanism (e.g., one-time recovery codes with revocation and rate limiting) in Phase 19B. Existing legacy verified email recovery is unchanged. No legal compliance claim.

## Backup and live acceptance (isolated Preview only)

1. Verify exact Neon project/branch, Vercel protection, and restore capability privately. Before any cleanup test, create a disposable branch or another recoverable copy within the provider's limits. Never export session tokens/password hashes to chat or source bundles.
2. With mode inspect and a unique Preview secret, verify missing/wrong Authorization returns 401, proper bearer returns 200 and `mode: inspect`, with only bounded counts. Unset mode returns 503 for valid authorization. Query-string parameters must return 400. Use a local HTTP client with protected secret input; do not place secret in URL, command history, or output.
3. Seed synthetic expired and unexpired records in the disposable database, not live member records. Confirm inspect changes nothing. Switch the isolated Preview to cleanup (audit setting unset), redeploy, verify expired rows beyond grace removed, recent/active rows preserved, audit unchanged, and repeated invocation safe. Check parallel calls and timeout rollback. Test audit prune separately on synthetic audit records only with opt-in. Restore or discard the test branch afterwards.
4. Record capped counts, database duration, Neon compute and Vercel usage; verify normal sign-in, owner/admin, private messages and audit views unchanged. Disable cleanup if unexpected. Before production enablement review real Turnstile keys, deferred audit findings, recovery and deletion policy. Do not enable production cleanup until approved. Restore rehearsals must be performed in a separate database, never overwrite production blindly.
