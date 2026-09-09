import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import sharp from "sharp";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const browser = await chromium.connectOverCDP(process.env.EAIC_WAVE_CDP ?? "http://127.0.0.1:9233");
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const origin = process.env.EAIC_WAVE_ORIGIN ?? "http://127.0.0.1:3005";
const errors = [];
page.on("pageerror", error => errors.push(error.message));
mkdirSync(".codex-artifacts/wave-layers", { recursive: true });
async function pixels(buffer) { return sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true }); }
function lostLines(before, after, region, theme) {
  const { width, height, channels } = before.info;
  let ink = 0, lost = 0;
  for (let y = Math.ceil(region[1] * height); y < region[3] * height; y++) {
    for (let x = Math.ceil(region[0] * width); x < region[2] * width; x++) {
      const index = (y * width + x) * channels;
      const a = before.data[index], b = after.data[index];
      if (theme === "light" ? a < 235 : a > 25) {
        ink++;
        if (theme === "light" ? b > a + 10 : b < a - 10) lost++;
      }
    }
  }
  assert.ok(ink > 10, "The comparison region must contain real stationary wireframe lines");
  return lost / ink;
}
try {
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.goto(`${origin}/agentech-products/eaic`);
      await page.getByRole("radio", { name: theme === "light" ? "Light" : "Dark", exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-eaic-wave-demo]').dataset.artReady === "true");
      const art = page.locator(".eaic-public-hero-art");
      const before = await pixels(await art.screenshot());
      await page.getByRole("textbox", { name: "Robot action" }).fill("wave");
      await page.waitForFunction(() => document.querySelector('[data-eaic-wave-demo]').dataset.waveState === "running");
      const arm = page.locator("[data-eaic-wave-arm]");
      await arm.evaluate(el => { const animation = el.getAnimations()[0]; animation.pause(); animation.currentTime = 486; });
      const after = await pixels(await art.screenshot({ path: `.codex-artifacts/wave-layers/${width}-${theme}.png` }));
      // The moving forearm must not erase the static motion trail or steal the upper arm.
      const trailLoss = lostLines(before, after, [.15, .30, .225, .44], theme);
      // Stay to the right of the moving cuff; counting cuff pixels as stationary
      // would incorrectly fail when the complete forearm leaves its idle pose.
      const upperArmLoss = lostLines(before, after, [.407, .525, .44, .575], theme);
      assert.ok(trailLoss < .06, `${width}px ${theme}: motion trail loses ${(trailLoss * 100).toFixed(1)}% of its ink`);
      assert.ok(upperArmLoss < .10, `${width}px ${theme}: stationary upper arm loses ${(upperArmLoss * 100).toFixed(1)}% of its ink`);
      console.log(`PASS ${width}px ${theme}: trail loss ${trailLoss.toFixed(3)}, upper-arm loss ${upperArmLoss.toFixed(3)}`);
    }
  }
  assert.deepEqual(errors, []);
} finally { await context.close(); await browser.close(); }
