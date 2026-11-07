import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {registerHooks} from "node:module";
registerHooks({resolve(s,c,next){
  if(s==="next/headers") return {url:"data:text/javascript,export async function cookies(){return {get(){}}}",shortCircuit:true};
  if(s==="next/server") return next("next/server.js",c);
  if(s.startsWith("@/")) return next(new URL("../"+s.slice(2)+".ts",import.meta.url).href,c);
  try{return next(s,c)}catch(e){if(s.startsWith(".")&&!/\.[a-z]+$/.test(s))return next(s+".ts",c);throw e}
},load(u,c,n){return n(u,u.endsWith(".json")?{...c,importAttributes:{type:"json"}}:c)}});
const {NextRequest}=await import("next/server"), code=await import("../app/api/agentech-code-submit/route.ts");
const assets=await import("../app/api/eaic-account-assets/route.ts");
const {assetDisplayName,assetPrefix,newAssetName,recordAsset}=await import("../lib/eaic-review-exemption.ts");
const {readAssetManifest,saveAssetManifest}=await import("../lib/eaic-asset-manifests.ts");
const {createSignedAccountSession}=await import("../lib/server-account-session.ts");
const exempt="operator@example.test", regular="student@example.test";
function metadataRequest(url,init,objects){
  const u=new URL(url);
  if(!u.pathname.includes("/manifests/v1/")) return null;
  assert.ok(u.pathname.includes("/eaic-account-assets/"+assetPrefix(exempt)+"/manifests/v1/"));
  const name=u.pathname.replace("/object/authenticated/","/object/");
  if(init.method==="POST"){
    assert.equal(init.headers["x-upsert"],"false");
    if(objects.has(name)) return new Response(null,{status:409});
    objects.set(name,JSON.parse(init.body));return new Response(null,{status:200});
  }
  return objects.has(name)?Response.json(objects.get(name)):new Response(null,{status:404});
}
function request(email, body){
  return new NextRequest("https://site.invalid/api/test",{method:"POST",headers:{authorization:"Bearer "+createSignedAccountSession(email),"content-type":"application/json"},body:JSON.stringify(body)});
}
test("only a server-granted account saves the exact program without either review or billing",async t=>{
  process.env.NODE_ENV="production";process.env.AGENTECH_SESSION_SECRET="regression-test-only";
  process.env.SUPABASE_URL="https://exemption-test.invalid";process.env.SUPABASE_SERVICE_ROLE_KEY="test";
  const writes=[];
  t.mock.method(globalThis,"fetch",async(url,init)=>{
    const u=new URL(url);assert.equal(u.hostname,"exemption-test.invalid");
    if(u.pathname.endsWith("/agentech_code_review_exemptions")) return Response.json(u.searchParams.get("email")==="eq."+exempt?[{email:exempt}]:[]);
    assert.ok(u.pathname.endsWith("/rpc/agentech_save_exempt_submission"));writes.push(JSON.parse(init.body));return Response.json("saved-program");
  });
  const program="  # private program\ncustom_entry()\n";
  const body={robotModel:"Master",code:program,reviewStage:"account_exempt",email:exempt,fullReviewExempt:true};
  assert.equal((await code.POST(request(regular,body))).status,403);
  const allowed=await code.POST(request(exempt,body));
  assert.equal(allowed.status,200);const result=await allowed.json();
  assert.equal(result.physicalSafetyStatus,"passed");assert.equal(result.aiSecurityStatus,"passed");assert.equal(result.creditsCharged,0);
  assert.equal(result.approvalBasis,"account-certification-exemption");
  assert.equal(writes.length,1);assert.equal(writes[0].p_code,program);assert.equal(writes[0].p_email,exempt);
});
test("private asset links always bind to the signed account, including standalone motion and audio",async t=>{
  process.env.SUPABASE_URL="https://exemption-test.invalid";process.env.SUPABASE_SERVICE_ROLE_KEY="test";process.env.AGENTECH_SESSION_SECRET="regression-test-only";
  const signed=[];
  t.mock.method(globalThis,"fetch",async(url)=>{
    const u=new URL(url);
    if(u.pathname.endsWith("/agentech_code_review_exemptions"))return Response.json(u.searchParams.get("email")==="eq."+exempt?[{email:exempt}]:[]);
    assert.ok(u.pathname.startsWith("/storage/v1/object/upload/sign/eaic-account-assets/"+assetPrefix(exempt)+"/"));
    signed.push(u.pathname);return Response.json({url:u.pathname.slice("/storage/v1".length)+"?token=example"});
  });
  assert.equal((await assets.POST(request(regular,{action:"upload",name:"voice.wav",email:exempt}))).status,403);
  for(const [file,kind] of [["bundle.zip","Package"],["动作.ONNX","Motion"],["voice.wav","Audio"]]){
    const res=await assets.POST(request(exempt,{action:"upload",name:file,robotModel:"Master",prefix:assetPrefix(regular)}));
    assert.equal(res.status,200);const out=await res.json();assert.equal(out.kind,kind);assert.equal(assetDisplayName(out.key),file);
  }
  assert.equal(signed.length,3);assert.equal(newAssetName("file.exe"),null);
});
test("the exemption workbench offers a single code save and standalone binary uploads",()=>{
  const ui=readFileSync(new URL("../features/eaic/01-clients/eaic-hub/components/exempt-submission-workbench.tsx",import.meta.url),"utf8");
  assert.match(ui,/Save program for scheduling/);assert.match(ui,/\.zip,\.onnx,\.wav/);
  assert.doesNotMatch(ui,/runSoftwareCheck|runPhysicalSafetyCheck|evaluateAgentechMovementSafety/);
});

