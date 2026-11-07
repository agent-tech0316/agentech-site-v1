import { createHash, randomUUID } from "node:crypto";
import { supabaseRequest } from "@/lib/supabase-server";
import type { AgentechRobotModel } from "@/lib/agentech-robot-model";

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
export type AssetReceipt = {id:string; sha256:string; byte_size:number; native_motion_name:string|null; approval_basis:string};
const receiptColumns = "id,sha256,byte_size,native_motion_name,approval_basis";
export async function assetReceipts(email:string, ids:string[]) {
  if (!ids.length) return [];
  return supabaseRequest<AssetReceipt[]>("agentech_account_asset_submissions", {
    query:`email=eq.${encodeURIComponent(email)}&id=in.(${ids.join(",")})&select=${receiptColumns}`
  });
}

export async function recordAsset(email:string,key:string,stored:Response) {
  const match = assetKeyPattern.exec(key);
  if (!match || !stored.ok || !stored.body) throw new Error("The uploaded file is unavailable.");
  const [,id,robotModel] = match;
  const hash = createHash("sha256");
  let bytes=0;
  const reader=stored.body.getReader();
  try {
    for (;;) {
      const part=await reader.read();
      if (part.done) break;
      bytes+=part.value.byteLength;
      hash.update(part.value);
    }
  } finally {reader.releaseLock();}
  const sha256=hash.digest("hex");
  // Exact archive and standalone policy from the verified Master Happy Dance run.
  const happyDance = robotModel === "Master" && (
    (assetKind(key) === "Package" && sha256 === "9096c47b127490112a23074e50623f472f2602a562ed3e87bf65a2e6ab2107db") ||
    (assetKind(key) === "Motion" && sha256 === "010d6a2c912d0f507b9e9236e5fcad082bcd7b53595182ec7d9e6da9c3de04bb"));
  await supabaseRequest("agentech_account_asset_submissions",{method:"POST",query:"on_conflict=id",
    prefer:"resolution=ignore-duplicates,return=minimal", body:{id,email,object_key:assetPrefix(email)+"/"+key,
      file_name:assetDisplayName(key),robot_model:robotModel,asset_kind:assetKind(key),byte_size:bytes,sha256,
      native_motion_name:happyDance?"linkcraft_resource_onnx_ffkuaile_0.0.1":null}});
  const [receipt]=await assetReceipts(email,[id]);
  if (!receipt || receipt.sha256!==sha256) throw new Error("File receipt could not be confirmed.");
  return receipt;
}
