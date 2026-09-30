import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const [page, stylesheet] = await Promise.all([
  readFile(new URL("../app/aigc/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/aigc/aigc.css", import.meta.url), "utf8")
]);

test("AIGC hero presents the complete golf robot motion study", async () => {
  const heroAsset = new URL(
    "../public/assets/aigc/aigc-golf-robot-hero.png",
    import.meta.url
  );

  await assert.doesNotReject(access(heroAsset));
  assert.match(page, /src="\/assets\/aigc\/aigc-golf-robot-hero\.png"/);
  assert.match(page, /alt="Wireframe humanoid robot progressing through a golf swing with an orange motion trajectory\."/);
  assert.doesNotMatch(page, /orange-glass-concept\.webp/);
  assert.match(page, /data-aigc-hero/);
  assert.match(page, /data-aigc-hero-grid/);
  assert.match(page, /data-aigc-hero-content/);
  assert.match(page, /data-aigc-hero-visual/);
  assert.doesNotMatch(page, /IMAGINATION|TAKES FORM|aigc-art-cross|<figcaption/);

  const heroImageRule = stylesheet.match(/\.aigc-art img\s*{([^}]*)}/s)?.[1] ?? "";
  assert.ok(heroImageRule, "the AIGC hero image should have a dedicated layout rule");
  assert.match(heroImageRule, /object-fit:\s*contain/);
  assert.match(heroImageRule, /object-position:\s*center/);
  assert.match(heroImageRule, /mask-image:\s*radial-gradient/);

  const heroRule = stylesheet.match(/\[data-aigc-page\] \.aigc-hero-shell\s*{([^}]*)}/s)?.[1] ?? "";
  assert.ok(heroRule, "the AIGC hero should have an EAIC-style full viewport shell");
  assert.match(heroRule, /min-height:\s*calc\(100svh\s*-\s*72px\)/);
  assert.match(heroRule, /background:\s*#020609/);

  const contentRule = stylesheet.match(/\[data-aigc-page\] \.aigc-hero-content\s*{([^}]*)}/s)?.[1] ?? "";
  assert.ok(contentRule, "the AIGC hero should share the EAIC content envelope");
  assert.match(contentRule, /max-width:\s*1280px/);
  assert.match(contentRule, /min-height:\s*calc\(100svh\s*-\s*72px\)/);
});
