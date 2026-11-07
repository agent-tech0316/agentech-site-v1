import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
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
const {createSignedAccountSession}=await import("../lib/server-account-session.ts");
const exempt="operator@example.test", regular="student@example.test";
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
  t.mock.method(globalThis,"fetch",async(url,init)=>{
    assert.equal(new URL(url).pathname,"/rest/v1/agentech_account_asset_submissions");
    if (init.method==="POST") {row=JSON.parse(init.body);return new Response(null,{status:204});}
    return Response.json([row]);
  });
  const key=newAssetName("ultra_example_kuaile.zip","Master");
  const first=await recordAsset(exempt,key,new Response("abc"));
  assert.equal(first.native_motion_name,null);assert.equal(first.byte_size,3);
  assert.equal(first.sha256,"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(row.robot_model,"Master");assert.equal(row.file_name,"ultra_example_kuaile.zip");
  if(process.env.EAIC_HAPPY_DANCE_FIXTURE){
    const genuine=await recordAsset(exempt,key,new Response(readFileSync(process.env.EAIC_HAPPY_DANCE_FIXTURE)));
    assert.equal(genuine.byte_size,5164116);
    assert.equal(genuine.native_motion_name,"linkcraft_resource_onnx_ffkuaile_0.0.1");
  }
});
