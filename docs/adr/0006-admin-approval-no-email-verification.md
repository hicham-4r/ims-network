# ADR 0006 — Administrator Approval Without Email Verification

## Status

Accepted by product owner, 2026-11-23. Supersedes the *email verification*
requirement of ADR 0004 and older Phase 8/9 documentation. It does not
supersede the Better Auth/session, security, or message-durability decisions.

## Decision

- Users register with email and password; Better Auth does not require an
  email-verification link and sends none on signup or sign-in.
- Sign-up does not automatically authenticate the applicant. A generic
  success response reduces enumeration of registered addresses.
- A Better Auth `user.create.after` hook creates MEMBER/PENDING_APPROVAL.
- On login, account-state reconciliation ensures the row exists and converts
  legacy UNVERIFIED to PENDING_APPROVAL only. ACTIVE/REJECTED/SUSPENDED are
  preserved without alteration.
- An authorized admin alone approves PENDING_APPROVAL -> ACTIVE, with the
  existing atomic state transition, audit trail, and revocation protections.
- Protected pages, server actions, direct messages and WebSocket notifications
  still require an ACTIVE account and a valid, non-expired session.
- Email ownership is **not established** by an applicant-provided address.
  The admin must confirm alumni eligibility and applicant identity by an
  independent process before approving.

## Compatibility

The PostgreSQL `UNVERIFIED` enum value, `user.email_verified` column,
Better Auth `verification` table (also used for password reset), and
existing schema default remain for backward compatibility. The application
no longer treats email_verified as proof of access eligibility. No schema
migration is needed for this application change. Legacy users enter the
admin review queue upon their next successful sign-in. Existing ACTIVE,
REJECTED, and SUSPENDED accounts are never automatically promoted.

## Preserved security and cost boundaries

- Better Auth password hashing, secure HttpOnly sessions, and reset-token
  validation stay unchanged. Resend remains for **password reset only**.
- Registration/login/reset rate limits, origin checks, server authorization,
  account audit, Redis and WebSocket isolation, and PostgreSQL durable storage
  stay unchanged.
- Reset emails to arbitrary recipients still require working provider/sender
  configuration; removal of verification does not fix Resend sender limits.
- No automatic privilege grants, secret leakage, provider upgrades or cost
  additions are introduced.

## Required acceptance tests

1. Signup sends no verification email, returns a generic success view.
2. New user row is PENDING_APPROVAL and MEMBER without a login.
3. Correct credentials while pending redirect to pending page; all member,
   admin and WebSocket protected accesses remain denied.
4. Admin approval is audited and turns the account ACTIVE; messaging works.
5. Rejected/suspended accounts remain denied, with sessions revoked.
6. Old UNVERIFIED account is converted only to PENDING_APPROVAL on login.
7. Password reset still uses Better Auth/Resend with expiration and revocation.
8. Re-run Preview-only browser and integration checks before Production.
