# IMS Network Architecture

## Status

Early development.

The frontend foundation, documentation baseline, environment boundary, state collector, and Neon/Drizzle database foundation are implemented.

Email verification/password recovery, Redis, messaging, email delivery, storage, and production deployment are not implemented yet.

## Current Foundation

- Next.js 16
- React
- TypeScript
- App Router
- Tailwind CSS
- shadcn/ui
- Lucide icons
- npm
- Windows 11 terminal-first development
- GitHub repository
- Zod environment validation foundation
- safe state-bundle collector
- Neon PostgreSQL development database
- Drizzle ORM and Drizzle Kit migration foundation
- pooled Neon runtime database adapter
- database health-check tooling
- Better Auth email/password authentication
- HttpOnly cookie-backed sessions
- server-side authenticated route protection

## Target Architecture

IMS Network is planned as a Vercel-native student and alumni networking application.

Target technologies include:

- Neon PostgreSQL
- Drizzle ORM
- Better Auth
- Upstash Redis
- Vercel WebSockets
- Resend
- Vercel Blob
- Vitest
- Playwright
- GitHub Actions

Planned technologies are not considered implemented until their roadmap phases are completed and verified.

## Architecture Principles

- PostgreSQL is the durable source of truth.
- Redis is cache and coordination infrastructure, not durable application storage.
- Server Components are preferred by default.
- Client Components are used only when browser interaction is required.
- Provider-specific integrations remain isolated behind server-side modules.
- Authentication and authorization are enforced server-side.
- User-provided identity or role information is never trusted directly.
- Lists and message history must remain bounded and paginated.
- Real-time connections must be lazy and route-scoped.
- No global WebSocket should exist merely because a user is authenticated.
- Security, accessibility, testing, and cost awareness are continuous requirements.

## Environment Boundaries

Server environment validation lives under:

    src/server/env.ts

Browser-safe configuration lives under:

    src/lib/env/

Secrets must never be exposed through NEXT_PUBLIC_ variables.

The project currently requires no provider-specific secret environment variables.

## Architecture Decision Records

Important decisions are documented under:

    docs/adr/

Current ADRs:

- ADR 0001: Next.js and Vercel-Native Architecture
- ADR 0002: npm as the Canonical Package Manager
- ADR 0003: Neon PostgreSQL and Drizzle ORM
- ADR 0004: Better Auth Session Model
- ADR 0005: Redis Role Boundaries

## Hobby-Tier Design

The initial cost and capacity rules are documented in:

    docs/hobby-budget.md

Provider pricing and quotas must be rechecked against current official documentation before cost-sensitive implementation decisions.

## State Recovery

Repository reality can be summarized with:

    npm run state

This generates:

    IMS_NETWORK_STATE_BUNDLE.txt

The bundle is local, Git-ignored, and built from an explicit safe allowlist.

### Phase 8 authentication email lifecycle

The authentication foundation now includes:
- mandatory email verification for email/password accounts
- server-only transactional email delivery through Resend
- generic verification resend behavior
- forgot-password and reset-password flows
- Better Auth-owned verification and reset tokens
- reset-token expiry and single-use behavior
- session revocation after successful password reset

The application does not expose authentication or email-provider secrets to browser code. Production email delivery will require a verified application-owned domain.

### Phase 9 account authorization

Authentication and application authorization are separate boundaries.

Protected application requests derive the current user from the validated Better Auth server session. Browser-provided user IDs, roles, or account states are not authorization evidence.

Central authorization helpers include:

- `requireApplicationAccount()`
- `requireActiveMember()`
- `requireAdmin()`
- server-side account-state routing helpers

Only an `ACTIVE` application account receives normal member access.

The member layout enforces account state for member routes. Restricted states are routed to dedicated account-state pages.

Administrator account transitions are validated server-side against their expected current state and produce audit records.

Account-management transitions do not support an automatic `force` retry or implicit override.

Rejected and suspended accounts have their current Better Auth database sessions revoked as part of the administrative transition.

Account-state pages use route-level loading boundaries so fresh request-specific session and authorization checks remain uncached while still supporting streamed navigation.
