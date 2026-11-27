/* eslint-disable @typescript-eslint/no-require-imports -- Standalone mock/structural tests */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const read = p => fs.readFileSync(p, "utf8");
function load(p, deps, globals = {}) {
  const result = ts.transpileModule(read(p), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, reportDiagnostics: true });
  assert.equal(result.diagnostics.filter(x => x.category === ts.DiagnosticCategory.Error).length, 0);
  const mockModule = { exports: {} };
  vm.runInNewContext(result.outputText, { exports: mockModule.exports, module: mockModule, require: name => {
    if (Object.hasOwn(deps, name)) return deps[name];
    throw Error(`unexpected dependency: ${name}`);
  }, ...globals });
  return mockModule.exports;
}
async function main() {
  const session = { user: { id: "member-a" } };
  const state = { userId: "member-a", status: "ACTIVE", role: "MEMBER" };
  const profile = { userId: "member-a" };
  const tables = { applicationUserState: { userId: "state.user_id" }, profiles: { userId: "profile.user_id" } };
  let rows = [{ accountState: state, profile }], fallback = 0, queries = 0, broken = false;
  const fallbackResult = { session, accountState: { ...state, status: "PENDING_APPROVAL" }, profile };
  const db = { select: columns => {
    queries++;
    assert.equal(columns.accountState, tables.applicationUserState);
    assert.equal(columns.profile, tables.profiles);
    return { from: table => { assert.equal(table, tables.applicationUserState); return {
      innerJoin: (table2, condition) => { assert.equal(table2, tables.profiles); assert.equal(condition, "state.user_id=profile.user_id"); return {
        where: condition2 => { assert.equal(condition2, "state.user_id=member-a"); return {
          limit: async n => { assert.equal(n, 1); if (broken) throw Error("database failed"); return rows; }
        }; }
      }; }
    }; } };
  } };
  const loader = load("src/server/account-state/page-context.ts", {
    "server-only": {}, "drizzle-orm": { eq: (a,b) => `${a}=${b}` }, "@/server/db": { db }, "@/server/db/schema": tables,
    "@/server/observability/page-timing": { measurePageStage: (_stage, fn) => fn() },
    "./context": { loadApplicationAccountContext: async s => { assert.equal(s, session); fallback++; return fallbackResult; } }
  }).loadPageApplicationAccountContext;
  assert.equal((await loader(session)).accountState, state);
  assert.equal(queries, 1); assert.equal(fallback, 0);
  for (const status of ["PENDING_APPROVAL", "REJECTED", "SUSPENDED"]) {
    rows = [{ accountState: { ...state, status }, profile }];
    assert.equal((await loader(session)).accountState.status, status);
  }
  rows = []; assert.equal(await loader(session), fallbackResult);
  rows = [{ accountState: { ...state, status: "UNVERIFIED" }, profile }];
  assert.equal(await loader(session), fallbackResult); assert.equal(fallback, 2);
  broken = true; await assert.rejects(loader(session), /database failed/); assert.equal(fallback, 2);
  // Test routing behavior with a simulated React render cache (not React integration).
  let current = session, roleState = state, cacheValue, sessionReads = 0;
  const routing = load("src/server/account-state/routing.ts", {
    "next/navigation": { redirect: url => { throw Error(`redirect:${url}`); } },
    react: { cache: fn => () => cacheValue ??= fn() },
    "@/server/auth": { getCurrentSession: async () => { sessionReads++; return current; } },
    "@/server/observability/page-timing": { measurePageStage: (_stage, fn) => fn() },
    "./page-context": { loadPageApplicationAccountContext: async s => ({ session:s, accountState:roleState, profile }) }
  });
  const [a,b] = await Promise.all([routing.getApplicationPageAccount(), routing.requireActiveMemberPage()]);
  assert.equal(a,b); assert.equal(sessionReads,1);
  cacheValue = undefined; current = { user: { id: "member-b" } }; roleState = { ...state, userId: "member-b", status: "SUSPENDED" };
  await assert.rejects(routing.requireActiveMemberPage(), /redirect:\/account-suspended/); assert.equal(sessionReads,2);
  cacheValue = undefined; current = null; await assert.rejects(routing.getApplicationPageAccount(), /redirect:\/sign-in/);
  // Timings: disabled in production, bounded in Preview, errors preserved.
  const env = { VERCEL_ENV: "production", IMS_PHASE21_PROFILE: "true" }, logs = [];
  let now = 100000, boundaryCalls = 0, randomCalls = 0, rejectBoundary = false, sampleValue = 0;
  const boundaryError = Error("mock prerender suspension");
  const timing = load("src/server/observability/page-timing.ts", {
    "server-only": {},
    "next/server": { connection: async () => { boundaryCalls++; if (rejectBoundary) throw boundaryError; } }
  }, {
    process: { env }, Math: { random: () => { randomCalls++; assert.ok(boundaryCalls >= randomCalls); return sampleValue; }, round: Math.round }, Date: { now: () => now }, performance: { now: () => now },
    console: { info: x => logs.push(JSON.parse(x)) }
  }).measurePageStage;
  assert.equal(await timing("session", async () => 5),5); assert.equal(logs.length,0);
  assert.equal(boundaryCalls,0); assert.equal(randomCalls,0);
  env.VERCEL_ENV = "preview"; env.IMS_PHASE21_PROFILE = "false";
  assert.equal(await timing("session", async () => 6),6);
  assert.equal(boundaryCalls,0); assert.equal(randomCalls,0);
  env.IMS_PHASE21_PROFILE = "true";
  // Request-boundary rejection must propagate without executing or sampling.
  rejectBoundary = true;
  await assert.rejects(timing("session", async () => { assert.fail("operation ran during prerender"); }), error => error === boundaryError);
  assert.equal(randomCalls,0); assert.equal(logs.length,0);
  rejectBoundary = false;
  sampleValue = 0.9;
  assert.equal(await timing("session", async () => 7),7);
  assert.equal(randomCalls,1); assert.equal(logs.length,0);
  sampleValue = 0;
  for (let i=0;i<40;i++) await timing("account_join",async () => i);
  assert.equal(logs.length,30); now += 60001;
  await assert.rejects(timing("directory_query",async () => { throw Error("private value"); }), /private value/);
  assert.equal(logs.length,31); assert.equal(logs.at(-1).outcome,"error"); assert.doesNotMatch(JSON.stringify(logs),/private value|member-a|member-b/);
  const directory = read("src/server/members/directory.ts");
  assert.ok(directory.indexOf("await requireActiveMemberPage()") < directory.indexOf('checkRateLimit("memberSearch"'));
  assert.ok(directory.indexOf("enforceMemberDirectoryRateLimit(decision)") < directory.indexOf('measurePageStage("directory_query"'));
  assert.match(directory, /eq\(applicationUserState.status, "ACTIVE"\)/);
  assert.match(directory, /limit\(MEMBER_PAGE_SIZE \+ 1\)/);
  assert.doesNotMatch(read("src/server/account-state/authorization.ts"), /page-context|requireActiveMemberPage|\bcache\(/);
  assert.doesNotMatch(read("src/server/auth/session.ts"), /\bcache\(/);
  assert.match(read("src/server/auth/auth.ts"), /cookieCache: \{ enabled: false \}/);
  assert.doesNotMatch(read("src/server/account-state/routing.ts"), /["']use cache["']|unstable_cache/);
  assert.deepEqual(JSON.parse(read("vercel.json")).regions,["fra1"]);
  console.log("IMS NETWORK PHASE21FG MOCK AND STRUCTURAL TESTS: PASS");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
