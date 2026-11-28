/* eslint-disable @typescript-eslint/no-require-imports -- Offline source-module regression */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
function load(file, imports = {}, globals = {}) {
  const result = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true, fileName: file });
  assert.equal(result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, file);
  const exports = {};
  vm.runInNewContext(result.outputText, { exports, require: name => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
    return imports[name];
  }, URL, Request, Response, Headers, Uint8Array, process: { env: { VERCEL_ENV: "production" } }, ...globals }, { filename: file });
  return exports;
}
async function main() {
  const core = load("src/server/auth/password-change-core.ts");
  const input = { currentPassword: "fixture-old", newPassword: "fixture-new", confirmPassword: "fixture-new" };
  assert.ok(core.parsePasswordChange(input));
  for (const bad of [null, [], {}, { ...input, userId: "other" }, { ...input, revokeOtherSessions: false }, { ...input, currentPassword: "" }, { ...input, currentPassword: "a".repeat(129) }, { ...input, newPassword: "short", confirmPassword: "short" }, { ...input, newPassword: "a".repeat(129), confirmPassword: "a".repeat(129) }, { ...input, confirmPassword: "mismatch" }, { ...input, newPassword: input.currentPassword, confirmPassword: input.currentPassword }]) assert.equal(core.parsePasswordChange(bad), null);
  const boundary = load("src/server/auth/http-boundary.ts");
  const authGate = load("src/server/auth/auth-gate-core.ts", { "node:net": require("node:net") });
  const request = (body = input, url = "/api/auth/password-change", origin = "https://fixture.invalid", method = "POST") => new Request(`https://fixture.invalid${url}`, { method, headers: { origin, "Content-Type": "application/json", "x-vercel-forwarded-for": "192.0.2.1" }, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
  assert.equal(boundary.isSupportedAuthRequest(request()), true);
  for (const endpoint of ["/api/auth/change-password", "/api/auth/password-change/", "/api/auth/password-change/extra", "/api/auth/%70assword-change", "/api/auth/set-password", "/api/auth/revoke-sessions"]) assert.equal(boundary.isSupportedAuthRequest(request(input, endpoint)), false);
  assert.equal(boundary.isSupportedAuthRequest(request(input, "/api/auth/password-change", "https://fixture.invalid", "GET")), false);
  assert.equal(boundary.validateAuthPostHeaders(request(), "https://fixture.invalid"), null);
  assert.equal(boundary.validateAuthPostHeaders(request(input, "/api/auth/password-change", "https://evil.invalid"), "https://fixture.invalid").status, 403);
  assert.equal((await boundary.boundAuthPostBody(request({ ...input, extra: "x".repeat(17000) }))).status, 413);
  const events = [], calls = [];
  let session = { user: { id: "self" }, session: { id: "session-self" } };
  let rate = "allowed", rateUser = "allowed", result = "changed", throws = false;
  const decision = reason => ({ reason, allowed: reason === "allowed", retryAfterSeconds: 60 });
  const http = load("src/server/auth/password-change-http.ts", {
    "server-only": {}, "./password-change-core": core, "./auth-gate-core": authGate,
    "@/server/auth": { getCurrentSession: async () => { calls.push("session"); return session; } },
    "@/server/redis/rate-limit": { checkRateLimit: async (kind, subject, policy) => {
      assert.equal(kind, "passwordChange"); assert.equal(policy, "deny"); calls.push(subject);
      return decision(subject.startsWith("user:") ? rateUser : rate);
    } },
    "@/server/observability/safe-events": { reportFailure: event => events.push(event) },
    "./password-change-service": { changeOwnPassword: async (user, sid, data) => {
      calls.push("change"); assert.equal(user, "self"); assert.equal(sid, "session-self"); assert.equal(data.newPassword, input.newPassword);
      if (throws) throw new Error("fixture private credential"); return result;
    } },
  });
  const response = await http.handlePasswordChange(request());
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true });
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.deepEqual(calls.splice(0), ["ip:192.0.2.1", "session", "user:self", "change"]);
  assert.equal((await http.handlePasswordChange(request(input, "/api/auth/password-change?target=other"))).status, 400);
  assert.deepEqual(calls, []);
  rate = "unavailable"; assert.equal((await http.handlePasswordChange(request())).status, 503); assert.deepEqual(calls.splice(0), ["ip:192.0.2.1"]);
  rate = "limited"; assert.equal((await http.handlePasswordChange(request())).status, 429); assert.deepEqual(calls.splice(0), ["ip:192.0.2.1"]);
  rate = "allowed"; assert.equal((await http.handlePasswordChange(request({ ...input, targetUserId: "other" }))).status, 400); assert.deepEqual(calls.splice(0), ["ip:192.0.2.1"]);
  session = null; assert.equal((await http.handlePasswordChange(request())).status, 401); assert.deepEqual(calls.splice(0), ["ip:192.0.2.1", "session"]);
  session = { user: { id: "self" }, session: { id: "session-self" } }; rateUser = "limited";
  assert.equal((await http.handlePasswordChange(request())).status, 429); assert.deepEqual(calls.splice(0), ["ip:192.0.2.1", "session", "user:self"]);
  rateUser = "unavailable"; assert.equal((await http.handlePasswordChange(request())).status, 503); assert.deepEqual(calls.splice(0), ["ip:192.0.2.1", "session", "user:self"]);
  rateUser = "allowed"; result = "denied"; assert.equal((await http.handlePasswordChange(request())).status, 403);
  result = "invalid"; assert.equal((await http.handlePasswordChange(request())).status, 400);
  throws = true; const failed = await http.handlePasswordChange(request()); assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /private credential/); assert.deepEqual(events, ["password_change_failed"]);
  // Exercise the actual service with mocked tagged Neon queries and configured hasher.
  // The mock does NOT execute SQL or prove locking, atomicity, or race behavior.
  let rows = [{ account_id: "cred-self", password_hash: "fixture-hash", state_version: "1.2" }];
  let writes = [{ id: "fixture-audit" }];
  const verifyCalls = [], hashCalls = [], transactions = [], queries = [];
  const sql = (parts, ...values) => { const q = { text: parts.join("?"), values }; queries.push(q); return q.text.includes("SELECT a.\"id\" AS account_id") ? Promise.resolve(rows) : q; };
  sql.transaction = async statements => { transactions.push(statements); return [[], [], writes]; };
  const service = load("src/server/auth/password-change-service.ts", {
    "server-only": {}, "node:crypto": { randomUUID: () => "fixture-audit" }, "@neondatabase/serverless": { neon: () => sql },
    "@/server/auth": { auth: { $context: Promise.resolve({ password: {
      verify: async data => { verifyCalls.push(data.password); return data.password === input.currentPassword || data.password === "equivalent"; },
      hash: async password => { hashCalls.push(password); return "fixture-new-hash"; },
    } }) } }, "@/server/env": { serverEnv: { DATABASE_URL_POOLED: "fixture" } }, "./recovery-code-core": { RECOVERY_RECORD_PREFIX: "ims-recovery-v1:" },
  });
  assert.equal(await service.changeOwnPassword("self", "session-self", input), "changed");
  assert.deepEqual(verifyCalls.splice(0), [input.currentPassword, input.newPassword]); assert.deepEqual(hashCalls.splice(0), [input.newPassword]);
  const [lookup] = queries; assert.ok(lookup.values.includes("self") && lookup.values.includes("session-self")); assert.match(lookup.text, /s\."status" = 'ACTIVE'/);
  const transaction = transactions[0]; assert.equal(transaction.length, 3); assert.match(transaction[0].text, /statement_timeout/); assert.match(transaction[1].text, /lock_timeout/);
  const statement = transaction[2]; assert.ok(statement.values.includes("fixture-hash") && statement.values.includes("fixture-new-hash") && statement.values.includes("session-self") && statement.values.includes("ims-recovery-v1:self"));
  assert.match(statement.text, /FOR UPDATE OF s, u[\s\S]*FOR UPDATE OF a[\s\S]*FOR UPDATE OF x/);
  assert.match(statement.text, /a\."password" = \?[\s\S]*EXISTS \(SELECT 1 FROM live_session\)/);
  assert.match(statement.text, /DELETE FROM "session" WHERE "user_id" IN \(SELECT "user_id" FROM changed\)/);
  assert.match(statement.text, /DELETE FROM "verification" WHERE "id" = \? AND EXISTS \(SELECT 1 FROM changed\)/);
  assert.match(statement.text, /'PASSWORD_CHANGED'/); assert.doesNotMatch(statement.text, /UPDATE "application_user_state"|UPDATE "user"/);
  assert.equal(await service.changeOwnPassword("self", "session-self", { ...input, currentPassword: "wrong" }), "invalid"); assert.equal(transactions.length, 1);
  assert.equal(await service.changeOwnPassword("self", "session-self", { ...input, newPassword: "equivalent" }), "invalid"); assert.equal(transactions.length, 1);
  const validRows = rows; rows = []; assert.equal(await service.changeOwnPassword("self", "session-self", input), "denied"); rows = [...validRows, ...validRows]; assert.equal(await service.changeOwnPassword("self", "session-self", input), "denied"); assert.equal(transactions.length, 1);
  rows = validRows; writes = []; assert.equal(await service.changeOwnPassword("self", "session-self", input), "denied");
  const handler = read("src/app/api/auth/[...all]/route.ts");
  assert.ok(handler.indexOf("validateAuthPostHeaders(request") < handler.indexOf("await boundAuthPostBody(request)"));
  assert.ok(handler.indexOf("await boundAuthPostBody(request)") < handler.indexOf("return handlePasswordChange(bounded)"));
  assert.ok(handler.indexOf("return handlePasswordChange(bounded)") < handler.indexOf("handlers.POST(bounded)"));
  // Exercise the actual outer route to prove the dedicated operation cannot fall
  // through to the native framework mutation, including invalid origin/path cases.
  let nativeCalls = 0, customCalls = 0;
  const turnstile = load("src/server/auth/turnstile-core.ts");
  const outer = load("src/app/api/auth/[...all]/route.ts", {
    "@/server/observability/safe-events": { reportFailure: event => events.push(event) },
    "better-auth/next-js": { toNextJsHandler: () => ({ GET: async () => new Response(null, { status: 200 }), POST: async () => { nativeCalls++; return new Response(null, { status: 200 }); } }) },
    "@/server/auth/auth": { auth: {} }, "@/server/auth/auth-gate": { enforceAuthRateLimit: async () => null },
    "@/server/auth/password-change-http": { handlePasswordChange: async () => { customCalls++; return new Response(null, { status: 200 }); } },
    "@/server/env": { serverEnv: { BETTER_AUTH_URL: "https://fixture.invalid" } },
    "@/server/auth/turnstile-core": turnstile, "@/server/auth/http-boundary": boundary,
  });
  assert.equal((await outer.POST(request())).status, 200); assert.equal(customCalls, 1); assert.equal(nativeCalls, 0);
  assert.equal((await outer.POST(request(input, "/api/auth/change-password"))).status, 404);
  assert.equal((await outer.POST(request(input, "/api/auth/password-change", "https://evil.invalid"))).status, 403);
  assert.equal((await outer.POST(request({ ...input, extra: "x".repeat(17000) }))).status, 413);
  assert.equal(customCalls, 1); assert.equal(nativeCalls, 0);
  assert.equal((await outer.POST(request({}, "/api/auth/sign-out"))).status, 200); assert.equal(nativeCalls, 1);
  const form = read("src/components/auth/password-change-form.tsx"); assert.match(form, /current-password/); assert.match(form, /new-password/); assert.match(form, /aria-pressed/); assert.match(form, /window\.location\.replace/); assert.doesNotMatch(form, /localStorage|sessionStorage|console\.|setInterval/);
  const page = read("src/app/(app)/account-privacy/page.tsx"); assert.ok(page.indexOf("<PasswordChangeForm") < page.indexOf("{privacyEnabled(")); assert.match(page, /requireAccountStatusPage\("ACTIVE"\)/);
  const home = read("src/app/(public)/page.tsx"), header = read("src/components/layout/site-header.tsx");
  assert.doesNotMatch(home + header, /Current milestone|Next development work|No production users|#roadmap|id="roadmap"/);
  assert.match(home, /id="status"/); assert.match(home, /id="architecture"/); assert.match(home, /lg:max-w-\[calc\(62\.5%_-_1\.875rem\)\]/); assert.match(home, /mt-8 flex flex-wrap gap-3/); assert.match(home, /href="\/sign-up"/); assert.match(home, /href="\/sign-in"/); assert.match(home, /href="\/privacy"/);
  console.log("PHASE25B5_PASSWORD_CHANGE PASS (actual modules with mocked providers; structural SQL and landing assertions)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
