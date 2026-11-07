import type { AssetContentManifest } from "@/lib/eaic-asset-content";

type SavedManifest = {
  assetId: string;
  archiveSha256: string;
  content_manifest: AssetContentManifest;
  native_motion_name: string | null;
};

function storageTarget(ownerPrefix: string, id: string, sha256: string) {
  if (!/^[a-f0-9]{64}$/.test(ownerPrefix) || !/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error("Invalid asset metadata identity.");
  }
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "").replace(/\/rest\/v1$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Asset metadata storage is not configured.");
  // Signed customer uploads cannot target this metadata directory. Keep it
  // under the existing owner prefix and bind each object to immutable bytes.
  const object = `eaic-account-assets/${ownerPrefix}/manifests/v1/${id}/${sha256}.json`;
  return { url: `${url}/storage/v1`, object, headers: { apikey: key, authorization: `Bearer ${key}` } };
}

async function readJson(response: Response) {
  if (!response.body) throw new Error("Asset metadata is unavailable.");
  const reader = response.body.getReader(), chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 1024 * 1024) { await reader.cancel(); throw new Error("Asset metadata exceeds the limit."); }
      chunks.push(Buffer.from(part.value));
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks, bytes).toString("utf8")) as SavedManifest;
}

export async function readAssetManifest(ownerPrefix: string, id: string, sha256: string): Promise<SavedManifest | null> {
  const target = storageTarget(ownerPrefix, id, sha256);
  const response = await fetch(`${target.url}/object/authenticated/${target.object}`, {
    headers: target.headers, cache: "no-store", signal: AbortSignal.timeout(12000),
  });
  if (response.status === 404) return null;
  // Supabase Storage may return 400 with a structured 404 for a missing key.
  if (response.status === 400) {
    const error = await response.json().catch(() => null) as { statusCode?: string | number } | null;
    if (String(error?.statusCode) === "404") return null;
  }
  if (!response.ok) throw new Error("Could not read private asset metadata.");
  const saved = await readJson(response);
  if (saved.assetId !== id || saved.archiveSha256 !== sha256 || saved.content_manifest?.version !== 1
      || !["movement_with_audio", "movement_only", "audio_only"].includes(saved.content_manifest.playback?.mode)
      || !(saved.native_motion_name === null || typeof saved.native_motion_name === "string")) {
    throw new Error("Asset metadata does not match its submission.");
  }
  return saved;
}

export async function saveAssetManifest(ownerPrefix: string, saved: SavedManifest) {
  const target = storageTarget(ownerPrefix, saved.assetId, saved.archiveSha256);
  const response = await fetch(`${target.url}/object/${target.object}`, {
    method: "POST", headers: { ...target.headers, "content-type": "application/octet-stream", "x-upsert": "false" },
    body: JSON.stringify(saved), cache: "no-store", signal: AbortSignal.timeout(12000),
  });
  if (response.ok) return;
  if (response.status === 409 || response.status === 400) {
    const existing = await readAssetManifest(ownerPrefix, saved.assetId, saved.archiveSha256);
    if (existing && JSON.stringify(existing) === JSON.stringify(saved)) return;
  }
  throw new Error("Could not save private asset metadata.");
}
