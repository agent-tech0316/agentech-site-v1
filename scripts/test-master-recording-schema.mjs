// Isolated PostgreSQL execution. No credentials, cloud connection or robot I/O.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
process.on('uncaughtException', error => { console.error(error.message, error.where ?? ''); process.exit(1); });
const { PGlite } = await import(process.env.MASTER_RECORDING_PGLITE_MODULE
  ? pathToFileURL(process.env.MASTER_RECORDING_PGLITE_MODULE).href : '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema storage;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table public.agentech_account_profiles(id bigint primary key,account_email text,username text);
  create table public.agentech_robot_sessions(id bigint primary key,email text,access_profile_id bigint,
    profile_username text,robot_model text,scheduled_start timestamptz,scheduled_end timestamptz,session_status text);
  grant usage on schema public to service_role;
  grant select on public.agentech_account_profiles,public.agentech_robot_sessions to service_role;
  grant update on public.agentech_robot_sessions to service_role;
  insert into public.agentech_account_profiles values(45,'owner@example.com','original-user');
  insert into public.agentech_robot_sessions values(123,'owner@example.com',45,'spoofed-label','Master',
    now()-interval '1 minute',now()+interval '10 minutes','running');
`);
await db.exec(await readFile(new URL('../supabase/migrations/20261015000219_master_session_recordings.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/migrations/20261015010735_exclude_master_live_test_recordings.sql',import.meta.url),'utf8'));
const recorder='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
async function claim(id=123,who=recorder) {
  return (await db.query('select * from public.agentech_claim_master_recording($1,$2)',[id,who])).rows;
}
// Live tests reuse a negative reservation ID; recording it would prevent the
// website from deleting that reservation before the next test. Zero is invalid too.
await db.exec("update public.agentech_robot_sessions set session_status='cancelled' where id=123");
for (const sessionId of [-4_175_000_001, 0]) {
  await db.query(`insert into public.agentech_robot_sessions
    select $1,email,access_profile_id,profile_username,robot_model,scheduled_start,scheduled_end,'running'
    from public.agentech_robot_sessions where id=123`, [sessionId]);
  await db.exec('set role service_role');
  assert.deepEqual((await db.query('select * from public.agentech_master_recording_candidates()')).rows, [],
    `nonpositive session ${sessionId} must not be a recording candidate`);
  assert.equal((await claim(sessionId)).length, 0,
    `direct claims must reject nonpositive session ${sessionId}`);
  assert.equal((await db.query('select * from public.agentech_master_session_recordings where session_id=$1', [sessionId])).rows.length, 0,
    'rejected claims must not persist a recording row');
  await db.exec('reset role');
  assert.equal((await db.query('delete from public.agentech_robot_sessions where id=$1 returning id', [sessionId])).rows.length, 1,
    'the website must remain able to delete and reuse its live-test reservation');
}
await db.exec("update public.agentech_robot_sessions set session_status='running' where id=123");
await db.exec('set role service_role');
assert.deepEqual((await db.query('select * from public.agentech_master_recording_candidates()')).rows, [{session_id:123}],
  'normal positive-ID Master bookings must remain eligible');
let rows=await claim();
assert.equal(rows.length,1);
assert.equal(rows[0].account_email,'owner@example.com');
assert.equal(rows[0].profile_username,'original-user');
const recordingId=rows[0].recording_id;
assert.equal((await claim())[0].recording_id,recordingId);
assert.equal((await claim(123,other)).length,0,'another collector cannot steal an active lease');
await assert.rejects(()=>db.exec(`update public.agentech_master_session_recordings set profile_id=46 where session_id=123`),/immutable/);
await db.exec(`update public.agentech_master_session_recordings set capture_status='partial' where session_id=123`);
assert.equal((await claim())[0].recording_id,recordingId,'interrupted captures resume the same record');
await db.exec('reset role');
await db.exec(`insert into public.agentech_robot_sessions select 124,email,access_profile_id,profile_username,robot_model,scheduled_start,scheduled_end,session_status from public.agentech_robot_sessions where id=123`);
assert.equal((await claim()).length,0,'overlapping Master reservations cannot mix users');
await db.exec(`delete from public.agentech_robot_sessions where id=124; update public.agentech_robot_sessions set email='other@example.com' where id=123`);
assert.equal((await claim()).length,0,'parent reassignment cannot transfer a recording');
await db.exec(`update public.agentech_robot_sessions set email='owner@example.com' where id=123;
  update public.agentech_master_session_recordings set storage_status='deleted' where session_id=123`);
assert.equal((await claim()).length,0,'operator tombstone prevents automatic resurrection');
assert.equal((await db.query('select * from public.agentech_master_recording_candidates()')).rows.length,0);
for (const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(()=>db.query('select * from public.agentech_master_session_recordings'),/permission denied/);
  await assert.rejects(()=>db.query('select * from public.agentech_master_recording_candidates()'),/permission denied/);
  await assert.rejects(()=>claim(),/permission denied/);
  await db.exec('reset role');
}
assert.equal((await db.query(`select public from storage.buckets where id='master-session-recordings'`)).rows[0].public,false);
await db.close();
console.log('PASS: migration execution, nonpositive session exclusion, live-test reservation reuse, trusted claims, immutable ownership, renewal, restart, overlap, deletion tombstone, anonymous/authenticated denial, private bucket.');
