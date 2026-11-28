# v1.0.0 — Release evidence and limitations

Initial public launch: **28 November 2026**. Maintainer: **hicham-4r**. Application: https://ims-network.vercel.app. Release: https://github.com/hicham-4r/ims-network/releases/tag/v1.0.0.

Accepted application source: `03f060f84fdee2d148b42c4825f163e830c79571` (Phase 25D verified source archive). The maintainer reported publishing the v1.0.0 release. Later docs-only commits do not change the deployed application or the release tag. The live tag/deployment linkage was not independently queried when assembling this documentation.

## Acceptance record

| Gate | Result and evidence |
| --- | --- |
| Core Production functionality | 28/28 maintainer-reported checks (owner, registration, realtime) |
| Authentication hotfix | Local/CI passed; 11 Preview and 13 Production checks reported passed |
| Owner recovery | Reset email, password update, revocation, single-use link and negative unverified-email checks reported passed |
| Password change and UI polish | Local/CI, manual Preview for main upgrade and protected Production acceptance reported passed; two small UI refinements went directly to protected Production after local/CI checks |
| Password security | Rejected extra target field (400), unsupported media (415), throttling reported; competing Preview requests returned 403 and 200; remaining checks reported passed except hosted invalid-origin test |
| Feature activation | Privacy data, member recovery codes and opt-in activity; 22 checks reported passed |
| Final security and cleanup | Maintenance and final checks reported passed; SQL verification screenshot showed one preserved owner, zero test emails/conversations/messages, and verification condition preserved seven audit records |
| Public launch | 9/9 checks reported passed, anonymous member/admin routes denied and Preview protected |
| PWA | 8/8 checks reported passed, manifest public, mobile installation and private offline access protection |

The documentation combines inspected source, historical test records, maintainer reports and screenshots. It is not an independent security audit or exhaustive concurrency test. No production credentials, private data, account identifiers or raw logs are included.

## Known limitations and follow-up

- Live invalid-Origin rejection was inconclusive in Chrome and additional hosted verification was waived. Source and mocked route coverage passed; schedule definitive verification in an isolated environment. This is not a claim of live CSRF-test success.
- The pre-launch dependency audit reported four moderate findings in `npm audit --omit=dev` and fourteen in the full audit, involving esbuild development-server and minimatch glob processing advisory chains. No high/critical findings were reported in that snapshot. Runtime reachability was not exhaustively established. See [esbuild advisory](https://github.com/advisories/GHSA-67mh-4wv8-2f99) and [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75qw-m249). Review compatible upgrades and retest; no force fixes.
- Competing authenticated password changes were tested, not all concurrent sign-in/reset/recovery interactions. WebSocket revocation is bounded, not instant global disconnect.
- Account deletion is a manual workflow. Audit history is preserved. Do not repeat the pre-launch cleanup against real alumni.
- Earlier protected-deployment manifest credential errors disappeared after public launch according to maintainer PWA checks. Preview manifest installation under protection is not claimed fixed.
- Track quota usage, idle relay connections, provider eligibility, recovery windows and log retention. No claim of permanent zero cost, guaranteed uptime or 100 sustained monthly concurrent users.

See [operations runbook](phase23-release-runbook.md) and [performance evidence](phase23-performance-evidence.md).
