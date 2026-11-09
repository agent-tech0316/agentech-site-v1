import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import AdmZip from "adm-zip";

export const maxAssetBytes = 64 * 1024 * 1024;
const maxExpandedBytes = 96 * 1024 * 1024;
import { AssetContentError, fail, protobuf } from "./asset-content-protobuf.ts";
import { inspectMasterPolicy, type MasterPolicyContract } from "./asset-content-master.ts";
export { AssetContentError };
type AssetFile = { path: string; bytes: number; sha256: string };
export type AssetContentManifest = {
  version: 1;
  movement: (AssetFile & { format: "onnx"; metadata: { irVersion: number; inputs: string[]; outputs: string[]; masterContract?: MasterPolicyContract } }) | null;
  audio: (AssetFile & { format: "wav"; durationSeconds: number; sampleRateHz: number; channels: number; bitsPerSample: number }) | null;
  referenceFiles: string[];
  playback: { mode: "movement_with_audio" | "movement_only" | "audio_only"; movementPath: string | null; audioPath: string | null };
};
const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex");

function onnxMetadata(data: Buffer) {
  let irVersion = 0, graph: Buffer | null = null;
  for (const field of protobuf(data)) {
    if (field.tag === 1 && typeof field.value === "bigint") irVersion = Number(field.value);
    if (field.tag === 7 && Buffer.isBuffer(field.value)) {
      if (graph) fail("ONNX must contain one graph.");
      graph = field.value;
    }
  }
  if (!Number.isSafeInteger(irVersion) || irVersion < 1 || !graph) fail("Choose an ONNX model with readable graph metadata.");
  const inputs: string[] = [], outputs: string[] = [];
  for (const field of protobuf(graph)) {
    if (!Buffer.isBuffer(field.value)) continue;
    if (field.tag === 11 || field.tag === 12) {
      const name = [...protobuf(field.value)].find(item => item.tag === 1 && Buffer.isBuffer(item.value))?.value;
      if (!Buffer.isBuffer(name) || !name.length || name.length > 1024) fail("ONNX input/output names are missing or too long.");
      (field.tag === 11 ? inputs : outputs).push(name.toString("utf8"));
    }
    if (field.tag === 5) {
      for (const tensor of protobuf(field.value)) {
        if (tensor.tag === 13 || (tensor.tag === 14 && tensor.value === BigInt(1))) {
          fail("ONNX external weights are not supported. Export a self-contained model.");
        }
      }
    }
  }
  if (!inputs.length || !outputs.length || inputs.length > 256 || outputs.length > 256) fail("ONNX input/output metadata is missing or exceeds the limit.");
  return { irVersion, inputs, outputs };
}

