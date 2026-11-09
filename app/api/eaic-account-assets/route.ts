import { NextRequest, NextResponse } from "next/server";
import { assetBucket, assetDisplayName, assetIdPattern, assetKeyPattern, assetKind, assetPrefix, assetReceipts, existingSubmission, fetchOwnedAsset, hasFullReviewExemption, newAssetName, ownedAssetFile, recordAsset } from "@/lib/eaic-review-exemption";
import { normalizeAgentechRobotModel } from "@/lib/agentech-robot-model";
import { getServerAccountEmail } from "@/lib/server-account-session";
import { AssetContentError } from "@/lib/eaic-asset-content";

export const maxDuration = 300;

async function account(request: NextRequest) {
  const email = await getServerAccountEmail(request, { requireSignedSession: true });
  if (!email) return NextResponse.json({error:"Sign in to access uploads."},{status:401});
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
    const id = request.nextUrl.searchParams.get("id");
    if (id !== null) {
      if (!assetIdPattern.test(id)) return NextResponse.json({error:"Invalid asset ID."},{status:400});
      const file = await ownedAssetFile(email,id);
      if (!file || (file.robotModel !== "Master" && !await hasFullReviewExemption(email))) return NextResponse.json({error:"File not found."},{status:404});
      return NextResponse.json({file:{name:file.name,receipt:file.receipt}});
    }
    const prefix=assetPrefix(email);
    const offset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) return NextResponse.json({error:"Invalid page."},{status:400});
    const rows: {name:string;metadata:{size?:number}|null}[] = await storage(`/object/list/${assetBucket}`,
      {prefix:prefix+"/",limit:51,offset,sortBy:{column:"created_at",order:"desc"}});
    const page = rows.slice(0,50).filter(row=>assetKeyPattern.test(row.name));
    const hasOtherModels = page.some(row => assetKeyPattern.exec(row.name)?.[2] !== "Master");
    const allowOtherModels = hasOtherModels && await hasFullReviewExemption(email);
    const files = page.filter(row => allowOtherModels || assetKeyPattern.exec(row.name)?.[2] === "Master");
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
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({error:"Invalid file request."},{status:400});
    const model = body.action === "upload" ? normalizeAgentechRobotModel(body.robotModel)
      : typeof body.key === "string" && assetKeyPattern.exec(body.key)?.[2];
    if (!model) return NextResponse.json({error:"Choose a robot and valid asset."},{status:400});
    if (model !== "Master" && !await hasFullReviewExemption(email)) {
      return NextResponse.json({error:"Uploads for this robot require an account exemption."},{status:403});
    }
    if (body.action === "submit" && typeof body.key === "string" && assetKeyPattern.test(body.key)) {
      const prior = await existingSubmission(email,body.key);
      if (prior) return NextResponse.json({receipt:prior});
      return NextResponse.json({receipt:await recordAsset(email,body.key,await fetchOwnedAsset(email,body.key))});
    }
    if (body.action === "download" && typeof body.key === "string" && assetKeyPattern.test(body.key)) {
      const path = `${assetBucket}/${prefix}/${encodeURIComponent(body.key)}`;
      const {signedURL} = await storage("/object/sign/"+path,{expiresIn:120});
      const download = new URL(storageBase()+signedURL);
      download.searchParams.set("download",assetDisplayName(body.key));
      return NextResponse.json({url:download.href});
    }
    const uploadModel=normalizeAgentechRobotModel(body.robotModel);
    const key = body.action === "upload" && typeof body.name === "string" && uploadModel ? newAssetName(body.name,uploadModel) : null;
    if (!key) return NextResponse.json({error:"Choose a .zip package, .onnx motion, or .wav audio file."},{status:400});
    if (body.bytes !== undefined && (!Number.isSafeInteger(body.bytes) || body.bytes <= 0 || body.bytes > 64*1024*1024)) {
      return NextResponse.json({error:"Files must be between 1 byte and 64 MiB."},{status:400});
    }
    const {url} = await storage(`/object/upload/sign/${assetBucket}/${prefix}/${encodeURIComponent(key)}`,{});
    return NextResponse.json({url:storageBase()+url,key,kind:assetKind(key)});
  } catch (error) {
    if (error instanceof AssetContentError) return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({error:"Could not prepare your file transfer."},{status:503});
  }
}