test("a binary submission records the received bytes and exact robot; a filename alone cannot identify Happy Dance",async t=>{
  process.env.SUPABASE_URL="https://exemption-test.invalid";process.env.SUPABASE_SERVICE_ROLE_KEY="test";
  let row;
  const records=new Map(), metadata=new Map();
  t.mock.method(globalThis,"fetch",async(url,init)=>{
    const storage=metadataRequest(url,init,metadata);if(storage)return storage;
    assert.equal(new URL(url).pathname,"/rest/v1/agentech_account_asset_submissions");
    assert.ok(!new URL(url).searchParams.get("select")?.includes("content_manifest"));
    if (init.method==="POST") {row=JSON.parse(init.body);assert.equal(Object.hasOwn(row,"content_manifest"),false);records.set(row.id,row);return new Response(null,{status:204});}
    const id=new URL(url).searchParams.get("id").slice(4,-1);
    return Response.json(records.has(id)?[records.get(id)]:[]);
  });
  const key=newAssetName("ultra_example_kuaile.wav","Master");
  const audio=Buffer.alloc(48);
  audio.write("RIFF");audio.writeUInt32LE(40,4);audio.write("WAVEfmt ",8);audio.writeUInt32LE(16,16);
  audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);audio.writeUInt32LE(16000,24);audio.writeUInt32LE(32000,28);
  audio.writeUInt16LE(2,32);audio.writeUInt16LE(16,34);audio.write("data",36);audio.writeUInt32LE(4,40);
  const first=await recordAsset(exempt,key,new Response(audio));
  assert.equal(first.native_motion_name,null);assert.equal(first.byte_size,audio.length);
  assert.equal(first.sha256,createHash("sha256").update(audio).digest("hex"));
  assert.equal(first.content_manifest.playback.mode,"audio_only");
  assert.equal(row.robot_model,"Master");assert.equal(row.file_name,"ultra_example_kuaile.wav");
  if(process.env.EAIC_HAPPY_DANCE_FIXTURE){
    const genuine=await recordAsset(exempt,newAssetName("renamed-dance.zip","Master"),new Response(readFileSync(process.env.EAIC_HAPPY_DANCE_FIXTURE)));
    assert.equal(genuine.byte_size,5164116);
    assert.equal(genuine.native_motion_name,"linkcraft_resource_onnx_ffkuaile_0.0.1");
    assert.equal(genuine.content_manifest.movement.path,"policy.onnx");
    assert.equal(genuine.content_manifest.audio.path,"audio.wav");
    assert.equal(genuine.content_manifest.playback.mode,"movement_with_audio");
    await assert.rejects(()=>recordAsset(exempt,newAssetName("dance.zip","Navi"),new Response(readFileSync(process.env.EAIC_HAPPY_DANCE_FIXTURE))),/Master Ultra/);
  }
});

