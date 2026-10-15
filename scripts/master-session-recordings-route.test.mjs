import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as policy from '../lib/master-session-recordings.ts';

const nativeRequire=createRequire(import.meta.url);
function load(path,overrides) {
  const source=ts.transpileModule(fs.readFileSync(path,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const module={exports:{}};
  new Function('require','module','exports',source)(name=>overrides[name]??nativeRequire(name),module,module.exports);
  return module.exports;
}
const id='fc88493f-2d5d-4560-ac20-f95eeea8cc20';
const file='a'.repeat(32)+'-00001.jsonl.gz';
const row={session_id:123,recording_id:id,profile_id:45,profile_username:'user-a',account_email:'a@example.com',
  capture_status:'complete',storage_status:'available',manifest:{session:{session_id:123,recording_id:id,profile_id:45},
    files:[{path:file,sha256:'a'.repeat(64),bytes:42}]}};
const parent={id:123,email:'a@example.com',robot_model:'Master',access_profile_id:45};
let email='a@example.com';
const api=load('app/api/master-session-recordings/route.ts',{
  '@/lib/master-session-recordings':policy,
  '@/lib/server-account-session':{getServerAccountEmail:async(_,options)=>{
    assert.equal(options.requireSignedSession,true);return email;
  }},
  '@/lib/supabase-server':{supabaseRequest:async table=>table==='agentech_robot_sessions'?[parent]:[row]}
});
function request(query='sessionId=123') {return {nextUrl:new URL('http://localhost/api/master-session-recordings?'+query)};}

test('record route requires authentication, validates IDs and isolates the owner',async()=>{
  email='';assert.equal((await api.GET(request())).status,401);
  email='a@example.com';assert.equal((await api.GET(request('sessionId=123%26email=evil'))).status,400);
  email='b@example.com';assert.equal((await api.GET(request())).status,404);
  email='a@example.com';
  const response=await api.GET(request());const result=await response.json();
  assert.equal(response.status,200);assert.equal(result.username,'user-a');
  assert.equal('account_email' in result,false);assert.equal('recorder_id' in result,false);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(api.DELETE,undefined);assert.equal(api.POST,undefined);assert.equal(api.PATCH,undefined);
});

test('download authorizes the exact private object and limits signed URL lifetime',async()=>{
  const previousFetch=globalThis.fetch;
  const url=process.env.SUPABASE_URL;const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-key';
  let calls=0;
  globalThis.fetch=async(target,options)=>{
    calls++;
    assert.equal(target,`https://test.supabase.co/storage/v1/object/sign/master-session-recordings/master/session-123/${id}/${file}`);
    assert.equal(JSON.parse(options.body).expiresIn,60);
    return Response.json({signedURL:`/object/sign/master-session-recordings/master/session-123/${id}/${file}?token=fixture`});
  };
  try {
    email='a@example.com';
    assert.equal((await api.GET(request('sessionId=123&download=..%2Fsecret'))).status,404);
    assert.equal(calls,0);
    const response=await api.GET(request(`sessionId=123&download=${file}`));
    assert.equal(response.status,200);assert.equal((await response.json()).expiresIn,60);
    const manifest=await api.GET(request('sessionId=123&download=manifest.json'));
    assert.match(manifest.headers.get('content-disposition'),/^attachment/);
    assert.equal(calls,1);
  } finally {
    globalThis.fetch=previousFetch;
    if(url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=url;
    if(key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=key;
  }
});

test('strict recording auth rejects the legacy cookie even in development',async()=>{
  const auth=load('lib/server-account-session.ts',{
    'next/headers':{cookies:async()=>({get:name=>name==='legacy'?{value:'a@example.com'}:undefined})},
    '@/lib/account-session':{accountSessionCookieName:'legacy'},
    '@/lib/prototype-auth':{normalizeEmail:value=>String(value??'').trim().toLowerCase(),isValidAccountIdentifier:()=>true,isValidEmail:()=>true}
  });
  assert.equal(await auth.getServerAccountEmail(undefined,{requireSignedSession:true}),'');
  assert.equal(await auth.getServerAccountEmail(undefined,{allowLegacyCookie:true}),'a@example.com');
});
