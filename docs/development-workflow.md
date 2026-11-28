# Development workflow

Canonical branch: `main`. Use focused feature/fix branches and reviewed PRs. The released application commit is recorded in [release evidence](phase26-release-evidence.md); later documentation changes do not change that release tag.

## Local setup and checks

Use the CI-pinned Node version (26.13.0) and npm. Inspect dependencies and install the committed lockfile. Use `.env.example` as a template and local ignored `.env.local` for isolated Development secrets. The offline quality runner needs no provider credentials. Runtime work requires a compatible isolated Neon database and private Blob configuration; abuse-sensitive operations can fail closed locally without an allowed limiter. Do not reuse Production or Preview secrets in local Development.

```bash
npm ci --no-audit --no-fund
node node_modules/next/dist/bin/next typegen
node tools/ci/validate.cjs
node tools/ci/check-migrations.cjs --exact
git diff --check
```

For runtime releases, run `npm run build` using the reviewed non-Production configuration. Use `npm run dev` for local browsing only. Keep developer servers private. Use protected Preview for integrated testing; its separate PostgreSQL limiter and no-relay behavior are intentional.

Stage explicit paths only, inspect `git diff --cached`, run `node tools/ci/check-repository.cjs --staged`, Gitleaks and staged diff checks. Review dependency findings without automatic force fixes. CI is a quality gate, not automatic deployment. Keep local backup archives outside Git. Do not force-push or reset to recover ordinary changes.

See [environment settings](phase23-environments.md) and [release runbook](phase23-release-runbook.md).
