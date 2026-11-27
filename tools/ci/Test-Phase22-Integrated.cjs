/* eslint @typescript-eslint/no-require-imports: "off", @typescript-eslint/no-unused-vars: "off", prefer-const: "off" */
/* Offline-only checks for consolidated features; no hosted services or browser credentials. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(process.argv[2]||process.cwd());const read=p=>fs.readFileSync(path.join(root,p),'utf8');
async function main(){
 const manifest=JSON.parse(read('public/ims.webmanifest'));
 assert.equal(manifest.start_url,'/dashboard');assert.equal(manifest.scope,'/');assert.equal(manifest.display,'standalone');
 for(const icon of manifest.icons){const data=fs.readFileSync(path.join(root,'public',icon.src.slice(1)));const [w,h]=icon.sizes.split('x').map(Number);assert.equal(data.readUInt32BE(16),w);assert.equal(data.readUInt32BE(20),h);}
 let listener,calls=0,offline=false,response;
 const sw=read('public/ims-sw.js');assert.doesNotMatch(sw,/\b(?:caches|CacheStorage\.|indexedDB|localStorage)\s*\./);
 vm.runInNewContext(sw,{self:{location:{origin:'https://example.test'},addEventListener:(type,fn)=>{assert.equal(type,'fetch');listener=fn;}},URL,Response,fetch:async request=>{calls++;if(offline)throw Error('offline');return new Response(request.url,{status:200});}});
 function request(url,method='GET',mode='navigate'){response=undefined;listener({request:{url,method,mode},respondWith:r=>{response=r;}});return response;}
 for(const [url,method,mode] of [['https://example.test/api/avatar/a','GET','navigate'],['https://example.test/_next/data','GET','navigate'],['https://example.test/messages','POST','navigate'],['https://example.test/messages','GET','cors'],['https://elsewhere.test/messages','GET','navigate']])assert.equal(request(url,method,mode),undefined);
 assert.equal(calls,0);assert.equal((await request('https://example.test/messages')).status,200);offline=true;const fallback=await request('https://example.test/messages?c=secret');assert.equal(fallback.status,503);assert.equal(fallback.headers.get('Cache-Control'),'no-store');const body=await fallback.text();assert.match(body,/You're offline/);assert.doesNotMatch(body,/secret/);assert.equal(calls,2);
 const d=read('src/server/members/directory.ts');assert.match(d,/v: z.literal\(2\)/);assert.match(d,/result.data.mentorship !== mentorship/);assert.match(d,/decodeCursor\(parsed.data.cursor, q, year, mentorship\)/);assert.match(d,/conditions.push\(eq\(profiles.mentorship, mentorship\)\)/);assert.match(d,/limit\(MEMBER_PAGE_SIZE \+ 1\)/);assert.ok(d.indexOf('await requireActiveMemberPage()')<d.indexOf('directoryInputSchema.safeParse(input)'));
 const page=read('src/app/(app)/members/page.tsx');assert.match(page,/nextParams.set\("mentorship", result.mentorship\)/);assert.match(page,/name="mentorship"/);
 const chat=read('src/app/(app)/messages/chat-thread.tsx');assert.match(chat,/newDay/);assert.match(chat,/threadRowKey\(message, actorId\)/);assert.match(chat,/styles.dayDivider/);
 const registration=read('src/components/layout/pwa-registration.tsx');assert.match(registration,/process.env.NODE_ENV !== "production"/);assert.match(registration,/window.isSecureContext/);
 console.log('PHASE22_INTEGRATED_OFFLINE PASS — PWA no private caching, network-only navigation, icon dimensions, mentorship cursor binding, chat dates');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
