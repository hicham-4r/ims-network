# Development workflow

Canonical branch: main. Use focused feature/fix branches and Conventional Commit messages. The existing development branch may carry several guarded changes; review and commit them together only after validation. Never force-push or reset destructively to recover routine changes.

## Checks

Install the existing lockfile with `npm ci --no-audit --no-fund` if needed. Run `node tools/ci/validate.cjs`, `node tools/ci/check-migrations.cjs --exact`, and `git diff --check`. Review the full diff, stage intended files only and run `node tools/ci/check-repository.cjs --staged`. Dependency advisories are reviewed separately via `npm audit --audit-level=high`. No secrets, data dumps or private screenshots should be committed.

Runtime testing uses protected Vercel Preview until Development schema is explicitly synchronized. No automatic Production deployments or migrations. See [CI and release runbook](phase23-release-runbook.md) and [environment checklist](phase23-environments.md). Keep previous guarded ZIPs/backups outside Git. Phase 23 does not modify application code, environment values, database schema or provider settings.
