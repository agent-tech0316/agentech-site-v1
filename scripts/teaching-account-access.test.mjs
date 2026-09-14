import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
registerHooks({ resolve(s,c,next) {
  if(s==='next/headers') return {url:'data:text/javascript,export async function cookies(){return {get(){return undefined}}}',shortCircuit:true};
  if(s.startsWith('@/')) return next(new URL(`../${s.slice(2)}.ts`,import.meta.url).href,c);
  if(s==='next/server') return next('next/server.js',c);
  try { return next(s,c); } catch(e) {
    if(s.startsWith('.') && !/\.[a-z]+$/.test(s)) return next(s+'.ts',c);
    throw e;
  }
}});
const {NextRequest}=await import('next/server');
const {createSignedAccountSession}=await import('../lib/server-account-session.ts');
const {isAgentechCompanyEmail,isAgentechGatewayOwnerEmail}=await import('../lib/company-accounts.ts');
const routes = await Promise.all(['account/code-submissions','agentech-live-session','livekit-token'].map(async p=>[p,await import(`../app/api/${p}/route.ts`)]));
process.env.LIVEKIT_API_KEY='test-only';
process.env.LIVEKIT_API_SECRET='test-only-secret';
process.env.AGENTECH_SESSION_SECRET='teaching-test-only-secret';
process.env.SUPABASE_URL='https://teaching-test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
for(let i=1;i<=8;i++) {
 const u=`skyrockettest${String(i).padStart(3,'0')}`;
 test(`${u} accesses teaching routes without company or admin privileges`,async t=>{
  assert.equal(isAgentechCompanyEmail(u),false);
  assert.equal(isAgentechGatewayOwnerEmail(u),false);
  t.mock.method(globalThis,'fetch',async()=>Response.json([]));
  for(const [name,route] of routes){
   const req=new NextRequest(`https://site.invalid/api/${name}`,{headers:{authorization:`Bearer ${createSignedAccountSession(u)}`}});
   const res=await route.GET(req);
   assert.equal(res.status,name==='livekit-token'?404:200,`${name} must recognize the signed teaching account`);
  }
 });
}
for(const [name,route] of routes) test(`${name} rejects unauthenticated access`,async()=>{
 const res=await route.GET(new NextRequest(`https://site.invalid/api/${name}`));
 assert.equal(res.status,401);
});
const {getReturnToHomeAccess}=await import('../lib/premium-features.ts');
test('teaching accounts can use the SDK premium function without acquiring admin status',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json([]));
 assert.equal((await getReturnToHomeAccess('skyrockettest001')).allowed,true);
 assert.equal((await getReturnToHomeAccess('skyrockettest009')).allowed,false);
 assert.equal((await getReturnToHomeAccess('student@example.com')).allowed,false);
});
const robotSlot=await import('../app/api/robot-slot/route.ts');
test('teaching scheduling requires a signed session and a profile',async()=>{
 const req=new NextRequest('https://site.invalid/api/robot-slot',{method:'POST',headers:{authorization:`Bearer ${createSignedAccountSession('skyrockettest001')}`,'Content-Type':'application/json'},body:JSON.stringify({email:'skyrockettest001'})});
 const res=await robotSlot.POST(req);
 assert.equal(res.status,400);
 assert.match((await res.json()).error,/profile/);
});
test('teaching scheduling still rejects code without passed safety reviews',async t=>{
 process.env.NODE_ENV='production';
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  assert.equal(init.method,'GET','must not create a reservation or charge credits');
  const table=new URL(url).pathname;
  if(table.endsWith('/agentech_accounts'))return Response.json([{email:'skyrockettest001',credit_balance:100000,bonus_credit_balance:100000}]);
  if(table.endsWith('/agentech_account_profiles'))return Response.json([{id:1,account_email:'skyrockettest001',username:'skyrockettest001',profile_type:'developer'}]);
  return Response.json([]);
 });
 const req=new NextRequest('https://site.invalid/api/robot-slot',{method:'POST',headers:{authorization:`Bearer ${createSignedAccountSession('skyrockettest001')}`,'Content-Type':'application/json'},body:JSON.stringify({email:'skyrockettest001',profileId:1,robotModel:'Navi',durationMinutes:5,scheduledStart:'2026-10-01T17:00:00Z',timeZone:'America/Los_Angeles'})});
 const res=await robotSlot.POST(req);
 assert.equal(res.status,403);
 assert.match((await res.json()).error,/physical safety gate and AI security scan/);
});
