/* eslint-disable @typescript-eslint/no-require-imports -- Cross-platform CLI */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
// No hosted credentials inherited by children. No dotenv, builds, migrations or live suites.
const allowed = /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|LANG|LC_ALL|TZ|CI|GITHUB_ACTIONS|NUMBER_OF_PROCESSORS)$/i;
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => allowed.test(k)));
env.NEXT_TELEMETRY_DISABLED = '1';
const cli = (pkg, name) => {
  const base = path.join(root, 'node_modules', pkg);
  const bin = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8')).bin;
  return path.join(base, typeof bin === 'string' ? bin : bin[name]);
};
function run(label, file, args = []) {
  console.log('\n== ' + label + ' ==');
  const r = spawnSync(process.execPath, [file, ...args], { cwd: root, env, stdio: 'inherit', timeout: 120000 });
  if (r.error || r.status !== 0) throw new Error('Quality gate failed: ' + label);
}
const structural = ["test-no-email-verification", "test-phase16-auth-layout", "test-phase18c-structure", "test-phase19-structure", "test-phase19b-structure", "test-phase19c-structure", "test-phase20-structure", "test-phase21fg", "test-phase25a5-auth-runtime", "test-phase25b5-password-change"];
const typed = ["test-redis-cache", "test-member-detail-cache", "test-phase13-security", "test-phase16-activation-policy", "test-phase16-relay-budget", "test-phase16-realtime-client", "test-phase16-reader-pacing", "test-phase16-publisher-gate", "test-phase16-handshake-watchdog", "test-phase16-socket-deadline", "test-phase16-local-hub", "test-phase16-local-relay-router", "test-phase16-reader-counters", "test-phase16-reader-early-empty", "test-phase16-relay-protocol", "test-phase16-stream-publisher", "test-phase16-stream-reader", "test-phase16-offline-cross-instance", "test-phase16-stream-reader-tcp", "test-phase16-relay-bridge", "test-phase16-socket-access", "test-phase16-relay-runtime", "test-phase24-production-policy", "test-phase24-dedicated-redis"];
const mocks = ['Offline','Advanced','Expansion','Integrated','Chat','Community','Polish'];
try {
  run('migration integrity', path.join(__dirname, 'check-migrations.cjs'));
  for (const name of structural) run(name, path.join(root, 'tools', name + '.cjs'));
  for (const name of mocks) run('Phase22 ' + name, path.join(__dirname, 'Test-Phase22-' + name + '.cjs'), [root]);
  const tsx = cli('tsx','tsx');
  run('relay diagnostics', tsx, [path.join(__dirname, 'Test-Relay-Diagnostics.cjs'), root]);
  for (const name of typed) run(name, tsx, [path.join(root, 'tools', name + '.ts')]);
  run('TypeScript', cli('typescript','tsc'), ['--noEmit']);
  run('ESLint', cli('eslint','eslint'), ['--max-warnings','0']);
  console.log('PHASE23_QUALITY PASS');
} catch (e) { console.error(e.message); process.exitCode = 1; }
