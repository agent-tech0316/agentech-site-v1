export class AssetContentError extends Error {}
export function fail(message: string): never { throw new AssetContentError(message); }
// Read only protobuf structure/metadata. This is not ONNX execution or full
// operator/runtime compatibility validation. Lengths and iteration are bounded.
export function* protobuf(data: Buffer): Generator<{ tag: number; wire: number; value: Buffer | bigint }> {
  let offset = 0, count = 0;
  function integer() {
    let value = BigInt(0);
    for (let index = 0; index < 10 && offset < data.length; index++) {
      const byte = data[offset++];
      value |= BigInt(byte & 127) << BigInt(index * 7);
      if (index === 9 && byte > 1) return fail("ONNX integer overflows.");
      if (!(byte & 128)) return value;
    }
    return fail("ONNX metadata has an invalid integer.");
  }
  while (offset < data.length) {
    if (++count > 100000) fail("ONNX metadata exceeds the inspection limit.");
    const key = Number(integer()), tag = Math.floor(key / 8), wire = key % 8;
    if (!Number.isSafeInteger(key) || tag < 1) fail("ONNX metadata is invalid.");
    if (wire === 0) { yield { tag, wire, value: integer() }; continue; }
    const size = wire === 2 ? Number(integer()) : wire === 1 ? 8 : wire === 5 ? 4 : -1;
    if (!Number.isSafeInteger(size) || size < 0 || size > data.length - offset) fail("ONNX metadata is truncated or invalid.");
    yield { tag, wire, value: data.subarray(offset, offset + size) };
    offset += size;
  }
}
