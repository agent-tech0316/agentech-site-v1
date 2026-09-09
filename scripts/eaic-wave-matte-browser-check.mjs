import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const browser = process.env.EAIC_WAVE_BROWSER
  ? await chromium.launch({ executablePath: process.env.EAIC_WAVE_BROWSER, headless: true })
  : await chromium.connectOverCDP(process.env.EAIC_WAVE_CDP ?? "http://127.0.0.1:9233");
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const origin = process.env.EAIC_WAVE_ORIGIN ?? "http://127.0.0.1:3005";
const artifacts = ".codex-artifacts/wave-matte";
const errors = [];
page.on("pageerror", error => errors.push(error.message));
mkdirSync(artifacts, { recursive: true });
const pixels = buffer => sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const source = await pixels("public/assets/products/agentech-library/eaic-next-move-wireframe-v1.png");
const report = [];

try {
  await page.goto(`${origin}/agentech-products/eaic`);
  await page.waitForFunction(() => document.querySelector('[data-eaic-wave-demo]').dataset.artReady === "true");
  await page.evaluate(() => {
    const art = document.querySelector('.eaic-public-hero-art').cloneNode(true);
    document.body.replaceChildren(art);
    document.documentElement.style.background = 'transparent';
    document.body.style.cssText = 'margin:0;background:transparent';
    const style = document.createElement('style');
    style.textContent = 'body::before, body::after { display: none !important; }';
    document.head.append(style);
    art.style.cssText = 'position:fixed;inset:0;width:520px;height:520px;filter:none;mix-blend-mode:normal;opacity:1';
    art.querySelector('[data-eaic-wave-body]').style.visibility = 'hidden';
  });
  const isolated = await sharp(await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 520, height: 520 }, path: `${artifacts}/isolated-arm.png` })).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const matteAlpha = isolated.data[(Math.round(240 / 1254 * 520) * 520 + Math.round(485 / 1254 * 520)) * 4 + 3];
  assert.equal(matteAlpha, 0, 'The isolated arm matte must be transparent without a parent blend mode');
  let visibleLinePixels = 0;
  for (let y = 90; y < 320; y++) for (let x = 110; x < 215; x++) {
    if (isolated.data[(y * 520 + x) * 4 + 3] > 30) visibleLinePixels++;
  }
  assert.ok(visibleLinePixels > 1000, 'Transparent extraction must retain visible hand and forearm linework');
  await page.evaluate(() => {
    document.body.style.height = '100vh';
    document.body.style.background = 'repeating-conic-gradient(#ddd 0% 25%, white 0% 50%) 0 0 / 24px 24px';
  });
  await page.screenshot({ clip: { x: 0, y: 0, width: 520, height: 520 }, path: `${artifacts}/isolated-arm-checkerboard.png` });
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${origin}/agentech-products/eaic`);
    await page.waitForFunction(() => document.querySelector('[data-eaic-wave-demo]').dataset.artReady === "true");
    for (const theme of ["light", "dark"]) {
      await page.getByRole("radio", { name: theme === "light" ? "Light" : "Dark", exact: true }).click();
      const art = page.locator(".eaic-public-hero-art");
      const arm = page.locator("[data-eaic-wave-arm]");
      await page.getByRole("textbox", { name: "Robot action" }).fill("wave");
      for (const time of [0, 486, 1026]) {
        await page.getByRole("button", { name: "Run wave preview" }).click();
        await page.waitForFunction(() => document.querySelector('[data-eaic-wave-arm]').getAnimations().length > 0);
        const pose = await arm.evaluate((element, time) => {
          const animation = element.getAnimations()[0];
          animation.pause();
          animation.currentTime = time;
          const style = getComputedStyle(element);
          const matrix = new DOMMatrix(style.transform);
          return { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d };
        }, time);
        const frame = await pixels(await art.screenshot({ path: `${artifacts}/${width}-${theme}-${time}.png` }));
        await arm.evaluate(element => { element.style.visibility = "hidden"; });
        const withoutArm = await pixels(await art.screenshot());
        await arm.evaluate(element => { element.style.removeProperty("visibility"); });
        const deltas = [];
        // This rectangle is inside the arm crop above the fingers and contains
        // only source matte. Rotating it must never paint over the page or trail.
        for (let y = 225; y <= 275; y += 4) {
          for (let x = 470; x <= 500; x += 4) {
            const sourceIndex = (y * source.info.width + x) * source.info.channels;
            assert.ok(source.data[sourceIndex] <= 5, "The matte fixture must exclude hand linework");
            const dx = x / 1254 - .391, dy = y / 1254 - .619;
            const px = Math.round((.391 + pose.a * dx + pose.c * dy) * frame.info.width);
            const py = Math.round((.619 + pose.b * dx + pose.d * dy) * frame.info.height);
            const index = (py * frame.info.width + px) * frame.info.channels;
            deltas.push(Math.max(...[0, 1, 2].map(channel => Math.abs(frame.data[index + channel] - withoutArm.data[index + channel]))));
          }
        }
        deltas.sort((a, b) => a - b);
        const matte95 = deltas[Math.floor(deltas.length * .95)];
        report.push({ width, theme, time, matte95, max: deltas.at(-1), pose });
        assert.ok(matte95 <= 3, `${width}px ${theme} at ${time}ms: the empty moving crop changes the background by ${matte95} RGB levels`);
      }
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: "passed", matteAlpha, visibleLinePixels, report, errors }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
