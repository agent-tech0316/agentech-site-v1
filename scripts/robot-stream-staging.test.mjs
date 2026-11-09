import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { checkNaviBookedReadiness } from './navi-booking-admission.mjs';
import { masterFirstCommandNotBefore } from './master-booking-admission.mjs';
import { stageBookedMotion, writeReviewedSource } from './robot-stream-staging.mjs';
import { finishExpiredAdmission, publishExpiredAdmission } from './robot-session-execution-result.mjs';
import { activeCameraStreamDeadline } from './robot-stream-session-policy.mjs';

test('a failed compilation can retry identical reviewed source without overwriting changed source', t => {
  const root = mkdtempSync(join(tmpdir(), 'eaic-staging-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, 'session-94.reviewed.py');
  const code = 'from agentech import Agentech\nAgentech.turn_head()';
  writeReviewedSource(file, code);
  writeReviewedSource(file, code);
  assert.equal(readFileSync(file, 'utf8'), code);
  assert.throws(() => writeReviewedSource(file, code + '\nAgentech.shake_head(5, 2)'), /differs/);
  assert.equal(readFileSync(file, 'utf8'), code);
  assert.throws(() => writeReviewedSource(join(root, 'missing', 'file.py'), code), /ENOENT/);
});

const now = Date.parse('2026-11-05T10:00:00Z');
const booking = changes => ({ id: 94, approved_run_type: 'custom_code', session_status: 'approved',
  scheduled_start: new Date(now - 60000).toISOString(), scheduled_end: new Date(now + 60000).toISOString(), ...changes });

test('camera-only delivery is bounded by a current approved booking even when compilation failed', () => {
  assert.equal(activeCameraStreamDeadline([booking()], now), now + 60000);
  for (const changes of [{ session_status: 'cancelled' }, { session_status: 'failed' },
    { approved_run_type: 'unapproved' }, { scheduled_start: 'invalid' }, { scheduled_end: 'invalid' },
    { scheduled_start: new Date(now + 30000).toISOString() },
    { scheduled_end: new Date(now).toISOString() }]) {
    assert.equal(activeCameraStreamDeadline([booking(changes)], now), 0, JSON.stringify(changes));
  }
  assert.equal(activeCameraStreamDeadline([], now), 0);
});

// Run the production tick with media/cloud boundaries mocked. No robot or OBS
// process is started by this test, including the staging-failure fallback.
const source = readFileSync(new URL('./robot-stream-bridge.mjs', import.meta.url), 'utf8');
const ast = ts.createSourceFile('bridge.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const tick = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'tick').getText(ast);

test('Master launches its runner inside the slot with the viewing deadline, independent of its first command', async ()=>{
  const decl=name=>ast.statements.find(node=>ts.isFunctionDeclaration(node) && node.name?.text===name).getText(ast);
  let time=now-10000;
  class Clock extends Date { constructor(value){super(value ?? time);} static now(){return time;} }
  let obsStarted=false;
  const session={id:102,scheduled_start:new Date(now).toISOString(),scheduled_end:new Date(now+60000).toISOString()};
  const item={start:session.scheduled_start,end:session.scheduled_end,status:'staged',executionModel:'master',
    masterPreparedAttemptId:'pinned-attempt',masterCancelFile:'cancel',localPlan:'plan',masterSessionDeployment:'deployment'};
  const calls=[];
  const bindings={state:{sessions:{102:item}},Date:Clock,masterFirstCommandNotBefore:(value)=>masterFirstCommandNotBefore(value,time),
    startObs:async()=>({startedNow:obsStarted,reconnecting:false}),saveState(){},console:{error(){},log(){}},
    checkMasterBooking:()=>({status:'ready',expiresAt:time+5000}),claimSession:async()=>{calls.push('claim');return true;},
    existsSync:()=>false,join,runtimeDir:'runtime',localPython:'python',trustedMasterRunner:'runner',masterEnvironment:()=>({}),
    openSync:()=>1,closeSync(){},spawn:(_python,args)=>{calls.push(args);return {pid:123,on(){},unref(){}};}};
  const bound=new Function(...Object.keys(bindings),decl('ensureSessionStream')+'\n'+decl('launch')+'\nreturn {ensureSessionStream,launch};')(...Object.values(bindings));
  await bound.ensureSessionStream(session.id,item,time);
  await bound.launch(session);
  assert.deepEqual(calls,[]);
  const warmStream=item.masterViewerStreamStartedAt;
  time=now+1000;
  await bound.ensureSessionStream(session.id,item,time);
  assert.equal(item.masterViewerStreamStartedAt,warmStream);
  await bound.launch(session);
  assert.equal(calls[0],'claim');
  const args=calls[1];
  assert.equal(args[args.indexOf('--first-command-not-before')+1],new Date(now+20000).toISOString());
  assert.equal(item.masterFirstCommandNotBefore,new Date(now+20000).toISOString());
  // If publication is newly established after opening, count from that confirmation.
  obsStarted=true;
  time=now+15000;
  await bound.ensureSessionStream(session.id,item,time);
  assert.equal(masterFirstCommandNotBefore(item,time),new Date(now+35000).toISOString());
});

function naviLaunchFixture(t) {
  const runtimeDir = mkdtempSync(join(tmpdir(), 'eaic-navi-admission-'));
  t.after(() => rmSync(runtimeDir, { recursive: true, force: true }));
  const session = { id: 101, email: 'operator@example.test', approved_run_type: 'custom_code',
    session_status: 'approved', robot_model: 'Navi', code_submission_id: 'reviewed-1',
    scheduled_start: new Date(Date.now() - 1000).toISOString(), scheduled_end: new Date(Date.now() + 120000).toISOString() };
  const bytes = Buffer.from(JSON.stringify({ version: 2, robot_model: 'navi', submission_id: 'reviewed-1',
    source_sha256: 'a'.repeat(64), commands: [{ name: 'stand', args: [] }] }));
  const item = { status: 'staged', executionModel: 'navi', start: session.scheduled_start, end: session.scheduled_end,
    accountEmail: session.email, executionSubmissionId: session.code_submission_id, executionSourceSha256: 'a'.repeat(64),
    localPlan: join(runtimeDir, 'session-101.plan.json'), executionPlanSha256: createHash('sha256').update(bytes).digest('hex') };
  const calls = [];
  const io = { bytes, claimRows: [{ id: session.id }], onPreflight() {} };
  const bindings = { runtimeDir, checkNaviBookedReadiness, state: { sessions: { [session.id]: item } }, join, createHash, localPython: 'python',
    trustedNaviRunner: 'runner', claimableStatuses: ['approved'], normalized: x => x.toLowerCase(),
    robotModel: x => x.toLowerCase(), readFileSync: path => { assert.equal(path, item.localPlan); return io.bytes; },
    naviLaunchBlocker: () => null, naviEnvironment: () => ({}),
    run: (_, args) => { calls.push({ type: 'preflight', args }); io.onPreflight(); },
    request: async (_, query) => { calls.push({ type: 'claim', query }); return io.claimRows; },
    createNaviSessionOwner: () => ({ attempt_id: 'one', owner_file: 'owner', result_file: 'result' }),
    spawn: (_, args, opts) => { calls.push({ type: 'spawn', args, env: opts.env }); return { pid: 123, unref() {}, on() {} }; },
    saveState() {}, openSync() { return 1; }, closeSync() {}, console: { log() {}, error() {} } };
  const declarations = ['claimSession', 'launch'].map(name =>
    ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(ast));
  const launch = new Function(...Object.keys(bindings), declarations.join('\n') + '; return launch;')(...Object.values(bindings));
  return { session, item, io, calls, launch: () => launch(session) };
}

test('Navi readiness, atomic claim and supervisor use the same reviewed booking and exact plan', async t => {
  const f = naviLaunchFixture(t);
  await f.launch();
  assert.deepEqual(f.calls.map(x => x.type), ['preflight', 'claim', 'spawn']);
  assert.deepEqual(f.calls[0].args, ['runner', '--check-home-ready', f.item.localPlan, f.item.executionPlanSha256]);
  const filter = new URLSearchParams(f.calls[1].query);
  for (const key of ['email', 'robot_model', 'approved_run_type', 'code_submission_id', 'scheduled_start', 'scheduled_end']) {
    assert.ok(filter.getAll(key).includes('eq.' + f.session[key]), key);
  }
  assert.equal(f.calls[2].args[2], f.item.localPlan);
  assert.equal(f.calls[2].env.AGENTECH_NAVI_PLAN_SHA256, f.item.executionPlanSha256);
});

test('Navi never dispatches a changed plan, rescheduled or re-claimed booking', async t => {
  const changed = naviLaunchFixture(t);
  changed.io.onPreflight = () => { changed.io.bytes = Buffer.from('different'); };
  await changed.launch();
  assert.deepEqual(changed.calls.map(x => x.type), ['preflight']);
  assert.match(changed.item.launchBlockedReason, /plan hash changed/);
  const rescheduled = naviLaunchFixture(t);
  rescheduled.session.scheduled_start = rescheduled.session.scheduled_end;
  await rescheduled.launch();
  assert.deepEqual(rescheduled.calls, []);
  assert.match(rescheduled.item.launchBlockedReason, /booking changed/);
  const wrongPath = naviLaunchFixture(t);
  wrongPath.item.localPlan = join(tmpdir(), 'different-booking.plan.json');
  await wrongPath.launch();
  assert.deepEqual(wrongPath.calls, []);
  assert.match(wrongPath.item.launchBlockedReason, /plan path/);
  const lost = naviLaunchFixture(t);
  lost.io.claimRows = [];
  await lost.launch();
  assert.deepEqual(lost.calls.map(x => x.type), ['preflight', 'claim']);
});

test('dispatcher restart cannot replay an exhausted Navi cleanup or convert its failure to success', () => {
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'endCleanupCanRun').getText(ast);
  const canRun = new Function(`${fn}; return endCleanupCanRun;`)();
  const old = { status: 'finished', executionModel: 'navi', executionStatus: 'failed',
    endCleanupRequired: true, endCleanupStatus: 'failed', endCleanupAttempts: 3, naviCleanupOwner: null };
  const before = JSON.stringify(old);
  assert.equal(canRun(old), false);
  assert.equal(JSON.stringify(old), before);
  assert.equal(canRun({ ...old, naviCleanupOwner: { pid: 1 } }), true);
  assert.equal(canRun({ ...old, endCleanupAttempts: 2 }), true);
});
function fixture({ sessions = [booking()], stageError, deadline = 0, fetchError } = {}) {
  const events = [];
  const bindings = { state: { sessions: {} }, Date: { now: () => now, parse: Date.parse }, cameraStreamDeadline: deadline,
    masterChecks: { retain() {} }, claimableStatuses: ['requested', 'confirmed', 'approved', 'scheduled', 'pending', 'running'],
    normalized:value=>String(value ?? '').trim().toLowerCase(),
    activeCameraStreamDeadline, keepsStreamActive: () => false,
    dueSessions: async () => { if (fetchError) throw fetchError; return sessions; },
    reviewedSubmission: async () => ({ code: 'Agentech.turn_head()' }),
    stage: () => { events.push('stage'); throw stageError ?? new Error('compiler refused'); },
    startObs: async () => { events.push('start-camera'); },
    stopObs: async () => { events.push('stop-camera'); },
    stopObsVirtualCamera: async () => { events.push('virtual-camera-check'); },
    launch: async () => { events.push('ROBOT-LAUNCH'); },
    finishExpiredAdmission, endCleanupCanRun:()=>false, saveState:()=>{}, syncExecutionResult:async()=>{},
    syncDeviceResults:async()=>{}, console: { error() {} },
  };
  const run = new Function(...Object.keys(bindings), `${tick}; return tick();`);
  return { events, state:bindings.state, run: () => run(...Object.values(bindings)) };
}

test('a staging failure starts the camera for the booked window without launching robot code', async () => {
  const f = fixture({ stageError: new Error('EEXIST') });
  await f.run();
  assert.ok(f.events.includes('start-camera'));
  assert.ok(!f.events.includes('ROBOT-LAUNCH'));
});

test('a cached camera booking prevents stop/start churn and still expires on cloud failure', async () => {
  const active = fixture({ deadline: now + 60000 });
  await active.run();
  assert.ok(!active.events.includes('stop-camera'));
  const expired = fixture({ deadline: now, fetchError: new Error('cloud offline') });
  await assert.rejects(expired.run(), /cloud offline/);
  assert.ok(expired.events.includes('stop-camera'));
});

test('a future booking with a staging failure does not start video early', async () => {
  const f = fixture({ sessions: [booking({ scheduled_start: new Date(now + 30000).toISOString() })] });
  await f.run();
  assert.ok(!f.events.includes('start-camera'));
  assert.ok(!f.events.includes('ROBOT-LAUNCH'));
});

test('staging downloads only the booked account object and caches only exact validated bytes', async t => {
  const runtimeDir = mkdtempSync(join(tmpdir(),'eaic-booked-motion-'));
  t.after(() => rmSync(runtimeDir,{recursive:true,force:true}));
  const {createHash} = await import('node:crypto');
  const hash = value => createHash('sha256').update(value).digest('hex');
  const email = 'regular@example.test', bytes = Buffer.from('motion archive fixture');
  const id = '62ac7c77-2175-4fc3-88db-2ad6fa5e9827';
  const asset = {id,email,object_key:hash(email)+'/'+id+'--Master--YS56aXA.zip',
    sha256:hash(bytes),byte_size:bytes.length};
  let calls=0;
  const config = {email,runtimeDir,baseUrl:'https://fixture.invalid',apiKey:'private-fixture',
    fetchImpl:async (url,opts) => {
      calls++;
      assert.equal(url,'https://fixture.invalid/storage/v1/object/authenticated/eaic-account-assets/'+asset.object_key);
      assert.equal(opts.redirect,'error');
      return new Response(bytes);
    }};
  await assert.rejects(stageBookedMotion({...asset,email:'other@example.test'},config),/storage object/);
  await assert.rejects(stageBookedMotion({...asset,object_key:asset.object_key+'/..'},config),/storage object/);
  assert.equal(calls,0);
  await assert.rejects(stageBookedMotion(asset,{...config,fetchImpl:async()=>new Response(Buffer.alloc(bytes.length))}),/checksum/);
  await assert.rejects(stageBookedMotion(asset,{...config,fetchImpl:async()=>new Response(Buffer.alloc(bytes.length+1))}),/exceeds/);
  const file = await stageBookedMotion(asset,config);
  assert.deepEqual(readFileSync(file),bytes);
  assert.equal(await stageBookedMotion(asset,config),file);
  assert.equal(calls,1);
  writeFileSync(file,'tampered');
  await assert.rejects(stageBookedMotion(asset,config),/checksum/);
});

test('a failed private receipt lookup/stage is retried within the slot and records the bound terminal refusal on expiry', async () => {
  const session = booking({id:87,robot_model:'Master',email:'artist@example.test',code_submission_id:'master-body-v2-asset'});
  const f = fixture({sessions:[session],stageError:new Error('Invalid booked manifest')});
  await f.run();
  await f.run();
  assert.equal(f.events.filter(e=>e==='stage').length,2);
  const item = f.state.sessions[session.id];
  assert.equal(item.bodyStagePending,true);
  assert.equal(finishExpiredAdmission(item,Date.parse(session.scheduled_end)),true);
  assert.match(item.executionResultError,/0 commands dispatched.*Invalid booked manifest/);
  let patches = 0;
  const request = async (_table, query, options) => {
    const q = new URLSearchParams(query);
    assert.equal(q.get('scheduled_start'),'eq.'+session.scheduled_start);
    assert.equal(q.get('body_attempt_id'),'is.null');
    assert.equal(q.get('email'),'eq.'+session.email);
    if (!options) return [{id:87,session_status:'scheduled',execution_error:null}];
    patches++;
    return [{id:87}];
  };
  assert.equal(await publishExpiredAdmission(request,session.id,item),true);
  assert.equal(patches,1);
});

test('lost body claim acknowledgement remains durable across a restart and cannot dispatch or replay', async () => {
  const decl = ast.statements.find(n=>ts.isFunctionDeclaration(n) && n.name?.text==='claimSession').getText(ast);
  const session = {id:85,email:'artist@example.test'};
  const item = {status:'staged',executionStatus:'pending',executionModel:'master',executionResultRequired:true,
    bodyAssetId:'asset',masterPreparedAttemptId:'prepared',executionSubmissionId:'master-body-v2-asset',
    accountEmail:session.email,start:new Date(now-1000).toISOString(),end:new Date(now+120000).toISOString()};
  const state = {sessions:{85:item}};
  let saved, calls=0;
  const claim = new Function('state','saveState','request',decl+'; return claimSession;')(state,
    ()=>{saved=structuredClone(state);},async (name,_query,options)=>{
      calls++;
      assert.equal(saved.sessions[85].bodyClaimInFlight,'prepared');
      assert.equal(options.body.p_attempt,'prepared');
      throw new Error('lost response');
    });
  await assert.rejects(claim(session),/lost response/);
  state.sessions = saved.sessions;
  await assert.rejects(claim(session),/pending/);
  const recovered = state.sessions[85];
  assert.equal(finishExpiredAdmission(recovered,now),true);
  assert.equal(await publishExpiredAdmission(async (name,_query,{body})=>{
    assert.equal(name,'rpc/agentech_reconcile_unlaunched_body_booking');
    assert.equal(body.p_attempt,'prepared');
    assert.equal(body.p_start,item.start);
    assert.equal(body.p_end,item.end);
    assert.equal(body.p_email,session.email);
    return true;
  },85,recovered),true);
  assert.equal(calls,1);
  assert.equal(recovered.executionAttemptId,undefined);
});
