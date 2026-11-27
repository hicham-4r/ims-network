# Portfolio case study — IMS Network

## Problem and solution

ESITH IMS alumni need a private professional directory and communication space. The application combines account approval, professional discovery, direct chat, moderation and installability within a deliberately small hosted architecture.

## Engineering highlights to demonstrate

1. Membership gate and separation of authentication from application authorization.
2. PostgreSQL durable persistence with bounded paging and idempotent optimistic sends.
3. Redis cache revision strategy and TLS stream relay; recovery from a TCP initialization incident without replacing infrastructure.
4. Measured stress trial: 100 authenticated sockets overlapping for 60 seconds; distinguish this from continuous load and production capacity.
5. Responsive application shell, keyboard palette, themes, accessible motion, local date formatting and privacy-safe offline fallback.
6. Guarded migration workflow, CI quality checks and manual release approval.

## Demo and visuals (capture only with synthetic accounts)

Use a fresh test cohort and scrub browser chrome and IDs. Suggested shots: dashboard, directory with fictional profiles, chat with replies/reactions, narrow mobile view, administrative review queue. Capture light and dark modes at consistent viewport sizes. Do not commit current screenshots containing real names, avatars, private chat, provider dashboard IDs or protected deployment URLs. No screenshots are bundled because no approved synthetic captures exist yet. Do not claim a passing CI badge until the first actual GitHub run succeeds.

## Interview talking points

Explain why PostgreSQL remains authoritative, why Redis holds no durable history, how idempotent retry and reconciliation work, why a socket can be ready while relay fails, how diagnostic logging isolated the TCP issue, and why free-tier constraints led to opt-in activity instead of permanent heartbeats. Be clear about trade-offs: recent activity is not global online status; browser acknowledgment is not universal delivery; email verification was removed but account approval remains; notification history is not push. Production release and exact current provider capacity are not yet verified.
