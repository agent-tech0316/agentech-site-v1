import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const [journey, shareWorkshop, introStyles, assetManifest] = await Promise.all([
  readFile(new URL("../app/about/about-journey.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/about/about-share-workshop.tsx", import.meta.url), "utf8").catch(() => ""),
  readFile(new URL("../app/about/about-intro.module.css", import.meta.url), "utf8"),
  readFile(new URL("./fixtures/about-share-story-v3.json", import.meta.url), "utf8").then(JSON.parse)
]);

const expectedPaths = Array.from(
  { length: assetManifest.frameCount },
  (_, index) => `/assets/about/share-story-frames-v3/frame-${String(index).padStart(2, "0")}.webp`
);

test("Share keeps its independent story player beside the independent Build player", () => {
  assert.match(journey, /import \{ ShareWorkshop \} from "\.\/about-share-workshop"/);
  assert.match(journey, /id: "share"[\s\S]*Scene: ShareWorkshop/);
  assert.match(journey, /const isInteractive = step\.id === "idea" \|\| Scene !== null/);
  assert.match(journey, /<IdeaWorkshop active \/>/);
  assert.doesNotMatch(journey, /function BuildScene\(\)/);
  assert.doesNotMatch(journey, /function ShareScene\(\)/);
  assert.match(
    introStyles,
    /\.scene\s+:global\(\[data-about-story-player\]\)\s*{[^}]*width:\s*100%[^}]*height:\s*100%[^}]*min-height:\s*0/s
  );
});

test("Share uses exactly the frozen 36-frame v3 sequence and its approved timing", () => {
  const framePaths = shareWorkshop.match(/\/assets\/about\/share-story-frames-v3\/frame-\d+\.webp/g) ?? [];
  assert.deepEqual(framePaths, expectedPaths);
  assert.match(shareWorkshop, /<AboutStoryFramePlayer/);
  assert.match(shareWorkshop, /story="share"/);
  assert.match(shareWorkshop, /label="Share"/);
  assert.match(shareWorkshop, /frameIntervalMs=\{80\}/);
  assert.doesNotMatch(shareWorkshop, /share-story-frames-v[12]|about-story-share-animation-v1|pose-|masters|evidence|\.png/);
});

test("the published Share v3 sequence matches the frozen ordered asset identity", async () => {
  const results = await Promise.all(
    Array.from({ length: assetManifest.frameCount }, async (_, index) => {
      const filename = `frame-${String(index).padStart(2, "0")}.webp`;
      const url = new URL(`../public/assets/about/share-story-frames-v3/${filename}`, import.meta.url);
      try {
        const [bytes, fileStat] = await Promise.all([readFile(url), stat(url)]);
        return {
          filename,
          bytes: fileStat.size,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          contents: bytes
        };
      } catch {
        return { filename, missing: true };
      }
    })
  );
  const missing = results.filter((result) => result.missing).map((result) => result.filename);
  assert.deepEqual(missing, [], `missing frozen Share frames: ${missing.join(", ")}`);
  assert.equal(results.reduce((total, result) => total + (result.bytes ?? 0), 0), assetManifest.totalBytes);
  const orderedHash = createHash("sha256");
  for (const result of results) orderedHash.update(result.contents);
  assert.equal(orderedHash.digest("hex"), assetManifest.orderedFramesSha256);
  assert.equal(results[0].sha256, assetManifest.firstFrameSha256);
  assert.equal(results.at(-1).sha256, assetManifest.lastFrameSha256);
});
