# ADR 0002: npm as the Canonical Package Manager

## Status

Accepted

## Context

IMS Network is developed primarily from Windows Terminal and PowerShell.

The project should minimize bootstrap requirements and avoid mixing multiple JavaScript package managers.

Node.js already provides npm, making it the lowest-friction choice for a reproducible Windows development workflow.

## Decision

Use npm as the only package manager for IMS Network.

The repository will commit package-lock.json.

Project tooling should prefer local executables through npm scripts or npx rather than unnecessary global npm packages.

The repository must not mix npm, pnpm, Yarn, or Bun unless a future explicit migration is documented.

## Alternatives Considered

- pnpm
- Yarn
- Bun

## Consequences

### Positive

- npm ships with Node.js
- no additional package-manager installation is required
- package-lock.json provides reproducible dependency resolution
- simple Windows setup
- straightforward CI usage with npm ci

### Negative

- other package managers may provide faster installs or different workspace features
- changing package managers later would require an intentional migration

## Implementation / Verification

Current implementation:

- npm is used by the project
- package-lock.json is committed
- package.json defines project scripts
- npm run lint works
- npm run typecheck works
- npm run build works
