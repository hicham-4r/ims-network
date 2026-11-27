# Phase 18A — Turnstile, auth gate and HTTP security

## Scope and deployment
No email verification is reintroduced. New accounts still begin PENDING_APPROVAL. The existing admin, session, upload, messaging, and Redis boundaries remain in effect. No migrations or dependency changes.

Registration and password-reset **requests** (not token redemption or login) require a Turnstile token on deployed builds. The widget is loaded only on those two forms. Sign-in still uses existing rate limits. Canonical POST paths are required. Missing/invalid challenge configuration or token is rejected before Redis; supplied tokens pass existing Redis rate limiting before calling Cloudflare. No extra Redis operations are introduced. Siteverify is bounded by a four-second timeout; response success, hostname and action are required for real keys. Cloudflare handles token expiry/single-use. No user IP, password or email is sent by the server to the verification endpoint. Test mode bypasses hostname/action checking solely because Cloudflare dummy responses omit them.

## Configuration (manually, never paste secrets into chat)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`: public widget key, build-time variable.
- `TURNSTILE_SECRET_KEY`: server-only secret, runtime variable.
- `IMS_TURNSTILE_TEST_MODE`: absent or false for real keys; true only for local or protected, database-isolated Preview tests with official dummy keys. Never set this on Production. All known dummy keys and their prefixes are refused in Production regardless of flag. Missing keys fail closed on deployed registration/recovery; local `next dev` can omit both keys for development.
- Production: use a real Cloudflare Turnstile managed widget whose hostname list includes the actual Production host (e.g. ims-network.vercel.app). Confirm real hostname/action validation; no custom domain purchase needed for Turnstile. Preview may use separate real widget with the exact deployment hostname, or dummy keys for protected smoke testing. Dummy success is not evidence of bot protection.
- Preview auth rate limiting now fails closed if isolated Redis is absent; existing Preview Redis credentials must be configured. Do not reuse Production credentials.

## Live acceptance
1. Confirm Preview protection and isolated Neon/Redis. Set Preview-only dummy keys and explicit test flag from Cloudflare official testing docs if no real Preview widget yet; deploy with relay disabled. Check registration to PENDING_APPROVAL, denied member/admin access before approval, then administrator approval. Verify two existing members can still sign in and access their own messages.
2. With DevTools inspect the actual auth POST status, without sharing request headers. Missing challenge: POST with same-origin headers and empty JSON returns 400; bogus/expired/reused real challenge returns 403; unavailable verifier/config returns 503. Test keys do not model real replay protection. Never replay credentials or reset tokens. Confirm old verify-email endpoint remains 404. A second valid registration requires fresh widget token.
3. Confirm recovery form generic response; actual email delivery to arbitrary users remains limited by current Resend setup. No automatic email-ownership assurance. Verify eligibility and claimed identity before admin approval; email-based recovery proves mailbox control, not applicant identity. An impersonated address can be recovered by its actual owner. Do not approve accounts with disputed ownership. A recovery redesign remains a launch gate.
4. Check headers, browser console and layout on dashboard, signup, recovery, admin, avatar, messages and WS. Minimal CSP enforces frame/object/base restrictions; broader script policy is report-only, no report collector. Do not claim full XSS mitigation. Nonce CSP would change rendering/cache behavior and requires a separate decision.
5. Test real keys with exact hostname/action, and reject dummy keys before public launch. Confirm protection against direct API calls and path variants. Test existing Redis rate-limit and outage behavior. Do not disable account approval.

## Remaining Phase 18 exit gates
- Review package-lock and current advisories (`npm audit --omit=dev`, `npm audit`); do not auto-fix or ignore high/critical findings. Review Git tracked files for secrets without displaying values; no `.env` or tokens in bundles. Set up Dependabot on GitHub after reviewing existing workflows. Review provider runtime logging (including DB query parameter redaction) and disable any debug logging. Do not paste raw logs.
- Audit CORS/origin/CSRF on all mutations, upload serving, raw SQL, WS reauthorization and frame limits, account-state gates and Redis cache authorization. Existing regression tests are not substitutes for live negative tests. Inspect resource dashboards and check quotas under measured load. Phase 17 live acceptance remains pending unless actually tested.
- Report-only CSP observations, production-key validation, password recovery decision, threat model and remaining advisory/security review are required before declaring full Phase 18 complete.

Official references: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/ and https://developers.cloudflare.com/turnstile/troubleshooting/testing/ and https://nextjs.org/docs/app/api-reference/config/next-config-js/headers .
