# ADR 0004: Better Auth Session Model

## Status

Accepted for session architecture. The former email-verification requirement is superseded by ADR 0006.

## Context

IMS Network requires secure registration, email verification, password reset, account approval, login, logout, and session invalidation.

Authentication mechanics should not be implemented as a custom JWT or localStorage-based system.

Authorization and application account state must remain server-enforced.

## Decision

Use Better Auth as the target authentication library.

The application will use secure cookie-based sessions.

The main authentication credential must not be stored in localStorage or placed in URLs.

Protected server operations will derive the authenticated actor from the validated server-side session.

Application authorization helpers will be centralized around concepts such as:

- requireUser()
- requireActiveMember()
- requireAdmin()

Account state remains an application-level authorization concern even when a valid authentication session exists.

## Alternatives Considered

- custom JWT authentication
- custom password/session implementation
- localStorage bearer-token authentication
- building a custom OAuth server

## Consequences

### Positive

- authentication mechanics are delegated to a dedicated library
- secure cookie-based session model
- less custom security-sensitive code
- centralized authorization boundaries
- clearer account-state enforcement

### Negative

- the project depends on Better Auth APIs and migrations
- authentication integration must be kept current with official documentation
- account-state rules still require application-specific implementation

## Implementation Status

Not implemented yet.

Better Auth will be introduced only after the database foundation exists.

No Better Auth secret is required at the current implementation stage.

## Security Invariants

- never trust a user ID or admin flag supplied by the browser
- never rely on hidden UI elements for authorization
- never store the principal auth token in localStorage
- never put the principal auth token in WebSocket query parameters
- rejected or suspended accounts must not retain normal protected access
