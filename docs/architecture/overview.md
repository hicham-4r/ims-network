# IMS Network architecture — Phase 22 baseline

Protected Preview is user-accepted. Production readiness and CI execution are separate gates. See ADRs for historical decisions.

## Components and trust boundaries

```mermaid
flowchart TB
  B[Authenticated browser] -->|HTTPS / HttpOnly session| N[Next.js server]
  N --> A[Better Auth + ACTIVE account gate]
  A --> Q[Authorized services]
  Q -->|Pooled runtime queries| P[(Neon PostgreSQL)]
  Q -->|REST cache, rate limit, append| R[(Upstash Redis)]
  Q -->|Authenticated avatar access| V[Private Blob]
  Q --> E[Recovery email]
  B -->|Lazy authenticated WS| W[Socket access and local hub]
  R -->|TLS TCP bounded XREAD| W
  W -->|Scoped change notice| B
```

The durable database stores membership, profiles, conversations, messages, read cursors, delivery acknowledgments and moderation records. Requests derive identity from server sessions. Admin approval remains required; email verification no longer gates registration. Legacy UNVERIFIED state is retained for compatibility. The review-only moderator capability is separate from ADMIN, controlled by the owner. Private message bodies are not exposed to reviewers.

React request-scoped cache deduplicates page-account reads within a render only. Member detail cache uses a profile revision and fresh ACTIVE checks. Cache misses and failures have explicit behavior; authorization is not bypassed. Lists are bounded and paginated. Avatars use the existing authenticated endpoint. PWA service worker does not store private responses offline.

## Message lifecycle

```mermaid
sequenceDiagram
  participant A as Sender browser
  participant S as Authorized service
  participant D as PostgreSQL
  participant R as Redis stream
  participant W as Recipient WebSocket
  participant B as Recipient browser
  A->>A: Optimistic bubble with client UUID
  A->>S: Send / explicit retry with same UUID
  S->>D: Authorized persistence
  S-->>A: Durable result
  S->>R: Scoped change notice
  R-->>W: Bounded TCP stream read
  W-->>B: Authorized refresh notice
  B->>S: Reconcile bounded history
  B->>S: Browser acknowledgment / read cursor
```

Publication is best effort; persisted messages survive relay failure. Reconciliation handles missed notices. The compatible RESP2 TCP adapter uses TLS verification and explicit connection options. No global socket or idle presence heartbeat. Typing and activity are opt-in, conversation-scoped and expire for display. Read receipts reflect stored cursor; delivery means browser acknowledgment, not all-device guarantee.

## Environment separation

Development, protected Preview and future Production must have independently verified database targets and Redis isolation. Preview has nine recorded migrations as reported by the maintainer. Production begins with a fresh database unless a legitimate legacy export becomes available. Direct SQL migration credentials and pooled runtime credentials have distinct roles. Runtime Frankfurt routing was observed for the diagnostic WebSocket invocation; verify new deployments. Build region may differ. Git-triggered Vercel deploys remain disabled.

## Related references

[Data model](../data-model.md), [avatar storage](../avatar-storage.md), [community upgrade](../phase22-community-upgrade.md), [performance baseline](../phase21fg-performance.md), [release runbook](../phase23-release-runbook.md).
