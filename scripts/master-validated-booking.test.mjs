import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const migrationDir = new URL('../supabase/migrations/', import.meta.url);
const schema = readFileSync(new URL('../supabase-schema.sql', import.meta.url),'utf8');
const account = 'booker@example.test';
const asset = '90e0634e-c41e-42cb-842d-a568a6de67fa';
const digest = 'a'.repeat(64);
const manifest = {version:1, playback:{mode:'movement_with_audio'}, audio:{durationSeconds:75},
  movement:{metadata:{masterContract:{model:'Master Ultra',controlHz:50,frameCount:2000,evidence:'static-interface'}}}};

test('validated bookings authorize precisely the signed owner, slot, package and one gateway attempt', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  // Start from the application tables, then apply the actual deployed booking migration chain.
  await db.exec(schema.split('insert into storage.buckets')[0]);
  await db.exec('grant all on all tables in schema public to service_role; grant usage on all sequences in schema public to service_role;');
  await db.exec(readFileSync(new URL('202608250200_aegis_execution_results.sql',migrationDir),'utf8'));
  for (const file of readdirSync(migrationDir).filter(f => f >= '20261107' && f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(new URL(file,migrationDir),'utf8'));
  }
  await db.query("insert into agentech_accounts(email,password_hash,salt,paid_credit_balance,bonus_credit_balance) values($1,'x','x',450,550),('other@example.test','x','x',0,0)",[account]);
  await db.query("insert into agentech_account_profiles(id,account_email,profile_type,username) values(1,'other@example.test','student','other')");
  await db.exec('set role service_role');
  await db.query(`insert into agentech_account_asset_submissions
    (id,email,object_key,file_name,robot_model,asset_kind,byte_size,sha256)
    values($1,$2,$3,'my-routine.zip','Master','Package',1000,$4)`, [asset,account,'private/'+asset,digest]);
  const scalar = async (sql, params = []) => (await db.query(sql,params)).rows[0].v;
  const start = new Date(Date.now()+900000).toISOString();
  const end = new Date(Date.parse(start)+300000).toISOString();
  const reserve = (override = {}) => {
    const args = {owner:account,asset,profile:null,start,end,cost:500,notes:null,...override};
    return scalar('select agentech_reserve_validated_body($1,$2,$3,$4,$5,$6,$7) v',Object.values(args));
  };
  assert.equal((await reserve()).error,'invalid_asset');
  await db.query("update agentech_account_asset_submissions set approval_basis='master-policy-contract-v1', content_manifest=$1 where id=$2",[manifest,asset]);
  await assert.rejects(db.query("update agentech_account_asset_submissions set sha256=$1 where id=$2",['b'.repeat(64),asset]),/permission denied/);
  await assert.rejects(db.query("update agentech_account_asset_submissions set content_manifest=$1 where id=$2",[manifest,asset]),/one-time/);
  assert.equal((await reserve({owner:'other@example.test'})).error,'invalid_asset');
  const edu = randomUUID();
  const eduManifest = structuredClone(manifest);
  eduManifest.movement.metadata.masterContract.model = 'Master Edu';
  await db.query(`insert into agentech_account_asset_submissions
    (id,email,object_key,file_name,robot_model,asset_kind,byte_size,sha256,approval_basis,content_manifest)
    values($1,$2,$3,'edu-motion.zip','Master','Package',1500,$4,'master-policy-contract-v1',$5)`,
    [edu,account,'private/'+edu,'b'.repeat(64),eduManifest]);
  assert.equal((await reserve({asset:edu})).error,'target_mismatch');
  assert.equal((await reserve({profile:1})).error,'invalid_profile');
  assert.equal((await reserve({cost:1001})).error,'insufficient_credits');
  assert.equal((await reserve({end:new Date(Date.parse(start)+104000).toISOString()})).error,'short_slot');
  await db.query("insert into agentech_robot_sessions(id,email,session_title,session_status) values(-4175000002,$1,'reservation lock','cancelled')",[account]);
  assert.equal((await reserve()).error,'conflict');
  await db.query('delete from agentech_robot_sessions where id=-4175000002');
  const booked = (await reserve()).session;
  assert.equal(booked.code_submission_id,'master-body-v2-'+asset);
  assert.equal(booked.access_profile_id,null);
  assert.equal(booked.body_booking_starts_automatically,true);
  assert.equal(booked.body_start_authority,null);
  assert.equal(booked.session_status,'scheduled');
  const retried = await reserve();
  assert.equal(retried.reused,true);
  assert.equal(retried.session.id,booked.id);
  assert.equal((await reserve({end:new Date(Date.parse(end)+60000).toISOString()})).error,'conflict');
  assert.deepEqual((await db.query('select paid_credit_balance,bonus_credit_balance from agentech_accounts where email=$1',[account])).rows,
    [{paid_credit_balance:0,bonus_credit_balance:500}]);
  assert.equal(await scalar('select count(*)::int v from agentech_master_booking_start_grants'),0);
  const params = [account,booked.id,booked.code_submission_id,start,end];
  const stage = (...args) => scalar('select agentech_get_booked_body_asset($1,$2,$3,$4,$5) v',args);
  const reconcile = (...args) => scalar('select agentech_reconcile_unlaunched_body_booking($1,$2,$3,$4,$5,$6,$7) v',args);
  const claim = (...args) => scalar('select agentech_claim_validated_body_booking($1,$2,$3,$4,$5,$6) v',args);
  const attempt = randomUUID();
  assert.equal(await stage('other@example.test',...params.slice(1)),null);
  assert.equal(await stage(...params.slice(0,4),start),null);
  assert.equal(await stage(account,booked.id,'master-body-v2-'+randomUUID(),start,end),null);
  assert.deepEqual((await stage(...params)).content_manifest,manifest);
  assert.equal(await claim(...params,attempt),false);
  const activeStart = new Date(Date.now()-1000).toISOString();
  await db.query('update agentech_robot_sessions set scheduled_start=$1 where id=$2',[activeStart,booked.id]);
  assert.equal(await claim(...params,attempt),false);
  params[3] = activeStart;
  assert.equal(await claim(...params,null),false);
  assert.equal(await claim(...params,attempt),true);
  assert.equal(await claim(...params,randomUUID()),false);
  assert.equal(await stage(...params),null);
  assert.equal(await scalar('select body_attempt_id v from agentech_robot_sessions where id=$1',[booked.id]),attempt);
  assert.equal(await scalar('select body_start_authority v from agentech_robot_sessions where id=$1',[booked.id]),'signed_booking');
  assert.equal(await scalar('select count(*)::int v from agentech_body_operator_ready'),0);
  const message = 'Program did not start. 0 commands dispatched. Unconfirmed claim.';
  assert.equal(await reconcile(...params,randomUUID(),message),false);
  assert.equal(await reconcile('other@example.test',...params.slice(1),attempt,message),false);
  assert.equal(await reconcile(...params,attempt,message),true);
  assert.equal(await reconcile(...params,attempt,message),true);
  assert.equal(await scalar('select session_status v from agentech_robot_sessions where id=$1',[booked.id]),'failed');
  assert.equal(await claim(...params,randomUUID()),false);

  // A pre-migration v1 reservation can still run, including on a profile without an old account grant.
  const dance = JSON.parse(readFileSync(new URL('./master-happy-dance.json',import.meta.url),'utf8'));
  const legacyAsset = randomUUID(), legacyPin = 'master-body-'+legacyAsset;
  await db.query(`insert into agentech_account_asset_submissions
    (id,email,object_key,file_name,robot_model,asset_kind,byte_size,sha256)
    values($1,$2,$3,'dance.zip','Master','Package',5164116,$4)`,[legacyAsset,account,'private/'+legacyAsset,dance.zip]);
  await db.query(`insert into agentech_code_submissions(id,email,developer_name,robot_model,run_mode,source,code,
    ai_security_model,physical_safety_status,ai_security_status)
    values($1,$2,$2,'Master',$3,'uploaded_file',$4,$3,'passed','passed')`,[legacyPin,account,dance.mode,dance.source]);
  const legacy = await scalar(`insert into agentech_robot_sessions(email,session_title,robot_model,approved_run_type,
    code_submission_id,session_status,scheduled_start,scheduled_end)
    values($1,'legacy','Master','custom_code',$2,'requested',$3,$4) returning id v`,[account,legacyPin,activeStart,end]);
  const auto = () => scalar('select body_booking_starts_automatically(s) v from agentech_robot_sessions s where id=$1',[legacy]);
  const claimLegacy = (owner,confirmed) => scalar('select agentech_claim_body_booking($1,$2,$3,$4,$5,$6) v',
    [owner,legacy,legacyAsset,activeStart,end,confirmed]);
  assert.equal(await auto(),true);
  await db.query("update agentech_code_submissions set code='other' where id=$1",[legacyPin]);
  assert.equal(await auto(),false);
  assert.equal(await claimLegacy(account,null),false);
  await db.query('update agentech_code_submissions set code=$1 where id=$2',[dance.source,legacyPin]);
  assert.equal(await claimLegacy('other@example.test',null),false);
  assert.equal(await claimLegacy(account,activeStart),false);
  assert.equal(await claimLegacy(account,null),true);
  assert.equal(await claimLegacy(account,null),false);
  assert.equal(await scalar('select count(*)::int v from agentech_body_operator_ready'),0);
  await assert.rejects(db.query('select agentech_confirm_body_operator($1,$2)',[account,legacy]),/permission denied/);
  await assert.rejects(db.query('delete from agentech_body_operator_ready'),/permission denied/);
  // Two additional v1 bookings exercise the current bridge's attempt-bound claim, including a crash before the write.
  const seedLegacy = () => scalar(`insert into agentech_robot_sessions(email,session_title,robot_model,approved_run_type,
    code_submission_id,session_status,scheduled_start,scheduled_end)
    values($1,'legacy','Master','custom_code',$2,'requested',$3,$4) returning id v`,[account,legacyPin,activeStart,end]);
  const legacyParams = [account,await seedLegacy(),legacyPin,activeStart,end];
  const legacyAttempt = randomUUID();
  assert.equal(await claim(...legacyParams,legacyAttempt),true);
  assert.equal(await reconcile(...legacyParams,randomUUID(),message),false);
  assert.equal(await reconcile(...legacyParams,legacyAttempt,message),true);
  legacyParams[1] = await seedLegacy();
  assert.equal(await reconcile(...legacyParams,randomUUID(),message),true);
  assert.equal(await claim(...legacyParams,randomUUID()),false);
  assert.equal(await scalar('select body_attempt_id v from agentech_robot_sessions where id=$1',[legacyParams[1]]),null);
  for (const role of ['anon','authenticated']) {
    await db.exec('reset role; set role '+role);
    await assert.rejects(stage(...params),/permission denied/);
    await assert.rejects(claim(...params,attempt),/permission denied/);
    await assert.rejects(reserve(),/permission denied/);
    await assert.rejects(reconcile(...params,attempt,message),/permission denied/);
  }
});
