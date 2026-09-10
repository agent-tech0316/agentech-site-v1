import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const fixture = await readFile(new URL("./fixtures/about-build-story-v2.json", import.meta.url), "utf8").then(
  JSON.parse
);

async function readIdentity(url) {
  try {
    const [bytes, fileStat] = await Promise.all([readFile(url), stat(url)]);
    return {
      bytes: fileStat.size,
      sha256: createHash("sha256").update(bytes).digest("hex")
    };
  } catch {
    return null;
  }
}

test("the four published Build v2 frames preserve the frozen asset identities", async () => {
  const results = await Promise.all(
    fixture.frames.map(async (frame) => ({
      frame,
      identity: await readIdentity(
        new URL(`../public/assets/about/build-story-frames-v2/${frame.filename}`, import.meta.url)
      )
    }))
  );

  assert.deepEqual(
    results.filter((result) => result.identity === null).map((result) => result.frame.filename),
    [],
    "all four frozen Build v2 frames must be published"
  );
  assert.equal(
    results.reduce((total, result) => total + (result.identity?.bytes ?? 0), 0),
    fixture.totalBytes
  );
  for (const { frame, identity } of results) {
    assert.equal(identity.bytes, frame.bytes, `${frame.filename} byte count changed`);
    assert.equal(identity.sha256, frame.sha256, `${frame.filename} hash changed`);
  }
});
