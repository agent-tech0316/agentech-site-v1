import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=fs.readFileSync(new URL('../supabase/migrations/20260930213609_desktop_sessions.sql',import.meta.url),'utf8');
let db;
test.before(async()=>{db=new PGlite();await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create table public.agentech_accounts(email text primary key); insert into public.agentech_accounts values ('user@example.com'); grant select on public.agentech_accounts to service_role;`);await db.exec(migration);});
test.after(async()=>{await db?.close();});
const hash='a'.repeat(64);
test('service role creates, verifies, and revokes opaque sessions',async()=>{
 await db.exec('set role service_role');
 await db.query(`select public.desktop_session_create($1,$2,now()+interval '30 days')`,[hash,'user@example.com']);
 const {rows}=await db.query(`select * from public.desktop_session_find($1)`,[hash]);assert.equal(rows[0].email,'user@example.com');
 await db.query('select public.desktop_session_revoke($1)',[hash]);
 assert.equal((await db.query('select * from public.desktop_session_find($1)',[hash])).rows.length,0);
 await db.exec('reset role');
});
for(const role of ['anon','authenticated'])test(`${role} cannot read session table or call any RPC`,async()=>{
 await db.exec(`set role ${role}`);
 for(const q of ["select * from desktop_private.sessions",`select public.desktop_session_find('${hash}')`,`select public.desktop_session_revoke('${hash}')`,`select public.desktop_session_create('${hash}','user@example.com',now()+interval '30 days')`,`select public.desktop_login_attempt('${hash}',5)`,`select public.desktop_session_cleanup()`])await assert.rejects(db.query(q),/permission denied/);
 await db.exec('reset role');
});
test('expired and deleted-account sessions cannot verify',async()=>{
 await db.query(`insert into desktop_private.sessions(token_hash,account_email,expires_at) values ($1,'user@example.com',now()-interval '1 second')`,['b'.repeat(64)]);
 assert.equal((await db.query('select * from public.desktop_session_find($1)',['b'.repeat(64)])).rows.length,0);
 await db.query(`select public.desktop_session_create($1,'user@example.com',now()+interval '30 days')`,['c'.repeat(64)]);
 await db.exec("delete from public.agentech_accounts where email='user@example.com'");
 assert.equal((await db.query('select * from public.desktop_session_find($1)',['c'.repeat(64)])).rows.length,0);
});
test('atomic throttling allows five attempts then rejects the sixth',async()=>{
 for(let i=0;i<5;i++)assert.equal((await db.query('select * from public.desktop_login_attempt($1,5)',['d'.repeat(64)])).rows[0].allowed,true);
 const row=(await db.query('select * from public.desktop_login_attempt($1,5)',['d'.repeat(64)])).rows[0];assert.equal(row.allowed,false);assert.ok(row.retry_after>0);
});

