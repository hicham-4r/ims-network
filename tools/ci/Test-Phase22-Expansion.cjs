/* eslint @typescript-eslint/no-require-imports: "off", @typescript-eslint/no-unused-vars: "off", prefer-const: "off" */
/* Offline: all external services mocked; no environment loaded. */
const assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const root=path.resolve(process.argv[2]||process.cwd());const ts=createRequire(path.join(root,'package.json'))('typescript');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function load(file,deps){const out=ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true,fileName:file});assert.equal(out.diagnostics.filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);const m={exports:{}};vm.runInNewContext(out.outputText,{exports:m.exports,module:m,require:n=>{assert.ok(Object.hasOwn(deps,n),n);return deps[n];}});return m.exports;}
async function main(){
 const core=load('src/app/(app)/messages/chat-thread-core.ts',{});
 assert.equal(core.threadRowKey({id:'db',clientMessageId:'local',senderUserId:'a'},'a'),'own:local');
 assert.equal(core.threadRowKey({id:'db',clientMessageId:'local',senderUserId:'b'},'a'),'server:db');
 const css=read('src/app/(app)/messages/messages.module.css');assert.match(css,/ims-send-lift 260ms/);assert.match(css,/@media\(prefers-reduced-motion:reduce\)\s*\{\s*\.sendMotion \{ animation:none/);
 let calls=[],result={conversationId:'c',lastReadSequence:12,advanced:true,peerUserId:'b'},denied=false,fail=false;let ids=0;
 const reads=load('src/server/messaging/reads.ts',{'server-only':{},'node:crypto':{randomUUID:()=>`event-${++ids}`},'@/server/realtime/stream-publisher':{publishMessageNotice:async value=>{calls.push(['publish',value]);if(fail)throw Error('offline');return true;}},'@/server/account-state':{requireActiveMember:async()=>{calls.push(['auth']);if(denied)throw Error('denied');return {session:{user:{id:'a'}}};}},'./read-budget':{requireMessagingReadBudget:async (...args)=>calls.push(['budget',...args])},'./read-store':{MessageReadError:class extends Error{},markConversationReadForActor:async (actor,input)=>{calls.push(['store',actor,input]);return result;},getUnreadCountForActor:async()=>({})}});
 const input={conversationId:'c',messageId:'m'};let ret=await reads.markConversationRead(input);assert.equal(ret.lastReadSequence,12);assert.equal(Object.hasOwn(ret,'peerUserId'),false);assert.equal(calls.map(x=>x[0]).join(','),'auth,budget,store,publish');assert.equal(calls[3][1].recipientUserId,'b');assert.equal(Object.keys(calls[3][1]).sort().join(','),'eventId,originInstanceId,recipientUserId');
 calls=[];result.advanced=false;await reads.markConversationRead(input);assert.equal(calls.map(x=>x[0]).join(','),'auth,budget,store');
 calls=[];result.advanced=true;fail=true;await reads.markConversationRead(input);assert.equal(calls.length,4);
 calls=[];denied=true;await assert.rejects(reads.markConversationRead(input),/denied/);assert.equal(calls.length,1);
 const store=read('src/server/messaging/read-store.ts');assert.match(store,/FOR UPDATE OF actor_member/);assert.match(store,/last_read_message_sequence" > target_message.previous_read/);assert.match(store,/other_state\."status" = 'ACTIVE'/);assert.match(store,/GREATEST\(/);
 const old=JSON.parse(read('drizzle/meta/0005_snapshot.json')),next=JSON.parse(read('drizzle/meta/0006_snapshot.json'));assert.equal(next.prevId,old.id);
 const names=['job_title','company','location','skills','mentorship'];const sql=read('drizzle/0006_professional_profiles.sql');
 for(const name of names){assert.deepEqual(next.tables['public.profiles'].columns[name],{name,type:'text',primaryKey:false,notNull:false});delete next.tables['public.profiles'].columns[name];assert.ok(sql.includes(`ALTER TABLE "profiles" ADD COLUMN "${name}" text;`));assert.ok(read('src/server/privacy/data-service.ts').includes(`p."${name}"`));}
 next.id=old.id;next.prevId=old.prevId;assert.deepEqual(next,old);assert.equal(sql.split('--> statement-breakpoint').length,5);assert.doesNotMatch(sql,/\b(?:DROP|DELETE|TRUNCATE|UPDATE)\b/i);
 const journal=JSON.parse(read('drizzle/meta/_journal.json'));assert.equal(journal.entries[6].tag,'0006_professional_profiles');assert.equal(journal.entries.length,9);
 assert.match(read('src/server/members/detail-cache.ts'),/professional-v1/);assert.match(read('src/server/profile/service.ts'),/updatedAt: nextProfileUpdatedAt/);
 console.log('PHASE22_EXPANSION_MOCK PASS — stable identity, reduced motion, authorized read hints, no-op suppression, additive migration and export checks');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
