# ADR 0001: Next.js and Vercel-Native Architecture

## Status

Accepted

## Context

IMS Network is being rebuilt from scratch from an older Node.js, Express, and PostgreSQL application.

The new application needs a modern TypeScript architecture that remains simple enough for a portfolio project and approximately 100 concurrent users.

The application should deploy naturally to Vercel without recreating the old Express server architecture inside a serverless platform.

## Decision

Use Next.js with:

- TypeScript
- React
- App Router
- Server Components by default
- Server Actions where appropriate
- Route Handlers where an HTTP endpoint is genuinely required
- Node.js runtime on Vercel

The frontend and backend will remain in one repository.

Provider-specific integrations will be isolated behind server-side modules so infrastructure can evolve without rewriting the application.

## Alternatives Considered

- Separate React frontend and Express backend
- Traditional Express application hosted on a persistent server
- Multiple services or microservices
- GraphQL API

## Consequences

### Positive

- one repository
- strong TypeScript integration
- fewer unnecessary internal HTTP calls
- native Vercel deployment model
- simpler development and operations
- Server Components can reduce unnecessary browser JavaScript
- straightforward upgrade path as the application grows

### Negative

- some platform behavior is tied to Next.js and Vercel conventions
- serverless and WebSocket behavior must be designed carefully
- provider APIs can evolve and must remain isolated

## Implementation / Verification

Current implementation:

- Next.js 16
- React
- TypeScript
- App Router
- src directory
- production build verified

Relevant documentation:

- docs/architecture/overview.md
