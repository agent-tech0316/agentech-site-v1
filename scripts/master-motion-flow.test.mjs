import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import AdmZip from "adm-zip";
import { policy } from "./fixtures/master-policy-fixture.mjs";
import { stageBookedMotion } from "./robot-stream-staging.mjs";
import { createBodyPlan } from "./master-native-body.mjs";
import { createGatewayCloudRequest } from "./robot-cloud-request.mjs";

// Supply an empty Next request cookie context. The real route verifies its
// signed bearer, reads the receipt and applies the ordinary account rules.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "next/headers") return {url:"data:text/javascript,export async function cookies(){return new Map()}",shortCircuit:true};
    if (specifier === "next/server") return next("next/server.js",context);
    if (specifier.startsWith("@/")) return next(new URL("../"+specifier.slice(2)+".ts",import.meta.url).href,context);
    try { return next(specifier,context); }
    catch (error) {
      if (specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier)) return next(specifier+".ts",context);
      throw error;
    }
  },
  load(url,context,next) {
    return next(url,url.endsWith(".json") ? {...context,importAttributes:{type:"json"}} : context);
  },
});
const { NextRequest } = await import("next/server");
const { createSignedAccountSession } = await import("../lib/server-account-session.ts");
const assets = await import("../app/api/eaic-account-assets/route.ts");
const slots = await import("../app/api/robot-slot/route.ts");

const origin = "https://offline.invalid";
const serviceKey = "local-test-service-key";
const account = "ordinary-motion-owner@example.test";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

async function schema(db) {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  const sql = readFileSync(new URL("../supabase-schema.sql",import.meta.url),"utf8");
  await db.exec(sql.split("insert into storage.buckets")[0]);
  await db.exec("grant all on all tables in schema public to service_role; grant usage on all sequences in schema public to service_role;");
  const dir = new URL("../supabase/migrations/",import.meta.url);
  for (const name of readdirSync(dir).filter(f=>f >= "20261107" && f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(name,dir),"utf8"));
  }
  await db.query("insert into agentech_accounts(email,password_hash,salt,paid_credit_balance) values($1,'fixture','fixture',500)",[account]);
  await db.exec("set role service_role");
}

function fixture() {
  const model = policy({shoulderAction:.5,phaseFrames:30,frames:"30"});
  // 0.6 seconds of mono 16 kHz PCM with a deterministic audible test tone.
  const samples = 9600, wav = Buffer.alloc(44+samples*2);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length-8,4); wav.write("WAVEfmt ",8); wav.writeUInt32LE(16,16);
  wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(16000,24); wav.writeUInt32LE(32000,28);
  wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write("data",36); wav.writeUInt32LE(samples*2,40);
  for (let i=0;i<samples;i++) wav.writeInt16LE((i % 80 < 40 ? 1 : -1)*1024,44+2*i);
  const zip = new AdmZip();
  for (const [name,bytes] of [["routine/shoulder.onnx",model],["music/tone.wav",wav]]) {
    zip.addFile(name,bytes);
    zip.getEntry(name).header.time = new Date(2025,0,1,12,0,0);
  }
  return {zip:zip.toBuffer(), model, wav};
}

