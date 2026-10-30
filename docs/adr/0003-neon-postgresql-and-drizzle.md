# ADR 0003: Neon PostgreSQL and Drizzle ORM

## Status

Accepted as target architecture

## Context

IMS Network requires durable relational storage for accounts, profiles, conversations, messages, audit records, and other application data.

The application is designed for Vercel and should use a PostgreSQL provider that works naturally with serverless workloads.

The project also requires explicit, reviewable database migrations rather than hidden schema synchronization.

## Decision

Use Neon PostgreSQL as the target database provider and Drizzle ORM with Drizzle Kit for schema definition and migrations.

PostgreSQL remains the durable source of truth.

Database changes will be migration-driven.

Production schema changes must not rely on automatic schema push behavior.

Provider-specific database code should remain isolated under server-side modules.

## Alternatives Considered

- Railway PostgreSQL for the rebuilt application
- Prisma ORM
- custom SQL access without an ORM
- non-relational databases

## Consequences

### Positive

- PostgreSQL remains familiar and portable
- strong relational constraints
- TypeScript-native schema definitions
- explicit SQL migrations
- good fit for Vercel/serverless architecture
- database implementation remains understandable and inspectable

### Negative

- Neon becomes an external provider dependency
- connection behavior must be appropriate for serverless execution
- schema migrations require deliberate review and deployment discipline

## Implementation Status

Not implemented yet.

The database will be created in a later roadmap phase after the legacy Railway database inventory and migration mapping are understood.

No production database credentials belong in Git or state bundles.

## Verification

Future verification will include:

- reviewed Drizzle schema
- generated migrations
- inspected migration SQL
- development database connection
- database constraint tests
- DATABASE_URL absent from Git and state bundles
