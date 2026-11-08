import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const sql = name => readFileSync(new URL('../supabase/migrations/'+name+'.sql',import.meta.url),'utf8');
const dance = JSON.parse(readFileSync(new URL('./master-happy-dance.json',import.meta.url),'utf8'));

test('Victoria and the existing granted developer can each start their own pinned dance exactly once without check-in', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table agentech_accounts(email text primary key);
    create table agentech_account_profiles(id bigint primary key,account_email text,profile_type text,username text);
    create table agentech_code_submissions(id text primary key,email text,code text,ai_security_model text,run_mode text,
      physical_safety_status text,ai_security_status text);
    create table agentech_robot_sessions(id bigint primary key,email text,access_profile_id bigint,robot_model text,
      approved_run_type text,code_submission_id text,session_status text,scheduled_start timestamptz,scheduled_end timestamptz);
  `);
  for (const name of ['20261107212500_eaic_account_review_exemptions','20261107213459_eaic_account_asset_submissions',
    '20261107225233_master_happy_dance_booking','20261107231637_match_legacy_happy_dance_receipt',
    '20261107235800_master_signed_booking_start']) await db.exec(sql(name));
  for (const [id,owner,username] of [[11,'privileged@example.test','existing'],[12,'other@example.test','other'],
    [13,'victoria_c@agent-tech.ai','victoria']]) {
    const asset = '10000000-0000-4000-8000-0000000000'+id;
    await db.query('insert into agentech_accounts(email) values ($1)',[owner]);
    await db.query("insert into agentech_account_profiles values ($1,$2,'developer',$3)",[id,owner,username]);
    await db.query('insert into agentech_code_review_exemptions(email) values ($1)',[owner]);
    await db.query(`insert into agentech_account_asset_submissions
      (id,email,object_key,file_name,robot_model,asset_kind,byte_size,sha256,native_motion_name)
      values ($1,$2,$3,'happy.zip','Master','Package',5164116,$4,$5)`,[asset,owner,asset,dance.zip,dance.motion]);
    await db.query(`insert into agentech_code_submissions values ($1,$2,$3,$4,$4,'passed','passed')`,
      ['master-body-'+asset,owner,dance.source,dance.mode]);
    await db.query(`insert into agentech_robot_sessions(id,email,access_profile_id,robot_model,approved_run_type,code_submission_id,
      session_status,scheduled_start,scheduled_end) values ($1,$2,$1,'Master','custom_code',$3,'requested',now()-interval '30 seconds',now()+interval '5 minutes')`,
      [id,owner,'master-body-'+asset]);
  }
  await db.exec("insert into agentech_master_booking_start_grants values (11,'privileged@example.test')");
  await db.exec("insert into agentech_account_profiles values (14,'victoria_c@agent-tech.ai','developer','other-profile')");
  const grantVictoria = sql('20261108022116_victoria_master_happy_dance_signed_start');
  await db.exec(grantVictoria);
  await db.exec(grantVictoria);
  assert.deepEqual((await db.query('select profile_id::int as id from agentech_master_booking_start_grants order by id')).rows,
    [{id:11},{id:13}]);
  const claim = async (id, operator=false) => (await db.query(`select agentech_claim_body_booking(s.email,s.id,
    substr(s.code_submission_id,13)::uuid,s.scheduled_start,s.scheduled_end,
    ${operator ? '(select confirmed_at from agentech_body_operator_ready where session_id=s.id)' : 'null'}) as ok
    from agentech_robot_sessions s where s.id=$1`,[id])).rows[0].ok;
  assert.deepEqual((await db.query('select body_booking_starts_automatically(s) as auto from agentech_robot_sessions s order by id')).rows,
    [{auto:true},{auto:false},{auto:true}]);
  assert.equal(await claim(13),true);
  assert.equal(await claim(13),false);
  assert.equal(await claim(12),false);
  assert.equal(await claim(11),true);
  assert.equal(await claim(11),false);
  assert.equal((await db.query('select count(*)::int as n from agentech_body_operator_ready')).rows[0].n,0);
  await db.query("select agentech_confirm_body_operator('other@example.test',12)");
  assert.equal(await claim(12,true),true);
  assert.deepEqual((await db.query('select body_start_authority as basis from agentech_robot_sessions order by id')).rows,
    [{basis:'signed_booking'},{basis:'onsite_check_in'},{basis:'signed_booking'}]);
  await db.exec("update agentech_robot_sessions set session_status='requested',access_profile_id=12 where id=11");
  assert.equal(await claim(11),false);
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from agentech_master_booking_start_grants'));
});