test("invalid package content returns 400 and never creates an approval receipt",async t=>{
  process.env.SUPABASE_URL="https://exemption-test.invalid";process.env.SUPABASE_SERVICE_ROLE_KEY="test";
  process.env.AGENTECH_SESSION_SECRET="regression-test-only";
  t.mock.method(globalThis,"fetch",async(url,init)=>{
    const u=new URL(url);
    if(u.pathname.endsWith("/agentech_code_review_exemptions"))return Response.json([{email:exempt}]);
    if(u.pathname.endsWith("/agentech_account_asset_submissions") && init.method==="GET")return Response.json([]);
    if(u.pathname.includes("/object/authenticated/"))return new Response("this is not a ZIP");
    assert.fail("No write or other network request is allowed for invalid content");
  });
  const key=newAssetName("fake.zip","Master");
  const denied=await assets.POST(new NextRequest("https://site.invalid/api/test",{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"submit",key})}));
  assert.equal(denied.status,401);
  const response=await assets.POST(request(exempt,{action:"submit",key}));
  assert.equal(response.status,400);
  assert.match((await response.json()).error,/ZIP/i);
});

test("legacy receipts gain private metadata without a database migration or approval changes",{skip:!process.env.EAIC_HAPPY_DANCE_FIXTURE},async t=>{
  process.env.SUPABASE_URL="https://exemption-test.invalid";process.env.SUPABASE_SERVICE_ROLE_KEY="test";
  const key=newAssetName("renamed.zip","Master"), id=key.slice(0,36);
  const data=readFileSync(process.env.EAIC_HAPPY_DANCE_FIXTURE);
  const row={id,sha256:createHash("sha256").update(data).digest("hex"),native_motion_name:null};
  const metadata=new Map();
  t.mock.method(globalThis,"fetch",async(url,init)=>{
    const u=new URL(url);
    const storage=metadataRequest(url,init,metadata);if(storage)return storage;
    assert.equal(init.method,"GET");
    assert.equal(u.searchParams.get("email"),"eq."+exempt);
    assert.ok(!u.searchParams.get("select").includes("content_manifest"));
    return Response.json([row]);
  });
  const receipt=await recordAsset(exempt,key,new Response(data));
  assert.equal(metadata.size,1);
  assert.equal(receipt.content_manifest.playback.audioPath,"audio.wav");
  assert.equal(receipt.native_motion_name,"linkcraft_resource_onnx_ffkuaile_0.0.1");
  assert.equal(row.native_motion_name,null);
  row.sha256="a".repeat(64);
  await assert.rejects(()=>recordAsset(exempt,key,new Response(data)),/differ from the saved submission/);
  assert.equal(metadata.size,1);
});

test("private metadata is bound to owner, receipt and archive hash and is immutable",async t=>{
  process.env.SUPABASE_URL="https://exemption-test.invalid";process.env.SUPABASE_SERVICE_ROLE_KEY="test";
  const id="11111111-1111-4111-8111-111111111111", sha="a".repeat(64);
  const saved={assetId:id,archiveSha256:sha,content_manifest:{version:1,playback:{mode:"movement_only"}},native_motion_name:null};
  const metadata=new Map();
  t.mock.method(globalThis,"fetch",async(url,init)=>metadataRequest(url,init,metadata));
  await saveAssetManifest(assetPrefix(exempt),saved);
  await saveAssetManifest(assetPrefix(exempt),saved);
  assert.equal(metadata.size,1);
  assert.equal((await readAssetManifest(assetPrefix(exempt),id,sha)).archiveSha256,sha);
  await assert.rejects(()=>saveAssetManifest(assetPrefix(exempt),{...saved,native_motion_name:"changed"}),/Could not save/);
  const stored=[...metadata.values()][0];stored.archiveSha256="b".repeat(64);
  await assert.rejects(()=>readAssetManifest(assetPrefix(exempt),id,sha),/does not match/);
});

test("missing legacy metadata accepts Storage's structured 404; other failures remain errors",async t=>{
  process.env.SUPABASE_URL="https://exemption-test.invalid";process.env.SUPABASE_SERVICE_ROLE_KEY="test";
  const id="11111111-1111-4111-8111-111111111111", sha="a".repeat(64);
  const fetch=t.mock.method(globalThis,"fetch",async()=>Response.json({statusCode:"404"},{status:400}));
  assert.equal(await readAssetManifest(assetPrefix(exempt),id,sha),null);
  fetch.mock.mockImplementation(async()=>new Response(null,{status:503}));
  await assert.rejects(()=>readAssetManifest(assetPrefix(exempt),id,sha),/Could not read/);
});
