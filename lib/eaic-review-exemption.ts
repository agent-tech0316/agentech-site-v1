import { createHash, randomUUID } from "node:crypto";
import { supabaseRequest } from "@/lib/supabase-server";
import type { AgentechRobotModel } from "@/lib/agentech-robot-model";
import { AssetContentError, inspectAssetContent, maxAssetBytes, type AssetContentManifest } from "@/lib/eaic-asset-content";
import { readAssetManifest, saveAssetManifest } from "@/lib/eaic-asset-manifests";
import happyDance from "../scripts/master-happy-dance.json";

export const fullReviewExemption = "account-certification-exemption";
export const assetBucket = "eaic-account-assets";

export async function hasFullReviewExemption(email: string) {
  if (!email) return false;
  const rows = await supabaseRequest<{ email: string }[]>("agentech_code_review_exemptions", {
    query: `email=eq.${encodeURIComponent(email)}&select=email&limit=1`
  });
  return rows.length === 1 && rows[0].email === email;
}

export async function saveExemptProgram(email: string, robotModel: string, code: string, commands: string[], file: string, developerName: string) {
  return supabaseRequest<string>("rpc/agentech_save_exempt_submission", {
    method: "POST", body: { p_email: email, p_robot_model: robotModel, p_code: code,
      p_commands: commands, p_filename: file || null, p_developer_name: developerName }
  });
}

export function assetPrefix(email: string) {
  return createHash("sha256").update(email).digest("hex");
}

export function assetKind(name: string) {
  const ext = name.toLowerCase().split(".").pop();
  return ext === "onnx" ? "Motion" : ext === "wav" ? "Audio" : ext === "zip" ? "Package" : null;
}

export function newAssetName(name: string, model: AgentechRobotModel = "Master") {
  const leaf = name.split(/[\\/]/).pop()?.trim() || "";
  if (!assetKind(leaf) || !leaf.includes(".") || Buffer.byteLength(leaf) > 255) return null;
  return `${randomUUID()}--${model}--${Buffer.from(leaf).toString("base64url")}.${leaf.split(".").pop()!.toLowerCase()}`;
}

export function assetDisplayName(key: string) {
  const encoded = key.slice(key.indexOf("--",38)+2,key.lastIndexOf("."));
  return Buffer.from(encoded, "base64url").toString("utf8");
}

export const assetKeyPattern = /^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})--(Aegies|Navi|Master)--[A-Za-z0-9_-]+\.(zip|onnx|wav)$/;
export type AssetReceipt = {id:string; sha256:string; byte_size:number; native_motion_name:string|null; approval_basis:string; content_manifest:AssetContentManifest|null};
export const masterMotionBasis = "master-policy-contract-v1";
export const masterAudioBasis = "pcm-wav-v1";
export const assetIdPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const table = "agentech_account_asset_submissions";
type StoredReceipt = AssetReceipt & {file_name: string; robot_model: string; object_key: string; asset_kind: string};
const receiptColumns = "id,sha256,byte_size,native_motion_name,approval_basis,content_manifest,file_name,robot_model,object_key,asset_kind";
async function ownedRows(email: string, ids: string[]) {
  if (!ids.length || !email || ids.some(id => !assetIdPattern.test(id))) return [];
  return supabaseRequest<StoredReceipt[]>(table, {
    query: `email=eq.${encodeURIComponent(email)}&id=in.(${ids.join(",")})&select=${receiptColumns}`,
  });
}
async function receiptFor(email: string, row: StoredReceipt): Promise<AssetReceipt> {
  const saved = row.content_manifest ? null : await readAssetManifest(assetPrefix(email), row.id, row.sha256);
  return { id: row.id, sha256: row.sha256, byte_size: row.byte_size, approval_basis: row.approval_basis,
    native_motion_name: row.native_motion_name ?? saved?.native_motion_name ?? null,
    content_manifest: row.content_manifest ?? saved?.content_manifest ?? null };
}
export async function assetReceipts(email: string, ids: string[]) {
  const rows = await ownedRows(email, ids);
  return Promise.all(rows.map(row => receiptFor(email, row)));
}
export async function existingSubmission(email: string, key: string) {
  const match = assetKeyPattern.exec(key);
  if (!match) return null;
  const [row] = await ownedRows(email,[match[1]]);
  if (!row || row.object_key !== assetPrefix(email) + "/" + key) return null;
  if (match[2] === "Master" && (!row.content_manifest || ![masterAudioBasis,masterMotionBasis].includes(row.approval_basis))) return null;
  const receipt = await receiptFor(email,row);
  return receipt.content_manifest ? receipt : null;
}
export async function ownedAssetFile(email: string, id: string) {
  const [row] = await ownedRows(email, [id]);
  return row ? {name: row.file_name, robotModel: row.robot_model, receipt: await receiptFor(email, row)} : null;
}

