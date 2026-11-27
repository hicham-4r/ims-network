# Phase 22.5 — final interaction and accessibility polish

Baseline: Community Upgrade V2 with the exact delivery-tracker lint correction. No schema, server, Redis, WebSocket, auth or dependency changes. Preview only; no local hosted-database runtime required.

## Changes
- Command palette arrow-key focus navigation; return focus after close.
- Local calendar day grouping with deterministic UTC SSR fallback; Today/Yesterday labels.
- Message search and history remain bounded; history is keyboard-scrollable; refresh feedback and reaction keyboard dismissal.
- Inbox loading skeleton, improved mobile sizing, safe-area spacing, thinner scrollbars, sticky desktop header, reduced-motion-aware skeletons and toast spinner.
- No added provider operations by design; not a measured guarantee. No new migrations.

## Acceptance
Run the offline runner and local typecheck, lint, diff checks. Deploy once to protected Preview. Verify both accounts, replies/reactions, receipt, typing/presence opt-in, notification history, report workflow, reconnection, PWA, keyboard palette, local date near midnight, touch controls and reduced-motion. Check 320–430px, 768px, 1366px and 1920px, landscape and browser zoom. Check Chrome, Firefox and Safari where available. Review Vercel/Neon/Redis before and after a bounded trial; no 100-user stress run until final release gate. No Production deploy.

Source rollback is source-only. Existing nine Preview migrations remain in place.
