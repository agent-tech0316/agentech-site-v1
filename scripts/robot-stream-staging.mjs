import { createHash, randomUUID } from 'node:crypto';
import { existsSync, linkSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** A failed compilation may leave source behind; never replace reviewed bytes. */
export function writeReviewedSource(file, source) {
  try {
    writeFileSync(file, source, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!readFileSync(file).equals(Buffer.from(source, 'utf8'))) {
      throw new Error('Existing staged source differs from the reviewed submission; refusing replacement.');
    }
  }
}

// The service credential may only be sent to our own private bucket. Verify
// the downloaded object before publishing a local, content-addressed file.
export async function stageBookedMotion(asset, {email, runtimeDir, baseUrl, apiKey, fetchImpl = fetch}) {
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const parts = String(asset.object_key).split('/');
  const leaf = parts[1] ?? '';
  if (asset.email !== email || parts.length !== 2 || parts[0] !== digest(email) ||
      !leaf.startsWith(asset.id + '--Master--') || !/^[a-zA-Z0-9_-]+\.(zip|onnx)$/.test(leaf) ||
      !/^[0-9a-f]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.byte_size) ||
      asset.byte_size < 1 || asset.byte_size > 64 * 1024 * 1024) {
    throw new Error('Invalid booked Master storage object');
  }
  const path = join(runtimeDir, 'master-motion-' + asset.sha256);
  function verifyLocal() {
    if (digest(readFileSync(path)) !== asset.sha256) throw new Error('Staged motion checksum mismatch');
    return path;
  }
  if (existsSync(path)) return verifyLocal();
  const response = await fetchImpl(baseUrl + '/storage/v1/object/authenticated/eaic-account-assets/' +
    parts.map(encodeURIComponent).join('/'), {headers:{apikey:apiKey, Authorization:'Bearer ' + apiKey},
    redirect:'error', signal:AbortSignal.timeout(30000)});
  if (!response.ok || !response.body) throw new Error('Booked motion download failed: HTTP ' + response.status);
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > asset.byte_size) throw new Error('Booked motion exceeds receipt size');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks, size);
  if (size !== asset.byte_size || digest(bytes) !== asset.sha256) throw new Error('Booked motion checksum mismatch');
  const tmp = path + '.' + randomUUID() + '.part';
  try {
    writeFileSync(tmp, bytes, {flag:'wx', mode:0o600});
    try { linkSync(tmp, path); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    return verifyLocal();
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
}
