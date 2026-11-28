/* eslint-disable @typescript-eslint/no-require-imports -- Offline source-module regression */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
function load(file, imports, globals = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true, fileName: file });
  assert.equal(result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  const exports = {};
  vm.runInNewContext(result.outputText, { exports, require: name => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
    return imports[name];
  }, ...globals }, { filename: file });
  return exports;
}
async function main() {
  const sentinel = new Error("synthetic prerender suspension");
  const providerError = new Error("synthetic secret query parameter");
  const requestHeaders = {};
  const expected = { user: { id: "synthetic" } };
  let mode = "ok";
  const calls = [];
  const events = [];
  const reportFailure = event => events.push(event);
  const session = load("src/server/auth/session.ts", {
    "@/server/observability/safe-events": { reportFailure },
    "next/server": { connection: async () => { calls.push("connection"); if (mode === "boundary") throw sentinel; } },
    "next/headers": { headers: async () => { calls.push("headers"); if (mode === "headers") throw sentinel; return requestHeaders; } },
    "./auth": { auth: { api: { getSession: async ({ headers }) => { calls.push("db"); assert.equal(headers, requestHeaders); if (mode === "provider") throw providerError; return mode === "anonymous" ? null : expected; } } } },
  });
  assert.equal(await session.getCurrentSession(), expected);
  assert.deepEqual(calls.splice(0), ["connection", "headers", "db"]);
  mode = "boundary";
  await assert.rejects(session.getCurrentSession(), e => e === sentinel);
  assert.deepEqual(calls.splice(0), ["connection"]);
  mode = "headers";
  await assert.rejects(session.getCurrentSession(), e => e === sentinel);
  assert.deepEqual(calls.splice(0), ["connection", "headers"]);
  assert.deepEqual(events, []);
  mode = "provider";
  await assert.rejects(session.requireAuthenticatedSession(), e => e.message === "Session lookup temporarily unavailable." && e !== providerError);
  assert.deepEqual(events.splice(0), ["session_lookup_failed"]);
  mode = "anonymous";
  await assert.rejects(session.requireAuthenticatedSession(), e => e.name === "AuthenticationRequiredError");
  assert.equal(await session.getCurrentSession(), null);
  const lines = [];
  let now = 1;
  const safe = load("src/server/observability/safe-events.ts", {}, { console: { warn: line => lines.push(line) } });
  const reporter = safe.createFailureReporter(line => lines.push(line), () => now);
  const { auth: options } = load("src/server/auth/auth.ts", {
    "@/server/observability/safe-events": { reportFailure: reporter },
    "@better-auth/drizzle-adapter": { drizzleAdapter: () => ({}) },
    "better-auth/minimal": { betterAuth: config => config },
    "next/server": { after: () => {} },
    "@/server/db": { db: {} },
    "@/server/account-state/service": { createPendingAccountState: () => {} },
    "@/server/db/schema": {},
    "@/server/email": { sendPasswordResetEmail: () => {} },
    "@/server/env": { serverEnv: { BETTER_AUTH_URL: "https://example.invalid", BETTER_AUTH_SECRET: "synthetic" } },
  });
  assert.equal(options.logger.level, "warn");
  assert.equal(options.session.cookieCache.enabled, false);
  assert.equal(options.emailAndPassword.revokeSessionsOnPasswordReset, true);
  assert.equal(options.emailAndPassword.requireEmailVerification, false);
  for (let i = 0; i < 100; i++) options.logger.log("error", "synthetic session token", providerError, { password: "synthetic" });
  options.logger.log("warn", "synthetic secret", providerError);
  options.logger.log("debug", "synthetic secret");
  options.logger.log("info", "synthetic secret");
  assert.deepEqual(lines.map(line => JSON.parse(line)), ["auth_internal_error", "auth_internal_warning"].map(event => ({ component: "ims-network", schema: 1, level: "warn", event })));
  now += 60000;
  options.logger.log("error", "synthetic secret");
  assert.equal(lines.length, 3);
  assert.ok(!lines.join(" ").includes("synthetic"));
  console.log("PHASE25A5_AUTH_RUNTIME PASS (mocked framework and provider)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
