# IMS Network Architecture

## Status

Early development.

## Current Foundation

- Next.js 16
- React
- TypeScript
- App Router
- Tailwind CSS
- npm
- Windows 11 terminal-first development

## Planned Architecture

The target architecture is a Vercel-native student/alumni networking application using PostgreSQL, Drizzle, Better Auth, Redis, real-time messaging, testing, CI/CD, and security-focused server-side authorization.

Planned features are not considered implemented until verified in the repository.

## Principles

- PostgreSQL is the durable source of truth.
- Redis is used only for caching, rate limiting, ephemeral coordination, and real-time relay where needed.
- Server Components are preferred by default.
- Client Components are used only where browser interactivity is required.
- Provider-specific integrations should remain isolated.
- Security, accessibility, testing, and Hobby-tier cost awareness are continuous requirements.
