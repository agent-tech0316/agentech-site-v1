import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const fixture = await readFile(new URL("./fixtures/about-team-avatars-v1.json", import.meta.url), "utf8").then(
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

test("the six published team avatars preserve the approved source bytes", async () => {
  const results = await Promise.all(
    fixture.avatars.map(async (avatar) => ({
      avatar,
      identity: await readIdentity(
        new URL(`../public/assets/about/team-avatars-v1/${avatar.slug}.png`, import.meta.url)
      )
    }))
  );

  assert.deepEqual(
    results.filter((result) => result.identity === null).map((result) => result.avatar.slug),
    [],
    "all six approved avatar files must be published"
  );
  for (const { avatar, identity } of results) {
    assert.equal(identity.bytes, avatar.bytes, `${avatar.slug} byte count changed`);
    assert.equal(identity.sha256, avatar.sha256, `${avatar.slug} hash changed`);
  }
});