function wavMetadata(data: Buffer) {
  if (data.length < 44 || data.toString("ascii", 0, 4) !== "RIFF" || data.toString("ascii", 8, 12) !== "WAVE"
      || data.readUInt32LE(4) + 8 !== data.length) fail("Choose a complete PCM WAV audio file.");
  let format: { sampleRateHz: number; channels: number; bitsPerSample: number; byteRate: number; blockAlign: number } | null = null;
  let audioBytes = 0, dataChunks = 0, offset = 12;
  while (offset + 8 <= data.length) {
    const name = data.toString("ascii", offset, offset + 4), size = data.readUInt32LE(offset + 4), start = offset + 8;
    if (size > data.length - start) fail("WAV data is truncated.");
    if (name === "fmt ") {
      if (format || size < 16 || data.readUInt16LE(start) !== 1) fail("WAV must use uncompressed PCM audio.");
      format = { channels: data.readUInt16LE(start + 2), sampleRateHz: data.readUInt32LE(start + 4),
        byteRate: data.readUInt32LE(start + 8), blockAlign: data.readUInt16LE(start + 12), bitsPerSample: data.readUInt16LE(start + 14) };
    }
    if (name === "data") { audioBytes += size; dataChunks++; }
    offset = start + size + size % 2;
  }
  if (!format || dataChunks !== 1 || !audioBytes || offset !== data.length
      || ![8, 16, 24, 32].includes(format.bitsPerSample) || format.channels < 1 || format.channels > 8
      || format.sampleRateHz < 8000 || format.sampleRateHz > 192000
      || format.blockAlign !== format.channels * format.bitsPerSample / 8
      || format.byteRate !== format.sampleRateHz * format.blockAlign || audioBytes % format.blockAlign) fail("WAV audio parameters are invalid or unsupported.");
  return { durationSeconds: audioBytes / format.byteRate, sampleRateHz: format.sampleRateHz,
    channels: format.channels, bitsPerSample: format.bitsPerSample };
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function unzip(data: Buffer) {
  const archive = new AdmZip(data);
  const count = archive.getEntryCount();
  if (!count || count > 64) fail("ZIP must contain between 1 and 64 entries.");
  const entries = archive.getEntries();
  const names = new Set<string>();
  let expanded = 0;
  return entries.flatMap(entry => {
    const name = entry.entryName;
    if (!name || name.length > 512 || /[\\\x00-\x1f\x7f:]/.test(name) || name.startsWith("/")
        || name.split("/").some(part => part === ".." || part === ".")) fail("ZIP contains an unsafe file path.");
    const normalized = name.replace(/\/$/, "").toLowerCase();
    if (names.has(normalized)) fail("ZIP contains duplicate file paths.");
    names.add(normalized);
    if (((entry.attr >>> 16) & 0xf000) === 0xa000) fail("ZIP symbolic links are not supported.");
    if (entry.header.flags & 1) fail("Password-protected ZIP files are not supported.");
    const size = entry.header.size;
    expanded += size;
    if (size > maxAssetBytes || expanded > maxExpandedBytes) fail("ZIP contents are too large for the inspection limit.");
    if (entry.isDirectory) return [];
    const compressed = entry.getCompressedData();
    const bytes = entry.header.method === 0 ? compressed : entry.header.method === 8
      ? inflateRawSync(compressed, { maxOutputLength: Math.max(1, size) }) : fail("ZIP compression format is unsupported.");
    if (bytes.length !== size || crc32(bytes) !== entry.header.crc) fail("ZIP contains damaged file data.");
    return [{ path: name, bytes }];
  });
}

export function inspectAssetContent(data: Buffer, kind: "Package" | "Motion" | "Audio", name: string, robotModel?: string): AssetContentManifest {
  try {
    if (!data.length || data.length > maxAssetBytes) fail("File is empty or exceeds the 64 MiB upload limit.");
    const files = kind === "Package" ? unzip(data) : [{ path: name, bytes: data }];
    const policies = files.filter(file => /\.onnx$/i.test(file.path));
    const tracks = files.filter(file => /\.wav$/i.test(file.path));
    if (kind !== "Audio" && policies.length !== 1) fail("Include exactly one ONNX movement policy in the ZIP.");
    if (tracks.length > 1 || (kind === "Audio" && tracks.length !== 1)) fail("Include at most one WAV audio track for automatic pairing.");
    const identity = (file: typeof files[number]) => ({ path: file.path, bytes: file.bytes.length, sha256: digest(file.bytes) });
    const movement = policies[0] ? { ...identity(policies[0]), format: "onnx" as const, metadata: robotModel === "Master" ? inspectMasterPolicy(policies[0].bytes) : onnxMetadata(policies[0].bytes) } : null;
    const audio = tracks[0] ? { ...identity(tracks[0]), format: "wav" as const, ...wavMetadata(tracks[0].bytes) } : null;
    if (robotModel === "Master" && audio && (audio.sampleRateHz !== 16000 || audio.channels !== 1 || audio.bitsPerSample !== 16)) {
      fail("Master soundtracks must be 16 kHz, mono, 16-bit PCM WAV.");
    }
    if (robotModel === "Master" && tracks.length === 0 && files.some(file => /\.(mp3|aac|m4a|ogg|flac|aiff?)$/i.test(file.path))) {
      fail("Convert the soundtrack to 16 kHz, mono, 16-bit PCM WAV before uploading.");
    }
    return { version: 1, movement, audio,
      referenceFiles: files.filter(file => !/\.(onnx|wav)$/i.test(file.path)).map(file => file.path),
      playback: { mode: movement && audio ? "movement_with_audio" : movement ? "movement_only" : "audio_only",
        movementPath: movement?.path ?? null, audioPath: audio?.path ?? null } };
  } catch (error) {
    if (error instanceof AssetContentError) throw error;
    throw new AssetContentError(kind === "Package" ? "ZIP is invalid, damaged or exceeds the expansion limit." : `${kind === "Motion" ? "ONNX" : "WAV"} content is invalid.`);
  }
}
