/* eslint @typescript-eslint/no-require-imports: "off", @typescript-eslint/no-unused-vars: "off", prefer-const: "off" */
/* Local-only mock regression. No real provider modules are loaded. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const repo = path.resolve(process.argv[2] || 'C:\\dev\\ims-network');
const ts = createRequire(path.join(repo,'package.json'))('typescript');
const read = p => fs.readFileSync(path.join(repo,p),'utf8');
const prefix='src/app/(app)/messages/';
function load(file, deps, globals={}) {
  const result=ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true,fileName:file});
  assert.equal(result.diagnostics.filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
  const m={exports:{}};
  vm.runInNewContext(result.outputText,{exports:m.exports,module:m,require:n=>{assert.ok(Object.hasOwn(deps,n),`Unexpected import: ${n}`);return deps[n];},...globals},{filename:file});
  return m.exports;
}
const jsx=(type,props,key)=>({type,props,key});
const icons=new Proxy({}, {get:(_target,key)=>key==='__esModule'?true:String(key)});
const core=load(prefix+'chat-thread-core.ts',{});
const stamp='2026-11-27T00:50:00.000Z';
const pending={clientMessageId:'request-1',body:'Hello',createdAt:stamp,status:'uncertain'};
const msg={id:'server-1',clientMessageId:'request-1',readByPeer:false,sequence:10,senderUserId:'a',body:'Hello',createdAt:stamp};
function nodes(tree,out=[]){if(Array.isArray(tree)){for(const v of tree)nodes(v,out);}else if(tree && typeof tree==='object' && tree.props){out.push(tree);nodes(tree.props.children,out);}return out;}
async function main(){
  assert.equal(core.unresolvedMessage(pending,[], 'a'),pending);
  assert.equal(core.unresolvedMessage(pending,[msg], 'a'),null);
  assert.equal(core.unresolvedMessage(pending,[{...msg,senderUserId:'b'}], 'a'),pending);
  assert.equal(core.unresolvedMessage(pending,[{...msg,clientMessageId:'different'}], 'a'),pending);
  assert.equal(core.unresolvedMessage({...pending,messageId:msg.id},[{...msg,clientMessageId:null}], 'a'),null);
  assert.equal(core.messageStatus(msg,'a'),'Sent');assert.equal(core.messageStatus({...msg,readByPeer:true},'a'),'Read');assert.equal(core.messageStatus(msg,'b'),null);
  assert.equal(JSON.stringify(core.retryPayload('c',pending)),JSON.stringify({conversationId:'c',clientMessageId:'request-1',body:'Hello'}));
  // Exercise actual action adapter with a mocked service. No writes or revalidation on failure.
  class SendError extends Error {constructor(code){super(code);this.code=code;}}
  let sends=0,revalidates=0,mode='success';
  const action=load(prefix+'actions.ts',{'@/server/messaging/delivery':{acknowledgeDelivery:async()=>true},'@/server/messaging/activity':{publishChatActivity:async()=>true},'@/server/messaging/reactions':{setMessageReaction:async()=>true},'next/cache':{revalidatePath:p=>{assert.equal(p,'/messages');revalidates++;}},'@/server/messaging/read-budget':{MessagingReadBudgetError:class extends Error{}},'@/server/messaging/messages':{MessageSendError:SendError,sendDirectMessage:async input=>{sends++;assert.equal(input.clientMessageId,'request-1');if(mode==='limit')throw new SendError('RATE_LIMITED');if(mode==='unknown')throw Error('unknown');return {id:'server-1'};}},'@/server/messaging/reads':{MessageReadError:class extends Error{},markConversationRead:async()=>{}}}).sendChatMessage;
  assert.equal((await action(core.retryPayload('c',pending))).messageId,'server-1');assert.equal(revalidates,1);
  mode='limit';assert.equal((await action(core.retryPayload('c',pending))).ok,false);assert.equal(revalidates,1);
  mode='unknown';await assert.rejects(action(core.retryPayload('c',pending)),/unknown/);assert.equal(sends,3);assert.equal(revalidates,1);
  // Mock the already-existing authorization query. Verify SQL shape and returned status projection.
  let queries=0,rows=[],sqlText='';
  const schema={min(){return this;},max(){return this;},int(){return this;},optional(){return this;},strict(){return this;},safeParse(data){return {success:true,data};}};
  const z={object:()=>schema,string:()=>schema,number:()=>schema,literal:()=>schema};
  const store=load('src/server/messaging/history-store.ts',{'@/lib/chat-interactions':load('src/lib/chat-interactions.ts',{}),'node:crypto':require('node:crypto'),'@neondatabase/serverless':{neon:()=>async(parts,...values)=>{queries++;sqlText=parts.join('?');assert.ok(values.includes('a'));assert.ok(values.includes('c'));return rows;}},'zod':{z},'@/server/env':{serverEnv:{DATABASE_URL_POOLED:'offline-stub',BETTER_AUTH_SECRET:'offline-fixture'}}},{Buffer}).getConversationHistoryForActor;
  await assert.rejects(store('a',{conversationId:'c'}),/unavailable/);assert.equal(queries,1);
  const row={authorized_conversation_id:'c',message_id:'server-1',message_sequence:10,sender_user_id:'a',message_body:'Hello',message_created_at:stamp,own_client_message_id:'request-1',peer_read_sequence:10};
  rows=[row,{...row,message_id:'server-2',sender_user_id:'b',own_client_message_id:'must-not-leak',message_sequence:9}];
  const result=await store('a',{conversationId:'c'});assert.equal(queries,2);assert.equal(result.messages[0].readByPeer,true);assert.equal(result.messages[0].clientMessageId,'request-1');assert.equal(result.messages[1].readByPeer,false);assert.equal(result.messages[1].clientMessageId,null);
  assert.match(sqlText,/actor_state\."status" = 'ACTIVE'/);assert.match(sqlText,/other_state\."status" = 'ACTIVE'/);assert.match(sqlText,/CASE WHEN recent\."sender_user_id" = \?/);assert.match(sqlText,/LIMIT \?/);assert.match(sqlText,/actor_member\."user_id" = \?/);
  rows=[{...row,peer_read_sequence:9}];assert.equal((await store('a',{conversationId:'c'})).messages[0].readByPeer,false);
  rows=[{...row,peer_read_sequence:'bad'}];await assert.rejects(store('a',{conversationId:'c'}),/Unexpected read cursor/);
  // Notifications use one authorized inbox call, no message bodies in output, no background polling.
  let auth=0,inbox=0,denied=false,limited=false;
  class Limit extends Error{} class InboxError extends Error{}
  const page=load('src/app/(app)/notifications/page.tsx',{'@/server/messaging/notification-history':{getMessageNotificationHistory:async()=>({items:[]})},'react/jsx-runtime':{jsx,jsxs:jsx},react:{Suspense:'Suspense'},'next/link':{default:'Link'},'lucide-react':icons,'@/server/account-state/routing':{requireActiveMemberPage:async()=>{auth++;if(denied)throw Error('denied');}},'@/server/messaging/inbox':{InboxError,getConversationInbox:async()=>{inbox++;if(limited)throw new Limit();return {conversations:[{conversationId:'c1',otherMember:{id:'b',displayName:'Member B',hasAvatar:false},unreadCount:2,lastMessage:{createdAt:stamp,body:'private text'}},{conversationId:'c2',otherMember:{id:'d',displayName:'Member D'},unreadCount:0}],hasMore:false};}},'@/server/messaging/read-budget':{MessagingReadBudgetError:Limit},'next/navigation':{notFound:()=>{throw Error('not found');}},'@/components/members/member-avatar':{MemberAvatar:'Avatar'},'../messages/local-time':{LocalTime:'Time'},'./refresh-notifications':{RefreshNotifications:'Refresh'}},{URLSearchParams}).default;
  async function render(){const child=page({searchParams:Promise.resolve({})}).props.children;return child.type(child.props);}
  let tree=await render();assert.equal(auth,1);assert.equal(inbox,1);assert.ok(JSON.stringify(tree).includes('Member B'));assert.ok(!JSON.stringify(tree).includes('Member D'));assert.ok(!JSON.stringify(tree).includes('private text'));assert.ok(nodes(tree).filter(n=>n.type==='Link').every(n=>n.props.prefetch===false));
  limited=true;tree=await render();assert.ok(JSON.stringify(tree).includes('temporarily limited'));assert.equal(inbox,2);
  denied=true;await assert.rejects(render(),/denied/);assert.equal(inbox,2);
  // Component-level mock: a held request displays immediately, retry retains exact UUID and body.
  const slots=[],refs=[];let si=0,ri=0,resolveSend,rejectSend,attempts=[];
  const React={useState(initial){const i=si++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(initial){const i=ri++;return refs[i]??(refs[i]={current:initial});},useEffect(){},useSyncExternalStore(){return false;},useTransition(){return [false,f=>f()];}};
  const Thread=load(prefix+'chat-thread.tsx',{'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},react:React,'lucide-react':icons,'next/navigation':{useRouter:()=>({refresh(){}})},'@/lib/chat-interactions':load('src/lib/chat-interactions.ts',{}),'@/lib/chat-calendar':load('src/lib/chat-calendar.ts',{}),'./actions':{reactToChatMessage:async()=>({ok:true}),sendChatMessage:input=>{attempts.push(input);return new Promise((resolve,reject)=>{resolveSend=resolve;rejectSend=reject;});}},'./chat-activity':{ActivityIndicator:'ActivityIndicator',useChatActivity:()=>({peer:null,share:false,signal(){},toggle(){}})},'./report-control':{ReportControl:'ReportControl'},'./delivery-tracker':{DeliveryTracker:'DeliveryTracker'},'./chat-controls':{ReadTracker:'ReadTracker'},'./local-time':{LocalTime:'LocalTime'},'./chat-thread-core':core,'./messages.module.css':{default:new Proxy({},{get:(_t,k)=>String(k)})}},{crypto:{randomUUID:()=> 'request-1'}}).ChatThread;
  const renderThread=(messages=[])=>{si=ri=0;return Thread({conversationId:'c',actorId:'a',messages,olderPage:false,unreadCount:0,historyLinks:null});};
  let t=renderThread();nodes(t).find(n=>n.type==='textarea').props.onChange({target:{value:'Hello'}});t=renderThread();const form=nodes(t).find(n=>n.type==='form');form.props.onSubmit({preventDefault(){}});form.props.onSubmit({preventDefault(){}});assert.equal(attempts.length,1);t=renderThread();assert.ok(JSON.stringify(t).includes('Sending…'));assert.ok(JSON.stringify(t).includes('Hello'));assert.equal(nodes(t).find(n=>n.type==='li').key,'own:request-1');assert.ok(JSON.stringify(t).includes('sendMotion'));
  rejectSend(Error('lost response'));await new Promise(resolve=>setImmediate(resolve));t=renderThread();assert.ok(JSON.stringify(t).includes('Unconfirmed'));nodes(t).find(n=>n.props.children==='Retry same message').props.onClick();assert.equal(attempts.length,2);assert.equal(JSON.stringify(attempts[0]),JSON.stringify(attempts[1]));resolveSend({ok:true,messageId:'server-1'});await new Promise(resolve=>setImmediate(resolve));t=renderThread([msg]);assert.ok(!JSON.stringify(t).includes('Saved · syncing'));assert.equal(nodes(t).filter(n=>n.type==='li').length,1);assert.equal(nodes(t).find(n=>n.type==='li').key,'own:request-1');assert.ok(JSON.stringify(t).includes('sendMotion'));
  assert.doesNotMatch(read(prefix+'chat-thread.tsx'),/\b(?:setInterval|fetch|WebSocket)\s*\(/);
  assert.match(read(prefix+'chat-controls.tsx'),/document\.visibilityState !== "visible"/);
  console.log('PHASE22_ADVANCED_MOCK PASS — optimistic send/retry/dedupe, read projection/auth query, notifications and bounded calls');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
