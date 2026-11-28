# CI, release and operations runbook

Applies to the launched v1.0.0 and later maintenance. Historical bootstrap instructions in Phase 24 are not a recipe to recreate the existing owner or database.

## 1. Quality gates

Use a focused branch. Install locked dependencies with `npm ci`, generate route types with `node node_modules/next/dist/bin/next typegen`, run `node tools/ci/validate.cjs`, `node tools/ci/check-migrations.cjs --exact`, `git diff --check`, and a reviewed non-Production build for runtime changes. Review `npm audit --omit=dev` and `npm audit` separately. Do not use `npm audit fix --force`.

Stage only intended paths; run `node tools/ci/check-repository.cjs --staged`, `gitleaks git --pre-commit --staged --redact .` and `git diff --cached --check`. Review staged content; heuristic scans are not guarantees. Never stage debug bundles, account identifiers, private logs or screenshots. PR and main CI run on standard Linux with pinned official actions, read-only permissions and no hosted secrets; the workflow does not deploy. Require CI before merge where repository settings support it.

## 2. Migration and deployment safety

Preserve all applied migration bytes and their snapshots/journal. `--exact` detects raw-byte drift; Git line ending normalization must not rewrite applied SQL. A new migration requires a separate reviewed plan, backup/restore verification, explicit target and non-Production acceptance. Do not automatically push schema, rerun initialization or recreate the existing owner.

Synchronize main and record its SHA. Create a clean detached Git worktree outside the repository, copy only the reviewed `.vercel/project.json` linkage, verify the Vercel project and environment, and deploy manually. Use `npx vercel deploy --environment=preview --logs` for Preview; `--prod` only for an explicitly approved Production operation. No credentials or untracked artifacts copied. No deploy required for documentation-only changes. Keep Git-triggered deploys disabled.

Preview is Redis-free; it validates persistence, auth and UI, but not live relay. For runtime changes, validate with bounded synthetic tests, then recheck affected paths in Production. Retain known-good deployment identity and note code SHA, flags, migration state and time of each release. Tag the exact accepted application commit, not a later docs-only commit.

## 3. Live operation

- Daily maintenance is configured for 04:00 UTC at `/api/cron/maintenance`; require the dedicated bearer secret, keep `IMS_MAINTENANCE_MODE=inspect`. Never put the secret in browser console history, URLs or logs. Use a trusted local client with secret supplied securely. Review any destructive mode separately.
- Monitor Vercel active CPU/memory/invocations, Neon compute/storage, Redis commands/connections and Blob usage. Review billing period and plan eligibility. Avoid repeated load trials, permanent idle sockets and broad Redis scans.
- Approve alumni only after independent identity and eligibility checks. Unverified email is not identity proof. Keep owner mailbox and provider access secure; test recovery in a controlled manner. Deletion requests require manual review, explicit scope and preservation of required audit history.

## 4. Incident and rollback

For a serious authorization or credential issue, restore All Deployments protection to contain public access; verify anonymous denial. Restrict affected logs, revoke exposed sessions, assess old deployments/credentials and rotate only affected secrets as needed. Do not log raw exceptions, session tokens, passwords or recovery codes.

For relay failures, separate durable persistence, stream publication, TCP reader, socket ready, authorized forwarding and client reconciliation. A 101 handshake alone does not prove delivery. Keep TLS verification enabled. Do not flush Redis or reset the database.

For rollback, verify the known-good deployment has safe auth code, correct provider credentials/flags and compatible schema before promoting it. If uncertain, keep access protected rather than roll back to vulnerable code. Source rollback does not reverse database changes. Check Neon restore availability and recovery point before any destructive operation; restore only after a reviewed data-loss assessment. No automated rollback or migration in this runbook.

See [release evidence](phase26-release-evidence.md) for accepted scope and known limitations.
