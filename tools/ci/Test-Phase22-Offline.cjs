/* eslint @typescript-eslint/no-require-imports: "off", @typescript-eslint/no-unused-vars: "off", prefer-const: "off" */
/* Standalone, local-only regression runner. No provider clients are loaded. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const repo = path.resolve(process.argv[2] || 'C:\\dev\\ims-network');
const ts = createRequire(path.join(repo,'package.json'))('typescript');
const read = p => fs.readFileSync(path.join(repo,p),'utf8');
function load(file, deps) {
  const result = ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true,fileName:file});
  assert.equal(result.diagnostics.filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
  const m={exports:{}};
  vm.runInNewContext(result.outputText,{exports:m.exports,module:m,require:n=>{assert.ok(Object.hasOwn(deps,n),`Unexpected import: ${n}`);return deps[n];}},{filename:file});
  return m.exports;
}
const jsx=(type,props)=>({type,props});
const icons=new Proxy({}, {get:(_target,key)=>key==='__esModule'?true:String(key)});
class DirectoryLimit extends Error {} class InboxLimit extends Error {}
let auth=0, dir=0, inbox=0, denied=false, limited=false;
const page=load('src/app/(app)/dashboard/page.tsx',{
  'react/jsx-runtime':{jsx,jsxs:jsx},'react':{Suspense:'Suspense'},'./loading':{default:'Loading'},'next/link':{default:'Link'},'lucide-react':icons,
  '@/server/account-state/routing':{requireActiveMemberPage:async()=>{auth++;if(denied)throw Error('unauthorized');return {session:{user:{name:'Test',id:'a'}},profile:{userId:'a',displayName:'Test',program:'IMS',graduationYear:2024,bio:'',updatedAt:new Date(0),avatarUrl:'private'}};}},
  '@/server/members':{listActiveMembers:async()=>{dir++;if(limited)throw new DirectoryLimit();return {members:[{userId:'b',displayName:'Other',program:'IMS',graduationYear:2023,hasAvatar:true,avatarVersion:'v'}]};}},
  '@/server/members/search-rate-limit':{MemberDirectoryRateLimitError:DirectoryLimit},
  '@/server/messaging/inbox':{getConversationInbox:async()=>{inbox++;if(limited)throw new InboxLimit();return {conversations:[{conversationId:'c',otherMember:{id:'b',displayName:'Other',hasAvatar:true,avatarVersion:'v'},unreadCount:1,lastMessage:{body:'Test message',senderUserId:'b'}}]};}},
  '@/server/messaging/read-budget':{MessagingReadBudgetError:InboxLimit},
  '@/components/members/member-avatar':{MemberAvatar:'Avatar'},'@/components/members/member-directory-table':{MemberDirectoryTable:'DirectoryTable'},
}).default;
async function render(params){const wrapper=page({searchParams:Promise.resolve(params)});assert.equal(wrapper.type,"Suspense");const child=wrapper.props.children;return child.type(child.props);}
function nodes(tree,out=[]){if(Array.isArray(tree)){for(const v of tree)nodes(v,out);}else if(tree && typeof tree==='object' && tree.props){out.push(tree);nodes(tree.props.children,out);}return out;}
async function main(){
  let tree=await render({});assert.equal(dir,1);assert.equal(inbox,1);
  assert.ok(nodes(tree).some(n=>n.props.href==='/dashboard?snapshot=0'));
  assert.equal(nodes(tree).filter(n=>n.type==='Avatar').length,2);assert.ok(nodes(tree).filter(n=>n.type==='Avatar').every(n=>n.props.hasAvatar===true));
  assert.equal(nodes(tree).find(n=>n.type==='DirectoryTable').props.showAvatars,true);
  assert.ok(nodes(tree).filter(n=>n.type==='Link').every(n=>n.props.prefetch===false));
  assert.ok(JSON.stringify(tree).includes('Test message'));
  tree=await render({snapshot:'0'});assert.equal(dir,1);assert.equal(inbox,1);assert.ok(nodes(tree).some(n=>n.props.href==='/dashboard'));
  assert.equal(nodes(tree).filter(n=>n.type==='Avatar').length,1);
  limited=true;tree=await render({});assert.equal(dir,2);assert.equal(inbox,2);assert.ok(JSON.stringify(tree).includes('Inbox temporarily limited'));
  denied=true;await assert.rejects(render({}),/unauthorized/);assert.equal(dir,2);assert.equal(inbox,2);assert.equal(auth,4);
  let adminAllowed=false, adminCalls=0;
  const adminLayout=load('src/app/admin/layout.tsx',{'react/jsx-runtime':{jsx,jsxs:jsx},'react':{Suspense:'Suspense'},'@/server/account-state/routing':{requireAdminPage:async()=>{adminCalls++;if(!adminAllowed)throw Error('not admin');return {session:{user:{id:'admin',name:'Admin'}},profile:{displayName:'Admin',graduationYear:2020,avatarUrl:'private',updatedAt:new Date(0)}};}},'@/components/layout/member-shell':{MemberShell:'Shell'}}).default;
  const adminChild=adminLayout({children:'secret'}).props.children;
  await assert.rejects(adminChild.type(adminChild.props),/not admin/);adminAllowed=true;
  const shell=await adminChild.type(adminChild.props);assert.equal(shell.type,'Shell');assert.equal(shell.props.hasAvatar,true);assert.equal(shell.props.canAdmin,true);assert.equal(shell.props.children,'secret');assert.equal(adminCalls,2);
  assert.ok(!Object.hasOwn(shell.props,'avatarUrl'));
  let filterQuery='';
  const filter=load('src/app/(app)/messages/inbox-filter.tsx',{'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},'react':{useState:()=>[filterQuery,()=>{}]},'lucide-react':icons,'./messages.module.css':{default:{inboxSearch:'search',conversationList:'list',emptySidebar:'empty'}}}).InboxFilter;
  const entries=[{id:'a',name:'Alpha',content:'Alpha row'},{id:'b',name:'Beta',content:'Beta row'}];
  assert.ok(JSON.stringify(filter({entries,empty:'Empty'})).includes('Beta row'));
  filterQuery='alP';assert.ok(JSON.stringify(filter({entries,empty:'Empty'})).includes('Alpha row'));assert.ok(!JSON.stringify(filter({entries,empty:'Empty'})).includes('Beta row'));
  filterQuery='none';assert.ok(JSON.stringify(filter({entries,empty:'Empty'})).includes('No matching conversations'));
  const time=load('src/app/(app)/messages/local-time.tsx',{'react/jsx-runtime':{jsx,jsxs:jsx},'react':{useSyncExternalStore:()=>false}}).LocalTime;
  assert.equal(time({iso:'2026-11-27T00:25:00.000Z'}).props.dateTime,'2026-11-27T00:25:00.000Z');assert.ok(JSON.stringify(time({iso:'2026-11-27T00:25:00.000Z'})).includes(' UTC'));
  const table=load('src/components/members/member-directory-table.tsx',{'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':{default:'Link'},'@/components/members/member-avatar':{MemberAvatar:'Avatar'}}).MemberDirectoryTable;
  const member={userId:'b',displayName:'Other',program:'IMS',graduationYear:2023,hasAvatar:true,avatarVersion:'v'};
  assert.equal(nodes(table({members:[member]})).find(n=>n.type==='Avatar').props.hasAvatar,true);
  assert.equal(nodes(table({members:[member],showAvatars:false})).find(n=>n.type==='Avatar').props.hasAvatar,false);
  const mobileTable=nodes(table({members:[member],showAvatars:false}));
  assert.equal(mobileTable.filter(n=>n.type==='Avatar').length,1);
  assert.equal(mobileTable.filter(n=>n.type==='Link').length,2);
  assert.ok(mobileTable.filter(n=>n.type==='Link').every(n=>n.props.prefetch===false));
  assert.ok(mobileTable.some(n=>n.props.role==='table'));
  assert.ok(mobileTable.some(n=>n.props.className==='ims-dir-program'));
  assert.match(read('src/app/globals.css'),/@container ims-directory/);
  assert.match(read('src/app/(app)/messages/messages.module.css'),/@container ims-messages/);
  const dash=read('src/app/(app)/dashboard/page.tsx');assert.doesNotMatch(dash,/\b(?:fetch|setInterval|setTimeout|WebSocket|unstable_cache)\s*\(/);
  console.log('PHASE22 SNAPSHOT MOCK TESTS PASS — bounded default reads; compact zero-read option; auth first; private avatar flag; admin gate; rate limits preserved');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