// Emulate the storage and PostgREST wire protocols only. All RPCs, queries,
// constraints, role permissions and state transitions execute in PostgreSQL.
function localTransport(db) {
  const signedUploads = new Map(), objects = new Map();
  return async (target, init={}) => {
    const url = new URL(target);
    assert.equal(url.origin,origin);
    const path = url.pathname;
    if (init.method === "PUT") {
      const key = signedUploads.get(url.searchParams.get("token"));
      assert.ok(key && path === "/storage/v1/object/upload/sign/"+key);
      assert.equal(objects.has(key),false);
      objects.set(key,Buffer.from(init.body));
      return new Response(null,{status:200});
    }
    assert.equal(new Headers(init.headers).get("apikey"),serviceKey);
    if (path.startsWith("/storage/v1/object/upload/sign/")) {
      const token = randomUUID();
      signedUploads.set(token,path.slice("/storage/v1/object/upload/sign/".length));
      return Response.json({url:path.slice("/storage/v1".length)+"?token="+token});
    }
    if (path.startsWith("/storage/v1/object/authenticated/")) {
      const key = path.slice("/storage/v1/object/authenticated/".length);
      return objects.has(key) ? new Response(objects.get(key)) : new Response(null,{status:404});
    }
    const table = path.slice("/rest/v1/".length), query = url.searchParams;
    assert.ok(path.startsWith("/rest/v1/"));
    const body = init.body ? JSON.parse(init.body) : null;
    const identifier = name => {
      assert.match(name,/^[a-z][a-z0-9_]*$/);
      return '"'+name+'"';
    };
    if (table.startsWith("rpc/")) {
      const fn = identifier(table.slice(4));
      const args = Object.keys(body).map((key,i)=>identifier(key)+" => $"+(i+1));
      const {rows} = await db.query("select "+fn+"("+args.join(",")+") as value",Object.values(body));
      return Response.json(rows[0].value);
    }
    assert.ok(["agentech_accounts","agentech_account_asset_submissions"].includes(table));
    if (init.method === "POST") {
      const columns = Object.keys(body).map(identifier).join(",");
      const params = Object.keys(body).map((_,i)=>"$"+(i+1)).join(",");
      assert.equal(query.get("on_conflict"),"id");
      await db.query("insert into "+identifier(table)+"("+columns+") values("+params+") on conflict(id) do nothing",Object.values(body));
      return new Response(null,{status:204});
    }
    const columns = query.get("select").split(",").map(identifier).join(",");
    const clauses = [], params = [];
    for (const [key,value] of query) {
      if (key === "select" || key === "limit") continue;
      const values = value.startsWith("eq.") ? [value.slice(3)] : value.match(/^in\.\(([^()]*)\)$/)?.[1].split(",");
      assert.ok(values?.length);
      const placeholders = values.map(v=>"$"+params.push(v));
      clauses.push(identifier(key)+" in ("+placeholders.join(",")+")");
    }
    assert.ok(clauses.length);
    const {rows} = await db.query("select "+columns+" from "+identifier(table)+" where "+clauses.join(" and "),params);
    return Response.json(rows);
  };
}

