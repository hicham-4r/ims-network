/* eslint @typescript-eslint/no-require-imports: "off", @typescript-eslint/no-unused-vars: "off", prefer-const: "off" */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(process.argv[2]||'.'),ts=createRequire(path.join(root,'package.json'))('typescript');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('src/lib/chat-calendar.ts');const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:mod.exports,module:mod,Date,Intl});
// Use the host's actual local calendar. Do not mutate TZ after a VM is created.
const {chatDayKey,chatDayLabel}=mod.exports;
const iso='2026-11-26T23:30:00.000Z';
assert.equal(chatDayKey(iso,false),'2026-11-26');
assert.match(chatDayLabel(iso,false),/UTC$/);
const local=(year,month,day,hour=0,minute=0,second=0)=>new Date(year,month-1,day,hour,minute,second);
const before=local(2026,11,26,23,59,59), midnight=local(2026,11,27), noon=local(2026,11,27,12);
assert.equal(chatDayKey(before.toISOString(),true),'2026-11-26');
assert.equal(chatDayKey(midnight.toISOString(),true),'2026-11-27');
assert.equal(chatDayLabel(midnight.toISOString(),true,noon),'Today');
assert.equal(chatDayLabel(before.toISOString(),true,noon),'Yesterday');
assert.equal(chatDayLabel(midnight.toISOString(),true,local(2026,11,28,12)),'Yesterday');
assert.equal(chatDayKey(local(2027,1,1).toISOString(),true),'2027-1-1');
assert.equal(chatDayLabel(local(2026,12,31,23,59,59).toISOString(),true,local(2027,1,1,12)),'Yesterday');
// Independently verify conversion of a fixed UTC instant to the host's local date.
const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{year:'numeric',month:'numeric',day:'numeric'}).formatToParts(new Date(iso)).map(p=>[p.type,p.value]));
assert.equal(chatDayKey(iso,true),`${Number(parts.year)}-${Number(parts.month)}-${Number(parts.day)}`);
const shell=read('src/components/layout/member-shell.tsx');assert.match(shell,/onKeyDown=\{navigateResults\}/);assert.match(shell,/prefetch=\{false\}/);const chat=read('src/app/(app)/messages/chat-thread.tsx');assert.match(chat,/chatDayKey\(previous.createdAt, localDates\)/);assert.match(chat,/aria-label="Conversation history"/);assert.doesNotMatch(chat,/\b(?:fetch|setInterval|WebSocket)\s*\(/);assert.match(read('src/components/ui/skeleton.tsx'),/motion-safe:animate-pulse/);assert.match(read('src/app/(app)/messages/messages.module.css'),/\.refreshing \{ animation:none/);console.log('PHASE22_POLISH_MOCK PASS');
