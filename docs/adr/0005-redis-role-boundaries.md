# ADR 0005: Redis Role Boundaries

## Status

Accepted as target architecture

## Context

IMS Network requires selected caching, rate limiting, short-lived distributed coordination, and cross-instance real-time relay.

The initial deployment target is Vercel Hobby, so Redis usage must remain deliberate and measurable.

Redis must not become a second durable application database.

## Decision

Use Upstash Redis only for responsibilities where ephemeral shared state provides clear value.

Approved target responsibilities include:

- selected cache-aside application data
- rate-limit counters
- short-lived distributed coordination
- bounded Redis Streams for cross-instance real-time relay

PostgreSQL remains authoritative for durable application data.

Redis will not be used as the source of truth for:

- permanent messages
- user profiles
- authentication passwords
- durable account state
- audit logs
- permanent conversation history

Cache entries must have an explicit invalidation strategy.

## Real-Time Boundary

Redis may relay compact real-time events between active Vercel Function instances.

Redis Streams are transport, not message history.

Clients must reconcile missed events from PostgreSQL.

Real-time connections must be lazy and route-scoped.

The baseline must not introduce:

- global authenticated-user WebSockets
- one WebSocket per conversation
- high-frequency presence heartbeats
- typing indicators before budget measurement

## Alternatives Considered

- using PostgreSQL alone for every ephemeral operation
- dedicated message brokers
- Redis as the primary database
- in-memory process-only real-time state

## Consequences

### Positive

- cross-instance coordination without introducing a dedicated message broker
- suitable caching and rate limiting
- preserves PostgreSQL durability
- supports the planned Vercel WebSocket architecture

### Negative

- introduces another external provider
- command usage must be measured
- cache invalidation requires discipline
- real-time logic must tolerate Redis outages and missed events

## Implementation Status

Not implemented yet.

No Redis credentials are required at the current implementation stage.
