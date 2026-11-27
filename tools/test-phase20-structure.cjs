/* eslint-disable @typescript-eslint/no-require-imports -- Standalone structural regression */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = p => fs.readFileSync(p, "utf8");
for (const p of ["src/server/auth/auth.ts", "src/server/realtime/stream-publisher.ts", "src/server/avatar/service.ts", "src/app/api/cron/maintenance/route.ts", "src/app/api/avatar/route.ts", "src/app/api/avatar/[id]/route.ts", "src/app/api/ws/route.ts", "src/app/api/privacy-data/route.ts", "src/app/api/recovery-code/route.ts"]) {
  assert.match(read(p), /reportFailure\("[a-z_]+"\)/);
  assert.doesNotMatch(read(p), /console\.(warn|error|log)\(/);
}
const auth = read("src/app/api/auth/[...all]/route.ts");
assert.match(auth, /safeAuthResponse\(\(\) => handlers.POST\(bounded\)\)/);
assert.match(auth, /status: 503/);
assert.match(read("src/app/api/ws/route.ts"), /return reject\(503, "Realtime temporarily unavailable"\)/);
assert.match(read("src/server/auth/session.ts"), /throw new Error\("Session lookup temporarily unavailable\."\)/);
assert.doesNotMatch(read("src/server/observability/safe-events.ts"), /setInterval|setTimeout|fetch\(/);
console.log("PHASE 20A STRUCTURAL REGRESSION: PASS");
