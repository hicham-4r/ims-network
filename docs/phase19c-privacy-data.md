# Phase 19C — Personal data and deletion requests

Disabled by default: `IMS_PRIVACY_DATA_ENABLED=true` only for an isolated, protected Preview after local checks. No migration, new dependency, polling or new service.

## Export
Active accounts can use `/account-privacy` to download JSON pages of their own account/profile fields and up to 100 sent messages. It is a partial personal data export: received messages, avatar binaries, credentials, session information, admin notes and other users' profile/contact data are excluded. The server binds the query to the current session/user, uses a live-session check and a bigint keyset cursor. Cursor is a position, not authorization. Each page is independently read; this is not a point-in-time snapshot. No persistent export blob is created. Keep downloads private. Inactive accounts can contact the owner directly.

## Deletion
Active ordinary members may request deletion after current-password confirmation. Admin/owner accounts must use a separately reviewed process. The request creates `ACCOUNT_DELETION_REQUESTED` in `/admin/audit` (filter by action or target), at most one event per account per UTC day. It does not change account state, revoke sessions or delete anything. Request events are excluded from optional audit pruning so unprocessed requests are not silently lost. Review manually through a trusted channel; the audit record is not a complete case-management system. Do not assume a request is fulfilled. No automatic hard deletion: conversation and sender foreign keys restrict deletion; message retention/anonymization and avatar/provider backup handling need a reviewed procedure. Do not delete a member's shared history by cascade. Existing account suspension is distinct from deletion. No legal compliance claim.

## Preview acceptance
- Enable flag only in isolated protected Preview; use two test members. Check disabled endpoint returns 503 without work.
- Download A's export; verify B's received/sent bodies, credentials and admin notes do not appear. A supplied target ID is rejected. Try pagination with >100 messages if available; verify no duplicates, descending sequence, no more than 100 per page. Confirm no-store and denied requests for logged-out/suspended sessions.
- Submit deletion request using wrong password, then valid password; verify exactly one event for repeated requests on same UTC day, and account/session/messages unchanged. Check ADMIN/OWNER requests rejected, other users cannot submit on behalf of A, and optional maintenance excludes request events. Do not use actual deletion or production data.
- Test Redis unavailable and cross-origin rejection. Measure actual DB/Redis costs; each successful action uses IP and user rate limits, and no background calls. SQL statements have timeouts; page size bounds returned rows, not necessarily scan work. Full SQL integration and transaction/concurrency testing remain required.
