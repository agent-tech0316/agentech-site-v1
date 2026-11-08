import test from 'node:test';
import assert from 'node:assert/strict';
import { createBodyPlan, parseBodySubmission, verifyBodyReceipt } from './master-native-body.mjs';
import { createGatewayCloudRequest } from './robot-cloud-request.mjs';
import { parseMasterExecutionResult } from './master-session-gateway.mjs';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const spec = JSON.parse(readFileSync(new URL('./master-happy-dance.json', import.meta.url)));
const assetId = 'b7f76821-a087-404e-a2ac-dfd7fe260aff';
const row = {id:'master-body-'+assetId, code:spec.source, robot_model:'Master', run_mode:spec.mode, ai_security_model:spec.mode};
test('booking accepts the identified original ZIP on an older receipt and rejects a changed archive', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.agentech_accounts(email text primary key);
    create table public.agentech_robot_sessions(id bigint primary key);
  `);
  for (const name of ['20261107212500_eaic_account_review_exemptions','20261107213459_eaic_account_asset_submissions',
    '20261107225233_master_happy_dance_booking','20261107231637_match_legacy_happy_dance_receipt']) {
    await db.exec(readFileSync(new URL('../supabase/migrations/'+name+'.sql',import.meta.url),'utf8'));
  }
  const owner = 'package-owner@example.test', other = 'other-owner@example.test';
  await db.query('insert into public.agentech_accounts (email) values ($1),($2)',[owner,other]);
  await db.query('insert into public.agentech_code_review_exemptions (email) values ($1),($2)',[owner,other]);
  await db.query(`insert into public.agentech_account_asset_submissions
    (id,email,object_key,file_name,robot_model,asset_kind,byte_size,sha256,native_motion_name)
    values ($1,$2,'original','renamed.zip','Master','Package',5164116,$3,null)`,[assetId,owner,spec.zip]);
  const eligible = async email => (await db.query(
    'select public.agentech_happy_dance_asset($1,$2) as eligible',[email,assetId])).rows[0].eligible;
  assert.equal(await eligible(owner),true);
  assert.equal(await eligible(other),false);
  await db.query('update public.agentech_account_asset_submissions set native_motion_name=$1',[spec.motion]);
  assert.equal(await eligible(owner),true);
  await db.query('update public.agentech_account_asset_submissions set sha256=$1',['0'.repeat(64)]);
  assert.equal(await eligible(owner),false);
});
test('only the server-issued package submission produces one native command', () => {
  assert.equal(parseBodySubmission(row),assetId);
  assert.throws(()=>parseBodySubmission({...row,ai_security_model:'account-certification-exemption'}));
  assert.throws(()=>parseBodySubmission({...row,code:row.code+'\n'}));
  assert.equal(parseBodySubmission({...row,id:'ordinary-id',run_mode:'custom',ai_security_model:'custom'}),null);
  const plan=createBodyPlan(row);
  assert.deepEqual(plan.commands,[{name:'play_body',args:{motion_name:spec.motion,audio_path:''},line:1}]);
  assert.equal(plan.asset_id,assetId);
});
test('HTTP acceptance alone cannot certify a native dance', () => {
  assert.equal(verifyBodyReceipt({outcome:'completed',commands:[{name:'play_body',result:{message:'Play success'}}]}),false);
});
test('the booked receipt accepts measured completion and rejects lost telemetry or substituted audio', () => {
  const binding={owner:'mc_ros2_node3097',mode:'STAND_DEFAULT',player:0,settled:true};
  const start='2026-11-07T20:00:20Z', end='2026-11-07T20:02:00Z', plan=createBodyPlan(row);
  const result={serial:spec.serial,asset_id:assetId,policy_sha256:spec.policy,audio_sha256:spec.audio,zip_sha256:spec.zip,
    play_response:'Play success',native_motion:spec.motion,bundled_audio:'audio.wav',playing_seconds:59.4,peak_travel_rad:2.542,joints_fault_free:true};
  result.audio_output={board:'soc2',file:'audio.wav',sha256:spec.audio,pcm_bytes:2080000,sample_rate_hz:16000,
    channels:1,bits_per_sample:16,muted:false,volume:85,opened_at_robot:'2026-11-08T04:00:20+08:00',
    started_at_robot:'2026-11-08T04:00:21+08:00',finished_at_robot:'2026-11-08T04:01:26+08:00',playing_seconds:65,completed:true};
  const cmd={...plan.commands[0],command_index:1,source_args:plan.commands[0].args,status:'completed',started_at:start,
    sdk_call_started_at:start,duration_ms:64000,result,error:null};
  const raw={schema_version:1,robot_model:'master',outcome:'completed',session_id:'12',submission_id:row.id,source_sha256:plan.source_sha256,
    plan_sha256:'b'.repeat(64),attempt_id:'attempt',booked_end:end,command_count:1,completed_count:1,commands:[cmd],error:null,
    started_at:'2026-11-07T20:00:00Z',finished_at:'2026-11-07T20:01:24Z',handoff_ready:true,handoff_mode:'native-body-playback',
    owner_hold_preserved:false,owner_hold_verified:false,owner_binding:binding,final_owner_binding:binding};
  const expected={sessionId:'12',submissionId:row.id,sourceSha256:plan.source_sha256,planSha256:raw.plan_sha256,attemptId:'attempt',bookedEnd:end};
  assert.equal(parseMasterExecutionResult(JSON.stringify(raw),expected).completed_count,1);
  for(const change of [{playing_seconds:1},{joints_fault_free:false},{audio_sha256:spec.policy},{asset_id:'bad'},{peak_travel_rad:0},
    {audio_output:null},{audio_output:{...result.audio_output,muted:true}},{audio_output:{...result.audio_output,completed:false}}]) {
    assert.throws(()=>parseMasterExecutionResult(JSON.stringify({...raw,commands:[{...cmd,result:{...result,...change}}]}),expected));
  }
});

test('atomic native claim uses one POST and the cloud client rejects arbitrary RPC paths', async () => {
  const calls=[];
  const request=createGatewayCloudRequest({baseUrl:'https://fixture.invalid',apiKey:'fixture',
    fetchImpl:async(url,init)=>{calls.push({url,init});return Response.json(true)}});
  assert.equal(await request('rpc/agentech_claim_body_booking','',{method:'POST',body:{p_asset:assetId}}),true);
  assert.equal(calls.length,1);
  assert.ok(calls[0].url.includes("/rest/v1/rpc/agentech_claim_body_booking"));
  await assert.rejects(request('rpc/agentech_claim_body_booking',''),/Invalid cloud table/);
  await assert.rejects(request('rpc/other','',{method:'POST'}),/Invalid cloud table/);
});
