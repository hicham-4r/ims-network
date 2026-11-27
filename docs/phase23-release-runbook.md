# CI and controlled release runbook

## 1. Quality gates

- GitHub Actions: one standard Linux job, PRs to main, pushes to main, or manual dispatch; superseded runs cancelled, 15-minute timeout, read-only token, pinned official checkout/setup-node actions, no persisted checkout credentials, no cloud secrets, no automatic deployment. Initial dispatch requires workflow on the default branch; open a reviewed PR for the first run. Review any pre-existing workflows before pushing; this patch adds a uniquely named workflow and does not disable unknown workflows.
- Before staging: review `git status --short`, `git diff --check`, source and docs. Run `node tools/ci/validate.cjs` locally with locked dependencies installed. Run `node tools/ci/check-migrations.cjs --exact` on the local migration-authoring checkout.
- Stage only intended files, inspect `git diff --cached --stat` and `git diff --cached --check`, run `node tools/ci/check-repository.cjs --staged`. Inspect staged content for secrets, private screenshots and user data. The scanner checks common patterns and filenames only; it does not scan Git history, binaries or all credentials.
- Commit after review, push existing feature branch, open PR to main. Do not merge until quality checks and release review pass. Enable branch rules requiring the quality job where supported by your repository plan. Do not change visibility or buy a plan just to expose CI badges.
- Run `npm audit --audit-level=high` explicitly or opt in via manual workflow. Review high/critical advisories and reachability; no automatic dependency upgrades. CI uses npm registry and GitHub compute, not app-provider operations. Check GitHub included minutes and set spending controls before enabling Actions.

## 2. Migration safety

No migration in Phase 23. The immutable baseline records nine SQL migrations, snapshots and journal. CI checks content with normalized CRLF/LF for portable Git checkouts, reports raw byte differences, and does not run SQL. `--exact` blocks raw-byte drift locally. Drizzle ledger hashes are raw bytes: never rewrite applied migrations, never blindly generate or push a new schema, and reconcile Git line-ending normalization with the accepted Preview ledger before preparing Production. Preserve verified original migration archives. Existing guarded migration helpers and their mock suites remain in the Phase 22 bundles on D:. They are not generic CI deploy tools and their historical source guards must not be relaxed.

## 3. Preview release (manual CD)

Keep Git-triggered Vercel deployment disabled. Verify project link and protected Preview, target Neon branch, Redis REST/TCP alignment, recovery path, provider counters and reviewed feature flags. Use the known successful Preview deployment command only when runtime source changes need testing. No deployment is needed solely for Phase 23 docs/CI. Use two synthetic accounts for bounded messaging smoke tests and check reconnection, read/delivery, reports and negative authorization; close sockets after the trial. Record the exact deployment, commit, time window, region and counter deltas privately. Do not put private URLs with tokens in Git.

## 4. Production gate (future phase, not executed)

Fresh isolated database; verify complete schema and owner bootstrap, real email recovery and Turnstile mode, privacy and account lifecycle, maintenance authorization, runtime region, backup restore procedure, quotas and plan eligibility. Review current Preview-only real-time gates before enabling Production. Run bounded live tests, browser checks and rollback rehearsal; no automatic production deploy or migration. Maintain an explicit release approval and known-good deployment. Source rollback never reverses a database migration.

## 5. Operational checklist

For a relay incident, verify message persistence, stream publication, WS handshake/ready, TCP reader and recipient forwarding separately. Never log secrets or disable TLS. Prefer bounded diagnostics over repeated deployments. See the Phase 22 diagnostic archives. Keep private recovery records, monitor resource counters and review usage trends. Production is a separate decision after all gates pass.
