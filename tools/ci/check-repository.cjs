/* eslint-disable @typescript-eslint/no-require-imports -- Local repository guard */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'../..');
const git = args => execFileSync('git',args,{cwd:root,maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});
const staged = process.argv.includes('--staged');
const names = [...new Set(git(['ls-files','-z']).toString('utf8').split('\0').filter(Boolean))];
const suspicious = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ['Resend key', /\bre_[A-Za-z0-9]{30,}\b/],
  ['Vercel Blob token', /\bvercel_blob_rw_[A-Za-z0-9_]{25,}\b/],
  ['database credential URL', /(?:postgres(?:ql)?|rediss):\/\/[^\s:@'"<>]+:[A-Za-z0-9_%+!$=-]{16,}@[^\s'"<>]+/i],
];
let errors=0;
for(const name of names) {
  if (/(^|\/)(?:\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx|dump|bak|zip|har)|IMS_NETWORK_STATE_BUNDLE.*)$/i.test(name) && !/(^|\/)\.env\.(?:example|template|sample)$/.test(name)) {
    console.error('Disallowed tracked file: '+JSON.stringify(name));errors++;continue;
  }
  const file=path.join(root,name);
  let data;
  if(staged) data=git(['show',':'+name]);
  else { if(!fs.existsSync(file)) continue; if(!fs.lstatSync(file).isFile()) {console.error('Review nonregular tracked path: '+JSON.stringify(name));errors++;continue;} data=fs.readFileSync(file); }
  if(data.includes(0)) continue; // binary content requires human review
  for(const [label,pattern] of suspicious) if(pattern.test(data.toString('utf8'))) { console.error(label+' candidate in '+JSON.stringify(name));errors++; }
}
if(errors) process.exitCode=1;
else console.log('PHASE23_REPOSITORY_GUARD PASS ('+names.length+' tracked paths; heuristic only)');
