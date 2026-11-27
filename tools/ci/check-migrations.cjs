/* eslint-disable @typescript-eslint/no-require-imports -- Offline migration check */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const baseline = require('./migration-baseline.json');
const hash = b => crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
let lineEndings = 0;
for (const [rel, expected] of Object.entries(baseline)) {
  assert.match(rel, /^drizzle\/(?:meta\/)?[a-z0-9_]+\.(?:sql|json)$/);
  const bytes = fs.readFileSync(path.join(root, rel));
  assert.equal(hash(Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'))), expected.lf, 'Migration content changed: ' + rel);
  if (hash(bytes) !== expected.raw) lineEndings++;
}
const journal = JSON.parse(fs.readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8'));
assert.equal(journal.entries.length, 9, 'New migration requires reviewed baseline update');
const sql = fs.readdirSync(path.join(root, 'drizzle')).filter(n => n.endsWith('.sql')).sort();
assert.deepEqual(sql, journal.entries.map(e => e.tag + '.sql').sort());
for (const [i,e] of journal.entries.entries()) {
  assert.equal(e.idx,i);
  if(i) assert.ok(e.when > journal.entries[i-1].when);
  assert.ok(fs.existsSync(path.join(root, 'drizzle/meta', String(i).padStart(4,'0') + '_snapshot.json')));
}
if (lineEndings) {
  console.warn('NOTICE: '+lineEndings+' migration files differ only in line endings. Exact ledger bytes must be reconciled before deployment/migration.');
  if (process.argv.includes('--exact')) process.exitCode=1;
}
if (!process.exitCode) console.log('PHASE23_MIGRATION_CONTENT PASS (9 migrations; '+lineEndings+' raw-byte differences)');
