// Reviewed gateway runtime releases. This tool never starts or stops a service.
import {execFileSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {smokeGatewayRoutes} from './robot-gateway-release-smoke.mjs';

const scopes = {
  shared:['robot-stream-bridge.mjs','compile-robot-plan.py','robot-stream-session-policy.mjs','robot-session-execution-result.mjs',
    'robot-stream-staging.mjs','robot-cloud-request.mjs','obs-stream-recovery.mjs','robot-session-device-results.mjs','aegis-runner-result.py',
    'robot-stream-process.ps1','restart-robot-stream-bridge.ps1'],
  master:['trusted-master-runner.py','master-command-contract.json','master_gateway_spec.py','master-session-gateway.mjs',
    'master-native-handoff.mjs','verify-master-native-handoff.py','master_native_gesture_readiness.py','master-readiness-check.mjs',
    'master-movement-a-adapter.py','master-booking-admission.mjs'],
  navi:['trusted-navi-runner.py','navi_gateway_spec.py','navi-session-handoff.mjs','navi-booking-admission.mjs'],
  aegis:['trusted-robot-runner.py','aegis_gateway_spec.py','aegis-device-results.py'],
};
export const compatibilityPaths = Object.values(scopes).flat().map(name => 'scripts/'+name).sort();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const lineageFile = '.robot-stream-runtime/gateway-release-lineage.json';
const check = (ok, message) => { if (!ok) throw new Error(message); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function regular(root, name, missing=false) {
  const file = join(root,name);
  // All runtime names are flat in scripts/. Refuse a junction/symlink at
  // either the file or its directory before reading or replacing it.
  check(realpathSync(dirname(file)) === join(realpathSync(root), 'scripts'), 'Untrusted scripts directory: '+root);
  if (missing && !existsSync(file)) return null;
  check(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink(), 'Expected regular runtime file: '+name);
  return readFileSync(file);
}
function git(repo, args) {
  return execFileSync('git', ['-C',repo,...args], {stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024,windowsHide:true});
}
const normalized = bytes => bytes.toString('utf8').replace(/\r\n/g,'\n');
function validatePins(manifest, options) {
  const {gateway, stage, repo} = options;
  check(manifest.version === 1 && Object.hasOwn(scopes, manifest.scope), 'Unsupported gateway release scope or version');
  check([manifest.sourceCommit,manifest.baselineCommit].every(v => typeof v === 'string' && /^[a-f0-9]{40}$/.test(v)), 'Full source and baseline commits required');
  git(repo,['merge-base','--is-ancestor',manifest.baselineCommit,manifest.sourceCommit]);
  check(plain(manifest.files) && Object.keys(manifest.files).length, 'Release needs an exact nonempty target set');
  check(plain(manifest.compatibility) && Object.keys(manifest.compatibility).sort().join('\n') === compatibilityPaths.join('\n'),
        'Incomplete gateway compatibility manifest');
  for (const name of Object.keys(manifest.files)) {
    check(compatibilityPaths.includes(name), 'Unrecognized gateway target: '+name);
    check(manifest.scope === 'shared' || scopes[manifest.scope].includes(name.slice(8)), 'Foreign or shared target in '+manifest.scope+' release: '+name);
    check(plain(manifest.files[name]), 'Invalid release pins: '+name);
  }
  const lineage = join(gateway,lineageFile);
  if (existsSync(lineage)) {
    const prior = JSON.parse(readFileSync(lineage,'utf8'));
    check(prior.sourceCommit === manifest.baselineCommit, 'Installed release predecessor changed');
    for (const name of compatibilityPaths) {
      const bytes = regular(gateway,name,true);
      check((bytes ? digest(bytes) : null) === prior.compatibility?.[name], 'Installed lineage drift: '+name);
    }
  }
  const next = new Map();
  for (const name of compatibilityPaths) {
    const pin = manifest.files[name], original = regular(gateway,name,true);
    let bytes = original;
    if (pin) {
      check(plain(pin) && (pin.before === null || sha(pin.before)) && sha(pin.after), 'Invalid release pins: '+name);
      check((original ? digest(original) : null) === pin.before, 'Installed baseline differs: '+name);
      bytes = regular(stage,name);
      check(digest(bytes) === pin.after, 'Staged bytes differ: '+name);
      check(normalized(bytes) === normalized(git(repo,['show',manifest.sourceCommit+':'+name])), 'Reviewed source differs: '+name);
      if (original && normalized(original)!==normalized(bytes)) {
        // Refuse to replace a local hotfix with the unchanged predecessor
        // blob. Import the hotfix and review a combined change first.
        let oldBlob;
        try {oldBlob=git(repo,['show',manifest.baselineCommit+':'+name]);} catch { /* new tracked path */ }
        check(!oldBlob || normalized(oldBlob)!==normalized(bytes), 'Release would erase a runtime change with an unchanged Git predecessor: '+name);
      }
    }
    check(bytes && sha(manifest.compatibility[name]) && digest(bytes) === manifest.compatibility[name], 'Incompatible runtime bytes: '+name);
    next.set(name,bytes);
  }
  return next;
}

export async function validateRelease(manifest, options) {
  const next = validatePins(manifest,options);
  const temp = mkdtempSync(join(tmpdir(),'eaic-release-'));
  try {
    mkdirSync(join(temp,'scripts'));
    for (const [name,bytes] of next) writeFileSync(join(temp,name),bytes);
    const routes = await smokeGatewayRoutes(temp);
    return {scope:manifest.scope,sourceCommit:manifest.sourceCommit,targets:Object.keys(manifest.files),routes};
  } finally {rmSync(temp,{recursive:true,force:true});}
}

export async function withGatewayReleaseLock(gateway, work) {
  const lock = join(gateway,'.robot-stream-runtime','gateway-release.lock');
  try {mkdirSync(lock);} catch (e) {
    if (e.code === 'EEXIST') throw new Error('Another gateway release owns the lock (or a prior installer requires inspection)');
    throw e;
  }
  try {return await work();} finally {rmSync(lock,{recursive:true});}
}

export function assertIdleState(gateway, now=Date.now()) {
  const {sessions} = JSON.parse(readFileSync(join(gateway,'.robot-stream-runtime','state.json'),'utf8'));
  check(plain(sessions),'Gateway ownership state is unavailable');
  for (const [id,item] of Object.entries(sessions)) {
    check(plain(item),'Invalid gateway booking '+id);
    const until=Date.parse(item.end), from=Date.parse(item.start);
    const occupied = ['pending','staged','running','publishing'];
    if (item.naviCleanupOwner || occupied.includes(item.status) || occupied.includes(item.executionStatus)
        || ['pending','running'].includes(item.endCleanupStatus)
        || (item.status==='completed' && (!Number.isFinite(until)
            || (now < until && (!Number.isFinite(from) || from < now+600000))))) throw new Error('Gateway busy: booking '+id);
  }
}

function atomicWrite(file, bytes) {
  const tmp=file+'.'+randomUUID()+'.tmp';
  try {writeFileSync(tmp,bytes,{flag:'wx'});renameSync(tmp,file);}
  finally {rmSync(tmp,{force:true});}
}
export async function applyLockedRelease(manifest, options, assertQuiescent) {
  check(typeof assertQuiescent === 'function','A quiescence check is required');
  const result = await validateRelease(manifest,options);
  await assertQuiescent();
  assertIdleState(options.gateway);
  const next = validatePins(manifest,options), changed = [];
  try {
    for (const [name,pin] of Object.entries(manifest.files)) {
      const original=regular(options.gateway,name,true);
      check((original ? digest(original) : null) === pin.before,'Predecessor changed before replacement: '+name);
      if (pin.before === pin.after) continue;
      atomicWrite(join(options.gateway,name),next.get(name));
      changed.push({name,original});
    }
    for (const [name,expected] of Object.entries(manifest.compatibility)) {
      check(digest(regular(options.gateway,name)) === expected, 'Post-install hash mismatch: '+name);
    }
    atomicWrite(join(options.gateway,lineageFile),JSON.stringify({version:1,sourceCommit:manifest.sourceCommit,
      compatibility:manifest.compatibility,installed_at:new Date().toISOString()}));
  } catch (error) {
    for (const {name,original} of changed.reverse()) {
      check(digest(regular(options.gateway,name)) === manifest.files[name].after, 'Concurrent runtime modification during rollback: '+name);
      if (original) atomicWrite(join(options.gateway,name),original); else rmSync(join(options.gateway,name));
    }
    throw error;
  }
  return result;
}

// hooks.reload and hooks.verify must throw on failure. They run under the
// same cooperative release lock as validation, replacement, and rollback.
export async function activateGatewayRelease(manifest, options, hooks) {
  check(typeof hooks.reload==='function' && typeof hooks.verify==='function','Activation requires explicit restart and verification callbacks');
  const quiet=hooks.quiescent ?? (()=>windowsQuiescent(options));
  return withGatewayReleaseLock(options.gateway,async()=>{
    await validateRelease(manifest,options);
    await quiet();
    const stamp=randomUUID(), dir=join(options.gateway,'.robot-stream-runtime','release-receipts',stamp);
    mkdirSync(join(dir,'before','scripts'),{recursive:true});
    const receiptFile=join(dir,'receipt.json'), lineage=join(options.gateway,lineageFile);
    const priorLineage=existsSync(lineage)?readFileSync(lineage):null;
    if(priorLineage)writeFileSync(join(dir,'before','lineage.json'),priorLineage);
    const originals=new Map();
    for(const name of Object.keys(manifest.files)){
      const bytes=regular(options.gateway,name,true);
      originals.set(name,bytes);if(bytes)writeFileSync(join(dir,'before',name),bytes);
    }
    const receipt={version:1,sourceCommit:manifest.sourceCommit,baselineCommit:manifest.baselineCommit,
      scope:manifest.scope,targets:manifest.files,started_at:new Date().toISOString()};
    const record=status=>atomicWrite(receiptFile,JSON.stringify({...receipt,status,updated_at:new Date().toISOString()}));
    record('prepared');
    let installed=false;
    try {
      const released=await applyLockedRelease(manifest,options,quiet);
      installed=true;record('files-installed');
      await quiet();
      await hooks.reload({rollback:false,gateway:options.gateway});
      await hooks.verify({rollback:false,compatibility:manifest.compatibility,routes:released.routes});
      record('activated');
      return {...released,receipt:receiptFile};
    } catch(error) {
      if(!installed){record('install-failed');throw error;}
      record('rollback-pending');
      try {
        await quiet(); assertIdleState(options.gateway);
        for(const [name] of originals)check(digest(regular(options.gateway,name))===manifest.files[name].after,'Concurrent modification during rollback: '+name);
        const expectedBefore={...manifest.compatibility};
        for(const [name,bytes] of originals){
          if(bytes)atomicWrite(join(options.gateway,name),bytes);else rmSync(join(options.gateway,name));
          expectedBefore[name]=bytes?digest(bytes):null;
        }
        if(priorLineage)atomicWrite(lineage,priorLineage);else rmSync(lineage,{force:true});
        await hooks.reload({rollback:true,gateway:options.gateway});
        await hooks.verify({rollback:true,compatibility:expectedBefore});
        record('rolled-back');
      } catch(rollbackError) {
        throw new AggregateError([error,rollbackError],'Activation failed; recovery evidence: '+receiptFile);
      }
      throw new Error('Activation failed and the prior release was restored. Receipt: '+receiptFile,{cause:error});
    }
  });
}

export async function windowsQuiescent({gateway, powershellPath = process.env.AGENTECH_GATEWAY_POWERSHELL || 'powershell.exe'}) {
  check(process.platform === 'win32','Use the host installer to supply a quiescence check on this platform');
  assertIdleState(gateway);
  const query=String.raw`
$ErrorActionPreference='Stop'
$dir=Join-Path $env:AGENTECH_RELEASE_GATEWAY_ROOT 'scripts'
. (Join-Path $dir 'robot-stream-process.ps1')
$state=Get-Content -Raw -LiteralPath (Join-Path $env:AGENTECH_RELEASE_GATEWAY_ROOT '.robot-stream-runtime\state.json') | ConvertFrom-Json
$bridges=0
foreach($p in @(Get-CimInstance Win32_Process | Where-Object {$_.Name -match '^(node|python|pythonw)(\.exe)?$'})){
  if(!$p.CommandLine){throw 'Cannot verify all process identities'}
  if($p.CommandLine -match 'trusted-(master|navi|robot)-runner\.py'){throw 'Trusted runner or cleanup is active'}
  if($p.CommandLine -match 'robot-stream-bridge\.mjs'){
    if(!(Test-CommandLineArgumentPath -CommandLine $p.CommandLine -ExpectedPath (Join-Path $dir 'robot-stream-bridge.mjs'))){throw 'Unexpected gateway bridge identity'}
    $bridges++
  }
}
if($bridges -gt 1){throw 'Multiple gateway bridges are active'}
if(@(Get-RobotStreamRestartBlockers -State $state -NoActiveRobotRunnersVerified).Count){throw 'Gateway restart state is busy'}
$lease=Join-Path $env:AGENTECH_RELEASE_GATEWAY_ROOT '.robot-stream-runtime\navi-owner.lock'
if(Test-Path -LiteralPath $lease){$h=[IO.File]::Open($lease,'Open','ReadWrite','ReadWrite');try{$h.Lock(0,1);$h.Unlock(0,1)}finally{$h.Dispose()}}
`;
  execFileSync(powershellPath,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(query,'utf16le').toString('base64')],
    {windowsHide:true,stdio:'pipe',env:{...process.env,AGENTECH_RELEASE_GATEWAY_ROOT:gateway}});
  const {SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY:key} = process.env;
  check(SUPABASE_URL && key,'Live cloud booking check requires gateway environment');
  const url = new URL(SUPABASE_URL.replace(/\/$/,'').replace(/\/rest\/v1$/,'')+'/rest/v1/agentech_robot_sessions');
  url.search=new URLSearchParams({select:'id',scheduled_end:'gte.'+new Date().toISOString(),
    scheduled_start:'lte.'+new Date(Date.now()+600000).toISOString(),session_status:'in.(requested,confirmed,approved,scheduled,pending,running)',limit:'1'});
  const response=await fetch(url,{headers:{apikey:key,authorization:'Bearer '+key},signal:AbortSignal.timeout(5000)});
  check(response.ok,'Cloud booking check failed');
  const rows=await response.json(); check(Array.isArray(rows) && !rows.length,'Active or imminent gateway booking');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [mode,...args]=process.argv.slice(2), flags={};
    for (let i=0;i<args.length;i+=2) flags[args[i]]=args[i+1];
    if (mode==='paths') {console.log(JSON.stringify(compatibilityPaths,null,2));}
    else if (mode==='inspect') {
      const targets=(flags['--targets']??'').split(',');
      check(targets.length && targets.every(name=>compatibilityPaths.includes(name)), 'Supply an exact comma-separated runtime target set');
      const gateway=resolve(flags['--gateway']),stage=resolve(flags['--stage']);
      const compatibility={},files={};
      for(const name of compatibilityPaths){
        const prior=regular(gateway,name,true);
        const after=targets.includes(name)?regular(stage,name):prior;
        check(after,'Missing runtime dependency (must be staged in reviewed release): '+name);
        compatibility[name]=digest(after);
        if(targets.includes(name))files[name]={before:prior?digest(prior):null,after:compatibility[name]};
      }
      console.log(JSON.stringify({version:1,scope:flags['--scope'],sourceCommit:flags['--source-commit'],
        baselineCommit:flags['--baseline-commit'],files,compatibility},null,2));
    }
    else {
      const manifest=JSON.parse(readFileSync(flags['--manifest'],'utf8'));
      const options=Object.fromEntries(['gateway','stage','repo'].map(k=>[k,resolve(flags['--'+k])]));
      check(['verify','apply'].includes(mode),'Use paths, inspect, verify or apply');
      const result=mode==='verify'?await validateRelease(manifest,options):await withGatewayReleaseLock(options.gateway,
        ()=>applyLockedRelease(manifest,options,()=>windowsQuiescent(options)));
      console.log(JSON.stringify(result));
    }
  } catch (error) {console.error(error.message);process.exitCode=1;}
}
