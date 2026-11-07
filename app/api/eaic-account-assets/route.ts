import { NextRequest, NextResponse } from "next/server";
import { assetBucket, assetDisplayName, assetKeyPattern, assetKind, assetPrefix, assetReceipts, hasFullReviewExemption, newAssetName, recordAsset } from "@/lib/eaic-review-exemption";
import { normalizeAgentechRobotModel } from "@/lib/agentech-robot-model";
import { getServerAccountEmail } from "@/lib/server-account-session";

export const maxDuration = 300;

async function account(request: NextRequest) {
  const email = await getServerAccountEmail(request, { requireSignedSession: true });
  if (!email) return NextResponse.json({error:"Sign in to access uploads."},{status:401});
  if (!await hasFullReviewExemption(email)) return NextResponse.json({error:"Account exemption required."},{status:403});
  return email;
}

function storageBase() {
  return process.env.SUPABASE_URL!.replace(/\/$/,"").replace(/\/rest\/v1$/,"") + "/storage/v1";
}

async function storage(path: string, body: object) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const response = await fetch(storageBase() + path, {method:"POST", cache:"no-store",
    headers:{apikey:key, authorization:`Bearer ${key}`, "content-type":"application/json"},
    body:JSON.stringify(body), signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error("Could not access file storage.");
  return response.json();
}

export async function GET(request: NextRequest) {
  try {
    const email = await account(request);
    if (typeof email !== "string") return email;
    const prefix=assetPrefix(email);
    const offset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) return NextResponse.json({error:"Invalid page."},{status:400});
    const rows: {name:string;metadata:{size?:number}|null}[] = await storage(`/object/list/${assetBucket}`,
      {prefix:prefix+"/",limit:51,offset,sortBy:{column:"created_at",order:"desc"}});
    const files=rows.slice(0,50).filter(row=>assetKeyPattern.test(row.name));
    const receipts=await assetReceipts(email,files.map(row=>row.name.slice(0,36)));
    return NextResponse.json({files:files.map(row=>({
      key:row.name,name:assetDisplayName(row.name),kind:assetKind(row.name),bytes:row.metadata?.size,
      receipt:receipts.find(r=>r.id===row.name.slice(0,36))??null
    })),nextOffset:rows.length>50 ? offset+50 : null});
  } catch {
    return NextResponse.json({error:"Could not load your files."},{status:503});
  }
}

export async function POST(request: NextRequest) {
  try {
    const email = await account(request);
    if (typeof email !== "string") return email;
    const prefix=assetPrefix(email);
    const body = await request.json();
    if (body.action === "submit" && typeof body.key === "string" && assetKeyPattern.test(body.key)) {
      const [prior]=await assetReceipts(email,[body.key.slice(0,36)]);
      if (prior) return NextResponse.json({receipt:prior});
      const auth=process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const stored=await fetch(storageBase()+`/object/authenticated/${assetBucket}/${prefix}/${encodeURIComponent(body.key)}`,{
        headers:{apikey:auth,authorization:`Bearer ${auth}`},cache:"no-store",signal:AbortSignal.timeout(260000)});
      return NextResponse.json({receipt:await recordAsset(email,body.key,stored)});
    }
    if (body.action === "download" && typeof body.key === "string" && assetKeyPattern.test(body.key)) {
      const path = `${assetBucket}/${prefix}/${encodeURIComponent(body.key)}`;
      const {signedURL} = await storage("/object/sign/"+path,{expiresIn:120});
      const download = new URL(storageBase()+signedURL);
      download.searchParams.set("download",assetDisplayName(body.key));
      return NextResponse.json({url:download.href});
    }
    const model=normalizeAgentechRobotModel(body.robotModel);
    const key = body.action === "upload" && typeof body.name === "string" && model ? newAssetName(body.name,model) : null;
    if (!key) return NextResponse.json({error:"Choose a .zip package, .onnx motion, or .wav audio file."},{status:400});
    const {url} = await storage(`/object/upload/sign/${assetBucket}/${prefix}/${encodeURIComponent(key)}`,{});
    return NextResponse.json({url:storageBase()+url,key,kind:assetKind(key)});
  } catch {
    return NextResponse.json({error:"Could not prepare your file transfer."},{status:503});
  }
}
