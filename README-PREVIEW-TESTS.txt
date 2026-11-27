IMS NETWORK — PHASE 14 PREVIEW-ONLY INTEGRATION TEST RUNNER
2026-11-15

PURPOSE
Run internal messaging-store tests against the separate ims-network-preview
Neon database, without additional Resend accounts or repetitive browser work.
The launcher accepts a secret pasted at a hidden PowerShell prompt and checks
an explicit preview hostname, branch, and database. No .env.local edits.

INSTALL
1. Confirm the local repository is C:\dev\ims-network and current branch is
   phase14-messaging with no tracked changes.
2. Run: git switch -c test/phase14-preview
3. Unzip this bundle into C:\dev\ims-network, preserving the tools\ paths.
4. Review both scripts locally before running. Do not commit secrets.

RUN
From Project PowerShell (C:\dev\ims-network):
   powershell -NoProfile -File .\tools\run-phase14-preview.ps1
Type PREVIEW when prompted. Paste the *direct* connection string from the
ims-network-preview Neon project, in the hidden-input prompt.
The URL is never saved to disk or printed. The process only runs on the
hard-allowlisted Preview host.

TEST COVERAGE
- Preview host and messaging migrations preflight
- Temporary ACTIVE users using @example.invalid emails; no passwords/sessions
- Conversation creation + reverse duplicate prevention
- Ordered message persistence, idempotent retry, conflicting retry denial
- History/inbox data, outsider denial, private membership rules
- Unread counts and monotonic read cursor
- Suspension privacy and restored access
- Finally cleanup and residual data verification

SAFETY
- The test writes ONLY randomized synthetic fixtures to Preview Neon.
- It cleans up only its own randomized identifiers. No real member deletes.
- If the process is forcibly terminated, fixtures could remain; do not rerun
  blindly if cleanup was not confirmed.
- No schema migration, deploy, Git push, or production changes.
- Do not paste credentials, access tokens or session cookies into ChatGPT.
- This is an internal service-store test, NOT a deployed HTTP/Better Auth
  session test and NOT a real browser-to-browser messaging test.
- A later targeted browser test remains necessary for UI/authentication.

DO NOT push the test branch without explicit approval. Keep phase14-messaging
as the stable checkpoint and origin/main unchanged.
