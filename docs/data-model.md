# IMS Network Data Model

## ESITH IMS alumni scope (2026-11-03)

IMS Network is for alumni of ESITH's IMS program in Morocco. Public profile
fields are `display_name`, `program`, `graduation_year`, and `bio`; school is
static application copy. No department field is displayed, edited, or searched.

The already-applied Phase 10 migration `0003_steep_roulette.sql` created nullable
`department` and `department_search` columns. They are temporarily retained
in PostgreSQL and the Drizzle schema to avoid destroying existing data or
rewriting applied migration history. Application profile writes and directory
queries no longer use them. A separate reviewed migration may drop them after
confirming whether they contain data and preserving a backup if necessary.

Membership is gated by `ACTIVE` status after explicit administrative approval;
email verification does not itself establish alumni eligibility.

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

## Better Auth Core Schema

Phase 7 introduced the Better Auth persistence layer.

Current authentication tables:

- user
- session
- account
- verification

### user

Stores the Better Auth identity record.

Important fields include:

- id
- name
- email
- email_verified
- image
- created_at
- updated_at

The email column is unique.

### session

Stores authenticated sessions.

Important fields include:

- id
- expires_at
- token
- created_at
- updated_at
- ip_address
- user_agent
- user_id

The session token is unique.

session.user_id references user.id with ON DELETE CASCADE.

### account

Stores authentication-provider credentials and provider metadata.

For the current email/password configuration, Better Auth creates a credential account with a stored password hash.

account.user_id references user.id with ON DELETE CASCADE.

### verification

Reserved for verification and token workflows used by Better Auth.

Email verification itself is not implemented yet. That belongs to Phase 8.

## Authentication Boundary

Authentication is implemented through Better Auth.

Current server-side components include:

- src/server/auth/auth.ts
- src/server/auth/session.ts
- src/server/auth/index.ts

The browser-side client lives at:

- src/lib/auth-client.ts

The Better Auth API route is:

- /api/auth/[...all]

Protected server pages derive identity from the validated Better Auth session.

The application does not trust browser-supplied user IDs, query parameters, or custom identity headers.

## Phase 7 Verification

The following behaviors were manually verified:

- account registration succeeds;
- credential account creation succeeds;
- session creation succeeds;
- sign-out removes the active session;
- sign-in creates a fresh session;
- anonymous dashboard access is denied;
- forged userId query parameters do not grant access;
- forged X-User-Id headers do not grant access;
- incorrect passwords are rejected;
- incorrect-password attempts do not create additional sessions.

Email verification and password-reset flows are intentionally deferred to Phase 8.

## Phase 8 â€” Email verification and password recovery

Better Auth owns all verification and password-reset tokens. IMS Network does not create, persist, or validate custom authentication tokens.

Email verification behavior:
- New email/password accounts must verify email ownership before sign-in.
- Verification links are generated and validated by Better Auth.
- Verification links expire after one hour.
- Verification does not automatically create an authenticated session.
- Unverified users cannot access authenticated application routes.
- Verification emails are delivered through the server-only Resend adapter.

Password recovery behavior:
- Password-reset links are generated and validated by Better Auth.
- Reset links expire after one hour.
- Password-reset responses remain generic to reduce account-enumeration leakage.
- Existing sessions are revoked after a successful password reset.
- Used reset tokens cannot be reused.
- Reset tokens are removed from the browser address bar after the reset page reads them.

Resend development limitation:
- Development currently uses the Resend test sender.
- Production must use a verified application-owned email domain before arbitrary recipient delivery is enabled.

## Phase 9 â€” Application account state

IMS Network separates authentication identity from application authorization.

Better Auth owns authentication identity and sessions.

The application-owned `application_user_state` table owns member access state:

- `UNVERIFIED`
- `PENDING_APPROVAL`
- `ACTIVE`
- `REJECTED`
- `SUSPENDED`

Application roles are:

- `MEMBER`
- `ADMIN`

State transitions:

- `UNVERIFIED -> PENDING_APPROVAL` after verified email ownership
- `PENDING_APPROVAL -> ACTIVE` through explicit administrator approval
- `PENDING_APPROVAL -> REJECTED` through explicit administrator rejection
- `ACTIVE -> SUSPENDED` through administrator suspension
- `SUSPENDED -> ACTIVE` through administrator restoration

There is no automatic transition to `ACTIVE`.

Only `ACTIVE` accounts receive normal member access.

Rejected and suspended transitions revoke existing Better Auth database sessions so an old browser cookie cannot retain normal application access.

The `audit_logs` table records privileged account-management events. Audit metadata is intentionally minimal and must never contain passwords, cookies, authentication secrets, reset tokens, verification tokens, provider credentials, or database connection strings.
