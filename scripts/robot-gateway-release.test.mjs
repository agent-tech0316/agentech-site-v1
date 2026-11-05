import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFileSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {activateGatewayRelease,applyLockedRelease,assertIdleState,compatibilityPaths,validateRelease,withGatewayReleaseLock} from './robot-gateway-release.mjs';

const source=dirname(dirname(fileURLToPath(import.meta.url)));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(t) {
  const root=mkdtempSync(join(tmpdir(),'gateway-release-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const gateway=join(root,'gateway'),stage=join(root,'stage'),repo=join(root,'repo');
  for(const dir of [gateway,stage,repo])mkdirSync(join(dir,'scripts'),{recursive:true});
  mkdirSync(join(gateway,'.robot-stream-runtime'));writeFileSync(join(gateway,'.robot-stream-runtime','state.json'),'{"sessions":{}}');
  const compatibility={};
  for(const name of compatibilityPaths){
    for(const dir of [gateway,stage,repo])copyFileSync(join(source,name),join(dir,name));
    compatibility[name]=hash(readFileSync(join(source,name)));
  }
  const git=(...args)=>execFileSync('git',['-C',repo,...args],{stdio:['ignore','pipe','pipe']}).toString().trim();
  const commit=()=>{git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-m','fixture');return git('rev-parse','HEAD');};
  git('init','--quiet');git('config','core.autocrlf','false');
  const base=commit(), target='scripts/trusted-master-runner.py';
  const updated=Buffer.concat([readFileSync(join(repo,target)),Buffer.from('\n# reviewed offline fixture\n')]);
  for(const dir of [repo,stage])writeFileSync(join(dir,target),updated);
  const manifest={version:1,scope:'master',sourceCommit:commit(),baselineCommit:base,
    files:{[target]:{before:compatibility[target],after:hash(updated)}},compatibility:{...compatibility,[target]:hash(updated)}};
  return {manifest,options:{gateway,stage,repo},target,commit,compatibility};
}
test('scoped release exercises all three adapters, updates only the named runner and pins the predecessor',async t=>{
  const {manifest,options,target}=fixture(t);
  const before=hash(readFileSync(join(options.gateway,'scripts/robot-stream-bridge.mjs')));
  await withGatewayReleaseLock(options.gateway,async()=>{
    await assert.rejects(withGatewayReleaseLock(options.gateway,()=>{}),/owns the lock/);
    const result=await applyLockedRelease(manifest,options,async()=>{});
    assert.equal(result.routes.master,'trusted-master-runner.py');
    assert.equal(result.routes.navi,'trusted-navi-runner.py');assert.equal(result.routes.aegis,'trusted-robot-runner.py');
  });
  assert.equal(hash(readFileSync(join(options.gateway,target))),manifest.files[target].after);
  assert.equal(hash(readFileSync(join(options.gateway,'scripts/robot-stream-bridge.mjs'))),before);
  await assert.rejects(validateRelease(manifest,options),/predecessor changed/);
});
test('foreign and shared even byte-identical files, baseline drift, and unreviewed bytes fail closed',async t=>{
  const {manifest,options,target}=fixture(t);
  for(const name of ['scripts/trusted-navi-runner.py','scripts/robot-stream-bridge.mjs','scripts/aegis-runner-result.py']){
    const same=manifest.compatibility[name];
    await assert.rejects(validateRelease({...manifest,files:{[name]:{before:same,after:same}}},options),/Foreign or shared/);
  }
  await assert.rejects(validateRelease({...manifest,compatibility:{}},options),/Incomplete/);
  await assert.rejects(validateRelease({...manifest,files:{[target]:{...manifest.files[target],before:'0'.repeat(64)}}},options),/baseline differs/);
  const staged=join(options.stage,target);writeFileSync(staged,'# substituted\n');
  const sha=hash(readFileSync(staged));
  await assert.rejects(validateRelease({...manifest,files:{[target]:{before:manifest.files[target].before,after:sha}},
    compatibility:{...manifest.compatibility,[target]:sha}},options),/Reviewed source differs/);
});
test('an explicitly reviewed older bridge that drops Navi plan binding does not pass shared smoke',async t=>{
  const {manifest,options,commit}=fixture(t);
  const name='scripts/robot-stream-bridge.mjs';
  const bad=readFileSync(join(options.stage,name),'utf8').replace('checkRunner: args => run(localPython, [trustedNaviRunner, ...args]',
    'checkRunner: args => run(localPython, [trustedNaviRunner, "--check-home-ready"]');
  assert.notEqual(hash(bad),manifest.compatibility[name],'fixture must alter production adapter');
  for(const dir of [options.repo,options.stage])writeFileSync(join(dir,name),bad);
  const merged={...manifest,scope:'shared',sourceCommit:commit(),files:{...manifest.files,[name]:{before:manifest.compatibility[name],after:hash(bad)}},
    compatibility:{...manifest.compatibility,[name]:hash(bad)}};
  await assert.rejects(validateRelease(merged,options),/not equal|deep-equal|Expected values/);
});
test('active session, ambiguous owner and failed quiescence leave installed bytes unchanged',async t=>{
  const {manifest,options,target}=fixture(t);
  const state=join(options.gateway,'.robot-stream-runtime','state.json');
  for(const entry of [{status:'running'},{endCleanupStatus:'running'},{naviCleanupOwner:{pid:1}}]){
    writeFileSync(state,JSON.stringify({sessions:{abc:entry}}));assert.throws(()=>assertIdleState(options.gateway),/Gateway busy/);
  }
  writeFileSync(state,'{"sessions":{}}');
  await withGatewayReleaseLock(options.gateway,()=>assert.rejects(applyLockedRelease(manifest,options,async()=>{throw new Error('cloud reservation');}),/cloud reservation/));
  assert.equal(hash(readFileSync(join(options.gateway,target))),manifest.files[target].before);
});
test('activation retains lock through reload and restores exact prior bytes on failed verification',async t=>{
  const {manifest,options,target}=fixture(t), phases=[];
  const hooks={quiescent:async()=>{},reload:async({rollback})=>{
    phases.push('reload:'+rollback);await assert.rejects(withGatewayReleaseLock(options.gateway,()=>{}),/owns the lock/);
  },verify:async({rollback,compatibility})=>{
    phases.push('verify:'+rollback);
    assert.equal(hash(readFileSync(join(options.gateway,target))),compatibility[target]);
    if(!rollback)throw new Error('Simulated health failure');
  }};
  await assert.rejects(activateGatewayRelease(manifest,options,hooks),/prior release was restored/);
  assert.deepEqual(phases,['reload:false','verify:false','reload:true','verify:true']);
  assert.equal(hash(readFileSync(join(options.gateway,target))),manifest.files[target].before);
});
