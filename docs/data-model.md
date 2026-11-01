# IMS Network Data Model

## Status

Phase 6 database foundation.

This document describes the schema that currently exists in the new IMS Network PostgreSQL database.

The new Neon PostgreSQL database is the durable source of truth for the rebuilt application.

Legacy Railway data migration is deferred. The schema must remain compatible with a future controlled migration, but the current development database does not depend on the legacy database.

## Database Provider

- PostgreSQL
- Neon
- Drizzle ORM
- Drizzle Kit migrations

## Connection Roles

### Application runtime

The application uses the pooled Neon connection through:

    DATABASE_URL_POOLED

The runtime database adapter uses:

    @neondatabase/serverless
    drizzle-orm/neon-http

### Migration tooling

Drizzle Kit uses the direct Neon connection through:

    DATABASE_URL

Real connection strings are stored only in:

    .env.local

They must never be committed.

## Migration Policy

Schema changes follow this workflow:

1. edit the Drizzle schema;
2. generate a migration;
3. inspect the generated SQL;
4. apply the migration to the development database;
5. verify the resulting schema;
6. run project quality checks;
7. commit the schema and migration together.

Do not use automatic schema push as the production migration strategy.

## Current PostgreSQL Types

### account_status

Values:

- UNVERIFIED
- PENDING_APPROVAL
- ACTIVE
- REJECTED
- SUSPENDED

This enum represents the planned application account lifecycle.

No application user-state table exists yet. That table will be introduced in the appropriate account-state phase.

### account_role

Values:

- MEMBER
- ADMIN

No application role table exists yet.

## Current Tables

There are currently no IMS Network domain tables.

This is intentional.

Better Auth database tables will be introduced during the authentication phase using the integration selected at that time.

Application profile, account-state, messaging, audit, and other domain tables will be added in their respective roadmap phases rather than being invented prematurely.

## Drizzle Migration Metadata

Drizzle maintains its migration history under the PostgreSQL schema:

    drizzle

Current migration tracking table:

    drizzle.__drizzle_migrations

## Current Migration

The initial migration creates:

- account_role enum;
- account_status enum.

It creates no application tables.

## Legacy Migration Compatibility

The new schema should remain suitable for a later controlled migration from the preserved Railway PostgreSQL source.

Future migration tooling should use deterministic legacy-ID to new-ID mappings where necessary.

Legacy sessions, bearer tokens, password-reset tokens, verification tokens, and other transient authentication credentials must not be imported as trusted active credentials.

## Security Rules

- DATABASE_URL must never be committed.
- DATABASE_URL_POOLED must never be committed.
- .env.local remains Git-ignored.
- .env.example contains placeholders only.
- database credentials must never use NEXT_PUBLIC_ variables.
- PostgreSQL remains the durable source of truth.
- migrations must be reviewed before application.
- raw provider errors must not expose credentials to users.

## Current Verification

The development database has been verified through the application database boundary.

The health query successfully returns:

- connection success;
- current database name;
- database timestamp.

The initial enum migration was also verified against Neon.
