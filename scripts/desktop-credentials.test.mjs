import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { scryptSync } from 'node:crypto';
registerHooks({resolve(s,c,n){return n(s.startsWith('@/')?new URL(`../${s.slice(2)}.ts`,import.meta.url).href:s,c);}});
const {verifyAccountCredentials}=await import('../lib/verify-account-credentials.ts');
const email='desktop@example.com', password='fixture-password', salt='fixture-salt';
const account={email,salt,password_hash:scryptSync(password,salt,64).toString('hex')};
test.beforeEach(t=>{const old={...process.env};process.env.SUPABASE_URL='https://fixture.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';t.after(()=>{process.env=old;});});
test('shared verifier normalizes identifiers and accepts existing Supabase accounts',async t=>{
 t.mock.method(globalThis,'fetch',async url=>Response.json(String(url).includes('/token?')?{access_token:'fixture'}:[account]));
 assert.deepEqual(await verifyAccountCredentials(' DESKTOP@EXAMPLE.COM ',password),{email,authProvider:'supabase'});
});
test('shared verifier rejects invalid types before touching upstream',async t=>{
 t.mock.method(globalThis,'fetch',()=>{throw Error('Should not fetch');});
 assert.equal(await verifyAccountCredentials('',password),null);
 assert.equal(await verifyAccountCredentials(email,''),null);
});
test('shared verifier preserves legacy account synchronization',async t=>{
 const paths=[]; t.mock.method(globalThis,'fetch',async url=>{paths.push(new URL(url).pathname);return String(url).includes('/token?')?Response.json({error_code:'invalid_credentials'},{status:400}):Response.json(String(url).includes('/admin/')?{id:'fixture'}:[account]);});
 assert.equal((await verifyAccountCredentials(email,password)).email,email);
 assert.ok(paths.includes('/auth/v1/admin/users'));
});
test('shared verifier supports only provisioned username accounts',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json([{...account,email:'skyrockettest001'}]));
 assert.deepEqual(await verifyAccountCredentials('skyrockettest001',password),{email:'skyrockettest001',authProvider:'account'});
 assert.equal(await verifyAccountCredentials('skyrockettest001','wrong'),null);
 t.mock.method(globalThis,'fetch',async()=>Response.json([]));
 assert.equal(await verifyAccountCredentials('skyrockettest001',password),null);
});
test('upstream outage throws without authorizing a legacy password',async t=>{
 t.mock.method(globalThis,'fetch',async url=>String(url).includes('/token?')?Response.json({error:'private detail'},{status:503}):Response.json([account]));
 await assert.rejects(verifyAccountCredentials(email,password));
});
test('Supabase-only valid user gets the existing zero-credit website account',async t=>{
 let created;
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  if(String(url).includes('/token?'))return Response.json({access_token:'fixture'});
  if(init.method==='POST'){created=JSON.parse(init.body);return Response.json([created]);}
  return Response.json([]);
 });
 assert.equal((await verifyAccountCredentials(email,password)).email,email);
 assert.equal(created.credit_balance,0);assert.equal(created.email,email);assert.notEqual(created.password_hash,password);
});