export function fetchOwnedAsset(email: string, key: string) {
  if (!assetKeyPattern.test(key)) throw new AssetContentError("Invalid asset key.");
  const auth = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const url = process.env.SUPABASE_URL!.replace(/\/$/,"").replace(/\/rest\/v1$/,"");
  return fetch(`${url}/storage/v1/object/authenticated/${assetBucket}/${assetPrefix(email)}/${encodeURIComponent(key)}`, {
    headers: {apikey:auth, authorization:`Bearer ${auth}`}, cache:"no-store", signal:AbortSignal.timeout(260000),
  });
}
export async function ensureMasterMotionReceipt(email: string, assetId: string): Promise<AssetReceipt | null> {
  const [row] = await ownedRows(email, [assetId]);
  if (!row || row.robot_model !== "Master" || !["Motion", "Package"].includes(row.asset_kind)) return null;
  if (row.approval_basis === masterMotionBasis && row.content_manifest?.movement?.metadata.masterContract) return receiptFor(email,row);
  const prefix = assetPrefix(email) + "/";
  if (!row.object_key.startsWith(prefix)) throw new Error("Invalid stored asset owner.");
  const key = row.object_key.slice(prefix.length);
  const match = assetKeyPattern.exec(key);
  if (!match || match[1] !== assetId || match[2] !== "Master" || assetKind(key) !== row.asset_kind) throw new Error("Invalid stored asset identity.");
  return recordAsset(email, key, await fetchOwnedAsset(email, key));
}

export async function recordAsset(email:string,key:string,stored:Response) {
  const match = assetKeyPattern.exec(key);
  if (!match || !stored.ok || !stored.body) throw new Error("The uploaded file is unavailable.");
  const [,id,robotModel] = match;
  const chunks:Buffer[]=[];
  let bytes=0;
  const reader=stored.body.getReader();
  try {
    for (;;) {
      const part=await reader.read();
      if (part.done) break;
      bytes+=part.value.byteLength;
      if (bytes>maxAssetBytes) {
        await reader.cancel();
        throw new AssetContentError("File exceeds the 64 MiB upload limit.");
      }
      chunks.push(Buffer.from(part.value));
    }
  } finally {reader.releaseLock();}
  const data=Buffer.concat(chunks,bytes);
  const sha256=createHash("sha256").update(data).digest("hex");
  const content_manifest=inspectAssetContent(data,assetKind(key)!,assetDisplayName(key),robotModel);
  // Identify the known motion from its policy bytes, including renamed or
  // repacked ZIPs. Filenames and README instructions are never authority.
  const matchesDancePolicy = content_manifest.movement?.sha256 === happyDance.policy;
  if (matchesDancePolicy && robotModel!=="Master") throw new AssetContentError("This movement policy targets Master Ultra. Select Master for this package.");
  const native_motion_name = matchesDancePolicy && content_manifest.audio?.sha256 === happyDance.audio ? happyDance.motion : null;
  const approval_basis = robotModel === "Master" ? (content_manifest.movement ? masterMotionBasis : masterAudioBasis) : fullReviewExemption;
  const object_key = assetPrefix(email) + "/" + key;
  const [prior] = await ownedRows(email,[id]);
  if (prior && (prior.sha256 !== sha256 || prior.object_key !== object_key)) throw new AssetContentError("Uploaded bytes differ from the saved submission. Upload a new file version.");
  if (robotModel !== "Master") {
    await saveAssetManifest(assetPrefix(email),{assetId:id,archiveSha256:sha256,content_manifest,native_motion_name});
  }
  if (!prior) {
    await supabaseRequest(table,{method:"POST",query:"on_conflict=id",prefer:"resolution=ignore-duplicates,return=minimal",
      body:{id,email,object_key,file_name:assetDisplayName(key),robot_model:robotModel,asset_kind:assetKind(key),
        byte_size:bytes,sha256,native_motion_name,approval_basis,...(robotModel === "Master" ? {content_manifest} : {})}});
  } else if (robotModel === "Master" && prior.approval_basis === fullReviewExemption) {
    await supabaseRequest(table,{method:"PATCH",prefer:"return=minimal",
      query:`email=eq.${encodeURIComponent(email)}&id=eq.${id}&sha256=eq.${sha256}&approval_basis=eq.${fullReviewExemption}`,
      body:{approval_basis,content_manifest}});
  }
  const [row] = await ownedRows(email,[id]);
  if (!row || row.sha256 !== sha256 || row.object_key !== object_key || row.approval_basis !== approval_basis ||
      (robotModel === "Master" && !row.content_manifest)) throw new Error("File receipt could not be confirmed.");
  return receiptFor(email,row);
}
