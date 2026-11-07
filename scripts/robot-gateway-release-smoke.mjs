// Execute the reviewed bridge's actual launch function with its actual JS
// booking adapters. The database, subprocesses, SSH, and SDK transport are
// stand-ins. The bridge polling loop and OBS are never loaded.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runInNewContext} from 'node:vm';

const hash = b => createHash('sha256').update(b).digest('hex');
const runnerSmoke = String.raw`
import sys, types, importlib.util, hashlib
from contextlib import nullcontext, redirect_stdout
from io import StringIO
from pathlib import Path
root=Path(sys.argv[1]); fixtures=Path(sys.argv[2])
sys.path.insert(0,str(root/'scripts'))
def audit(event,args):
    if event.startswith(('socket.', 'subprocess.', 'os.system','os.startfile','os.spawn')):
        raise RuntimeError('Hardware/network transport forbidden in release smoke')
sys.addaudithook(audit)
sdk=types.ModuleType('agentech'); sdk.Agentech=object()
sys.modules['agentech']=sdk
def runner(name):
    path=root/'scripts'/name
    spec=importlib.util.spec_from_file_location('release_'+name.split('.')[0],path)
    m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m
navi=runner('trusted-navi-runner.py')
path=fixtures/'smoke-navi'/'session-1.plan.json'; digest=hashlib.sha256(path.read_bytes()).hexdigest()
seen=[]
navi.navi_owner=lambda: nullcontext()
navi.check_home_ready=lambda plan, *, reviewed=False: seen.append((plan.raw,reviewed))
sys.argv=['navi','--check-home-ready',str(path),digest]; navi.main()
assert seen==[(path.read_bytes(),True)], 'Navi runner ignored bound preflight'
sys.argv[-1]='0'*64
try: navi.main()
except ValueError: pass
else: raise AssertionError('Navi runner accepted a wrong plan digest')
master=runner('trusted-master-runner.py'); seen.clear()
master.preflight=lambda plan,deployment,*,session_end: (seen.append((plan,deployment,session_end)) or {'ready':True})
sys.argv=['master','--check-ready','--plan','bound-plan','--deployment','bound-config']
with redirect_stdout(StringIO()): master.main()
assert seen==[('bound-plan','bound-config',None)], 'Master runner ignored preflight binding'
seen.clear()
master.execute_plan=lambda plan,deployment,result_file,**kwargs: (seen.append((plan,deployment,kwargs['first_command_not_before'])) or {'outcome':'completed','handoff_ready':True})
target='2026-11-05T21:50:20Z'
sys.argv=['master','--plan','bound-plan','--deployment','bound-config','--result-file','bound-result','--first-command-not-before',target]
with redirect_stdout(StringIO()): master.main()
assert seen==[('bound-plan','bound-config',target)], 'Master runner ignored first-command deadline'
aegis=runner('trusted-robot-runner.py'); seen.clear()
aegis.execute=lambda plan,*,results_path,final_result_path: seen.append((str(plan),str(final_result_path)))
sys.argv=['aegis','bound-plan','--final-result','bound-receipt']; aegis.main()
assert seen==[('bound-plan','bound-receipt')], 'Aegis runner ignored receipt binding'
`;
function declaration(source,name,async=true) {
  const start=source.indexOf((async?'async ':'')+'function '+name+'(');
  assert.ok(start>=0,'Missing bridge launch entry point');
  const end=source.indexOf('\n}',start);
  assert.ok(end>start,'Unrecognized bridge launch function');
  return source.slice(start,end+2);
}
export async function smokeGatewayRoutes(root) {
  const scratch=mkdtempSync(join(tmpdir(),'eaic-dispatch-smoke-'));
  try { return await simulateRoutes(root,scratch); }
  finally {rmSync(scratch,{recursive:true,force:true});}
}
async function simulateRoutes(root, scratch) {
  const scripts=join(root,'scripts'), file=name=>join(scripts,name);
  const source=readFileSync(file('robot-stream-bridge.mjs'),'utf8');
  const load=name=>import(pathToFileURL(file(name)).href);
  for (const [fn,name] of [['masterBookingAdmission','master-booking-admission.mjs'],['checkNaviBookedReadiness','navi-booking-admission.mjs']]) {
    assert.match(source,new RegExp('import\\s*\\{[^}]*\\b'+fn+'\\b[^}]*\\}\\s*from\\s*["\']\\./'+name.replaceAll('.','\\.')+'["\']'),
      'Bridge must import the reviewed '+fn+' adapter');
  }
  const {masterBookingAdmission,masterFirstCommandNotBefore}=await load('master-booking-admission.mjs');
  const {checkNaviBookedReadiness}=await load('navi-booking-admission.mjs');
  const {MasterReadinessChecks}=await load('master-readiness-check.mjs');
  const {naviLaunchBlocker}=await load('navi-session-handoff.mjs');
  const runner = name => {
    const match=source.match(new RegExp('const '+name+' = join\\(here, ["\']([^"\']+)["\']\\);'));
    assert.ok(match,'Bridge runner declaration missing: '+name); return file(match[1]);
  };
  const launchCode=declaration(source,'checkMasterBooking',false)+'\n('+declaration(source,'launch')+')(session)';
  const routes={};
  for (const model of ['master','navi','aegis']) {
    const runtimeDir=join(scratch,'smoke-'+model);mkdirSync(runtimeDir);
    const start=new Date(Date.now()-1000).toISOString(),end=new Date(Date.now()+60000).toISOString();
    const session={id:1,email:'gateway-smoke@example.invalid',robot_model:model,session_status:'confirmed',
      approved_run_type:'custom_code',code_submission_id:7,scheduled_start:start,scheduled_end:end};
    const plan=Buffer.from(JSON.stringify({version:2,robot_model:model,submission_id:7,source_sha256:hash('fixture'),
      commands:[{name:model==='master'?'turn_head':model==='navi'?'stand':'status',args:{}}]}));
    const localPlan=join(runtimeDir,'session-1.plan.json');writeFileSync(localPlan,plan);
    const masterDeploymentFile=join(runtimeDir,'master.json');writeFileSync(masterDeploymentFile,JSON.stringify({enabled:true}));
    const item={start,end,status:'staged',streamStatus:'publishing',masterViewerStreamStartedAt:start,
      executionModel:model,executionSubmissionId:7,accountEmail:session.email,
      executionPlanSha256:hash(plan),executionSourceSha256:hash('fixture'),localPlan,remotePlan:'remote-plan',remoteExecutionResult:'result'};
    const launched=[],checks=[],adapters=[],claims=[];
    const context={state:{sessions:{1:item}},runtimeDir,localPython:'fixture-python',robotPython:'fixture-python',masterFirstCommandNotBefore,
      masterDeploymentFile,claimableStatuses:['confirmed'],masterChecks:new MasterReadinessChecks(),naviLaunchBlocker,
      masterBookingAdmission:(...args)=>{adapters.push('master');return masterBookingAdmission(...args);},
      checkNaviBookedReadiness:(...args)=>{adapters.push('navi');return checkNaviBookedReadiness(...args);},
      readFileSync,existsSync,join,trustedMasterRunner:runner('trustedMasterRunner'),trustedNaviRunner:runner('trustedNaviRunner'),
      runAsync:(_exe,args)=>{
        checks.push(Array.from(args));
        const child = new EventEmitter();
        const result = Promise.resolve({stdout:JSON.stringify({ready:true,robot_model:'master',
          robot_commands_sent:false,plan_sha256:item.executionPlanSha256})});
        queueMicrotask(()=>child.emit('close',0));
        return Object.assign(result,{child});
      },
      run:(exe,args)=>{if(exe==='ssh'){const last=args.at(-1);if(last.includes('nohup'))launched.push(last);return '123';}
        checks.push(Array.from(args));return '';},
      masterEnvironment:()=>({}),naviEnvironment:()=>({}),sshArgs:()=>[],robot:'fixture@invalid',remoteDir:'/fixture',
      claimSession:async()=>{claims.push(model);return true;},saveState:()=>{},openSync:()=>0,closeSync:()=>{},
      createNaviSessionOwner:()=>({attempt_id:'fixture-navi',owner_file:'owner',result_file:'result'}),
      spawn:(_exe,args)=>{launched.push(Array.from(args));return {pid:123,on(){},unref(){}};},
      console:{error(){},log(){}},session};
    const dispatch=runInNewContext(launchCode,context,{timeout:2000});
    await dispatch;
    if(model==='master'&&!launched.length){await new Promise(resolve=>setImmediate(resolve));
      await runInNewContext(launchCode,context,{timeout:2000});}
    assert.equal(launched.length,1,model+' launch failed: '+(item.launchBlockedReason??'no runner'));
    assert.equal(claims.length,1,model+' claim count');
    if(model==='aegis'){
      assert.match(launched[0],/\/trusted-robot-runner\.py'/);assert.deepEqual(adapters,[]);
    } else {
      assert.ok(adapters.length && adapters.every(x=>x===model),'Wrong adapter: '+model);
      const name='trusted-'+model+'-runner.py';
      assert.equal(basename(launched[0][0]),name);assert.equal(checks.length,1);
      assert.equal(basename(checks[0][0]),name);
      if(model==='navi'){
        assert.deepEqual(checks[0].slice(1),['--check-home-ready',localPlan,item.executionPlanSha256]);
        assert.deepEqual(launched[0].slice(1,3),['--booked-session',localPlan]);
      } else {
        assert.deepEqual(checks[0].slice(1,4),['--check-ready','--plan',localPlan]);
        assert.deepEqual(launched[0].slice(1,3),['--plan',localPlan]);
        assert.equal(launched[0][launched[0].indexOf('--first-command-not-before')+1],
          new Date(Date.parse(start)+20000).toISOString());
      }
    }
    routes[model]=model==='aegis'?'trusted-robot-runner.py':'trusted-'+model+'-runner.py';
  }
  execFileSync(process.env.ROBOT_LOCAL_PYTHON || 'python',['-I','-B','-c',runnerSmoke,root,scratch],
    {cwd:scratch,timeout:10000,windowsHide:true,stdio:['ignore','pipe','pipe']});
  return routes;
}
