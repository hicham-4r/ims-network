/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS test */
// Offline structural guard for Phase 16.19G. Not a substitute for Next.js build/Preview tests.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const file = path.join(root, "src", "app", "(app)", "layout.tsx");
const nextConfig = path.join(root, "next.config.ts");
const source = fs.readFileSync(file, "utf8");
const config = fs.readFileSync(nextConfig, "utf8");
const beforeBoundary = source.split("async function AuthorizedMemberContent(")[0];
const withinBoundary = source.split("async function AuthorizedMemberContent(")[1];

assert.ok(/export default function MemberLayout\s*\(/.test(source), "Layout must be synchronous and not fetch auth");
assert.ok(beforeBoundary.includes("<Suspense"), "Require Suspense boundary");
assert.ok(beforeBoundary.includes("<AuthorizedMemberContent>{children}</AuthorizedMemberContent>"), "Children must sit behind the gate");
assert.ok(!beforeBoundary.includes("<MemberShell"), "Personalized workspace must stay behind request-time Suspense gate");
assert.ok(beforeBoundary.includes("fallback="), "Keep static loading fallback");
assert.ok(!beforeBoundary.includes("await getApplicationPageAccount()"), "No auth query during shell render");
assert.match(withinBoundary, /const \{ accountState, session, profile \} = await getApplicationPageAccount\(\);/, "Keep request-time auth");
assert.ok(withinBoundary.indexOf("getApplicationPageAccount()") < withinBoundary.indexOf("redirectRestrictedAccount(accountState.status)"), "Keep server auth ordering");
assert.ok(withinBoundary.includes("return <MemberShell"), "Render the personalized shell only within gate");
assert.ok(withinBoundary.indexOf("redirectRestrictedAccount(accountState.status)") < withinBoundary.indexOf("return <MemberShell"), "Authorize before shell and child content");
assert.ok(withinBoundary.includes('canAdmin={accountState.role === "ADMIN"}'), "Keep server-derived admin visibility");
assert.ok(withinBoundary.includes("{children}</MemberShell>"), "Children remain within authorized workspace");
assert.ok(!/['"]use cache['"]/.test(source), "Never cache private session state");
assert.ok(/cacheComponents:\s*true/.test(config), "Keep cacheComponents optimization");
assert.ok(/partialPrefetching:\s*true/.test(config), "Keep partialPrefetching optimization");
console.log("PHASE 16.19G AUTH BOUNDARY STRUCTURAL TEST: PASS");