test("ordinary signed Master upload flows through booking, staging, and one time-bound claim", async t => {
  Object.assign(process.env,{NODE_ENV:"production",SUPABASE_URL:origin,SUPABASE_SERVICE_ROLE_KEY:serviceKey,
    AGENTECH_SESSION_SECRET:"offline-join-test",AGENTECH_MASTER_EXECUTION_ENABLED:"true",AGENTECH_MASTER_GATEWAY_PROTOCOL:"master-arm-session-v1"});
  delete process.env.RESEND_API_KEY;
  const db = new PGlite();
  t.after(()=>db.close());
  await schema(db);
  t.mock.timers.enable({apis:["Date"],now:Date.UTC(2031,1,4,11,50)});
  const temp = mkdtempSync(join(tmpdir(),"eaic-booked-flow-"));
  t.after(()=>rmSync(temp,{recursive:true,force:true}));
  const transport = localTransport(db);
  t.mock.method(globalThis,"fetch",transport);
  const cloud = createGatewayCloudRequest({baseUrl:origin,apiKey:serviceKey,fetchImpl:transport});
  const bearer = createSignedAccountSession(account);
  async function post(route,body) {
    const response = await route.POST(new NextRequest(origin+"/api/test",{method:"POST",headers:{
      authorization:"Bearer "+bearer,"content-type":"application/json"},body:JSON.stringify(body)}));
    const data = await response.json();
    assert.equal(response.status,200,JSON.stringify(data));
    return data;
  }
  const content = fixture();
  assert.equal(hash(content.model),"b80854509a8a933d3a004b7e88fb7776b7cb7e0f24ba3105a90508a0c7e68b79");
  const {url,key} = await post(assets,{action:"upload",name:"Shoulder with tone.zip",robotModel:"Master"});
  assert.equal((await fetch(url,{method:"PUT",body:content.zip})).status,200);
  const {receipt} = await post(assets,{action:"submit",key});
  const digest = hash(content.zip);
  assert.equal(receipt.sha256,digest);
  assert.equal(receipt.content_manifest.movement.sha256,hash(content.model));
  assert.equal(receipt.content_manifest.audio.sha256,hash(content.wav));
  assert.equal(receipt.approval_basis,"master-policy-contract-v1");

  const start = "2031-02-04T12:00:00.000Z", end = "2031-02-04T12:05:00.000Z";
  const booking = await post(slots,{email:account,nativeAssetId:receipt.id,scheduledStart:start,
    timeZone:"UTC",durationMinutes:5,robotModel:"Master",requestedRunType:"custom_code"});
  const {session} = booking;
  assert.equal(session.session_status,"scheduled");
  assert.equal(session.access_profile_id,null);
  assert.equal(session.body_booking_starts_automatically,true);
  assert.equal(booking.creditsCharged,500);
  const binding = {p_email:account,p_session:session.id,p_submission:session.code_submission_id,p_start:start,p_end:end};
  const rpc = (name,body) => cloud("rpc/"+name,"",{method:"POST",body});
  const asset = await rpc("agentech_get_booked_body_asset",binding);
  assert.equal(asset.sha256,digest);
  assert.equal(asset.object_key,hash(account)+"/"+key);
  const file = await stageBookedMotion(asset,{email:account,runtimeDir:temp,baseUrl:origin,apiKey:serviceKey,fetchImpl:transport});
  assert.deepEqual(readFileSync(file),content.zip);
  const submission = (await db.query("select * from agentech_code_submissions where id=$1",[session.code_submission_id])).rows[0];
  const plan = createBodyPlan(submission,asset);
  assert.equal(plan.native_body_manifest.policy.sha256,hash(content.model));
  assert.equal(plan.native_body_manifest.audio.sha256,hash(content.wav));
  assert.equal(plan.native_body_manifest.frames,30);
  assert.equal(plan.native_body_manifest.asset_sha256,digest);
  const attempt = randomUUID();
  const claim = id => rpc("agentech_claim_validated_body_booking",{...binding,p_attempt:id});
  assert.equal(await claim(attempt),false);
  t.mock.timers.setTime(Date.parse(start)+1000);
  assert.equal(await claim(attempt),true);
  assert.equal(await claim(randomUUID()),false);
  const claimed = (await db.query("select session_status,body_attempt_id,body_start_authority from agentech_robot_sessions where id=$1",[session.id])).rows[0];
  assert.deepEqual(claimed,{session_status:"running",body_attempt_id:attempt,body_start_authority:"signed_booking"});
  const authorities = {agentech_account_profiles:"account_email", agentech_code_review_exemptions:"email",
    agentech_master_booking_start_grants:"account_email", agentech_body_operator_ready:"email"};
  for (const [table,column] of Object.entries(authorities)) {
    const {rows} = await db.query(`select count(*)::int as n from ${table} where ${column}=$1`,[account]);
    assert.equal(rows[0].n,0,table);
  }
  t.diagnostic("package "+digest+"; policy "+hash(content.model)+"; audio "+hash(content.wav));
});

test("account history and profile access reject unsigned or mismatched identities before storage", async () => {
  const routes = await import("../app/api/account/route.ts");
  const {createSignedAccountSession} = await import("../lib/server-account-session.ts");
  process.env.AGENTECH_SESSION_SECRET ||= "local-test-signing-secret";
  const target = "other@example.invalid";
  const token = createSignedAccountSession("owner@example.invalid");
  for (const method of ["GET","POST","PATCH"]) {
    for (const [authorization, status] of [["",401],["Bearer "+token,403]]) {
      const request = new Request("https://example.test/api/account?email="+target, {
        method, headers:{authorization,"content-type":"application/json"},
        ...(method==="GET"?{}:{body:JSON.stringify({email:target})})
      });
      assert.equal((await routes[method](request)).status,status);
    }
  }
});
