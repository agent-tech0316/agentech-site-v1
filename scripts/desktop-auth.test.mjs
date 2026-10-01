import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {createHash,scryptSync} from 'node:crypto';
registerHooks({resolve(s,c,n){return n(s.startsWith('@/')?new URL(`../${s.slice(2)}.ts`,import.meta.url).href:s,c);}});
const {desktopSignIn,desktopSession,desktopSignOut}=await import('../lib/desktop-auth.ts');
const email='user@example.com',password='fixture-only',salt='salt';
let sessions,attempts;
test.beforeEach(t=>{
 sessions=new Map();attempts=new Map();const old={...process.env};process.env.SUPABASE_URL='https://fixture.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';process.env.VERCEL='1';t.after(()=>{process.env=old;});
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  const path=new URL(url).pathname,body=JSON.parse(init.body||'{}');
  if(path.endsWith('desktop_login_attempt')){const count=(attempts.get(body.p_hash)||0)+1;attempts.set(body.p_hash,count);return Response.json([{allowed:count<=body.p_limit,retry_after:900}]);}
  if(path.endsWith('desktop_session_create')){sessions.set(body.p_hash,{email:body.p_email,expires_at:body.p_expires});return new Response(null,{status:204});}
  if(path.endsWith('desktop_session_find'))return Response.json(sessions.has(body.p_hash)?[sessions.get(body.p_hash)]:[]);
  if(path.endsWith('desktop_session_revoke')){sessions.delete(body.p_hash);return new Response(null,{status:204});}
  if(path.endsWith('agentech_accounts'))return Response.json([{email,salt,password_hash:scryptSync(password,salt,64).toString('hex')}]);
  if(path.endsWith('/token'))return body.password===password?Response.json({access_token:'upstream'}):Response.json({error_code:'invalid_credentials'},{status:400});
  throw Error('Unexpected request '+path);
 });
});
function req(body={identifier:email,password},headers={}){return new Request('https://www.agent-tech.ai/api/desktop-auth/sign-in',{method:'POST',headers:{'content-type':'application/json','x-vercel-forwarded-for':'203.0.113.1',...headers},body:JSON.stringify(body)});}
function bearer(token){return new Request('https://www.agent-tech.ai/api/desktop-auth/session',{headers:{authorization:'Bearer '+token}});}
test('login yields 30-day opaque token; verification never returns token; logout revokes',async()=>{
 const start=Date.now(),res=await desktopSignIn(req());assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');
 const data=await res.json();assert.match(data.token,/^[\w-]{43}$/);assert.ok(Date.parse(data.expiresAt)-Date.now()<=30*86400000);assert.ok(Date.parse(data.expiresAt)-start>29*86400000);
 assert.equal(sessions.has(createHash('sha256').update(data.token).digest('hex')),true);assert.equal(sessions.has(data.token),false);
 assert.deepEqual(await (await desktopSession(bearer(data.token))).json(),{email,expiresAt:data.expiresAt});
 assert.equal((await desktopSignOut(bearer(data.token))).status,204);assert.equal((await desktopSession(bearer(data.token))).status,401);
});
test('wrong password has generic 401 and creates no session',async()=>{assert.equal((await desktopSignIn(req({identifier:email,password:'bad'}))).status,401);assert.equal(sessions.size,0);});
test('sixth identifier attempt is throttled even with new client IP',async()=>{for(let i=0;i<5;i++)await desktopSignIn(req({identifier:email,password:'bad'}));const res=await desktopSignIn(req(undefined,{'x-vercel-forwarded-for':'203.0.113.2'}));assert.equal(res.status,429);assert.equal(res.headers.get('retry-after'),'900');});
test('malformed inputs and oversized payload cannot reach credential verification',async()=>{
 for(const body of [{identifier:[],password},{identifier:email,password:[]},{identifier:email,password:''}])assert.equal((await desktopSignIn(req(body))).status,400);
 assert.equal((await desktopSignIn(req({identifier:email,password:'a'.repeat(9000)}))).status,413);
});
test('cookies, forged JWT, missing and unknown opaque tokens cannot authenticate',async()=>{
 for(const r of [new Request('https://site.invalid',{headers:{cookie:'agentech_account_email=user@example.com'}}),bearer('jwt.header.signature'),bearer('x'.repeat(43))])assert.equal((await desktopSession(r)).status,401);
});
test('upstream error returns safe 503 rather than accepting credentials',async t=>{t.mock.method(globalThis,'fetch',()=>{throw Error('private-key');});const res=await desktopSignIn(req());assert.equal(res.status,503);assert.doesNotMatch(await res.text(),/private-key/);});
