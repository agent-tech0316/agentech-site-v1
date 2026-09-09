import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const origin = process.env.EAIC_VIDEO_ORIGIN ?? "http://127.0.0.1:3005";
const browser = process.env.EAIC_VIDEO_CDP
  ? await chromium.connectOverCDP(process.env.EAIC_VIDEO_CDP)
  : await chromium.launch({ executablePath: process.env.AGENTECH_BROWSER_PATH ?? "/Applications/Google Chrome 2.app/Contents/MacOS/Google Chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => {
  window.previewScrollCalls = 0;
  const scrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (...args) { window.previewScrollCalls += 1; return scrollIntoView.apply(this, args); };
});
const page = await context.newPage();
const errors = [], writes = [];
page.on("pageerror", error => errors.push(error.message));
page.on("request", request => { if (/^(POST|PUT|PATCH|DELETE)$/.test(request.method()) && request.url().includes("/api/")) writes.push(request.url()); });
mkdirSync(".codex-artifacts/eaic-capability-video", { recursive: true });
const clips = [
  { label: /Wave back/, command: "wave", file: "/master/02_action_wave_right.mp4" },
  { label: /Return home/, command: "return_to_home", file: "/navi/return-to-home/navi-return-to-home.mp4" },
  { label: /Capture a view/, command: "capture_image", file: "/aegis/capture-view/aegis-capture-view.mp4" },
];

async function assertIdle(target) {
  const video = target.locator("[data-eaic-capability-preview] video");
  assert.equal(await video.count(), 1);
  assert.equal(await video.evaluate(video => video.controls), false, "Hide native video controls; Run is the playback entry");
  assert.equal(await video.evaluate(video => video.paused), true, "Choosing a label must wait for a valid command and Run");
  assert.equal(await video.evaluate(video => video.currentTime), 0);
}

async function runCommand(target, clip, keyboard = false) {
  await target.locator("[data-eaic-code-input]").fill(clip.command);
  if (keyboard) await target.locator("[data-eaic-code-input]").press("Enter");
  else await target.getByRole("button", { name: "Run code preview", exact: true }).click();
}

async function assertPlaying(target, clip) {
  await target.waitForFunction(file => {
    const video = document.querySelector("[data-eaic-capability-preview] video");
    return video && video.currentSrc.endsWith(file) && !video.paused && video.currentTime > 0.1;
  }, clip.file, { timeout: 10000 }).catch(() => {});
  const state = await target.locator("[data-eaic-capability-preview] video").evaluateAll(videos => videos.map(video => ({
    src: video.currentSrc, paused: video.paused, currentTime: video.currentTime,
    error: video.error?.message, muted: video.muted, inline: video.playsInline,
    top: video.getBoundingClientRect().top, bottom: video.getBoundingClientRect().bottom,
  })));
  assert.equal(state.length, 1, "Each capability must display exactly one corresponding video");
  assert.ok(state[0].src.endsWith(clip.file), JSON.stringify(state));
  assert.equal(state[0].paused, false, "Run must start the corresponding video without a second play click");
  assert.ok(state[0].currentTime > 0.1, JSON.stringify(state));
  assert.equal(state[0].error, undefined);
  assert.ok(state[0].muted && state[0].inline);
  return state[0];
}

try {
  await page.goto(`${origin}/agentech-products/eaic`);
  assert.equal(await page.locator("[data-eaic-capability-preview] video").count(), 0, "Keep previews closed until the visitor chooses an action");
  const views = [];
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    for (const theme of ["dark", "light"]) {
      await page.getByRole("radio", { name: theme === "dark" ? "Dark" : "Light", exact: true }).click();
      for (const clip of clips) {
        console.log(`Checking ${width}px / ${theme} / ${clip.file}`);
        const trigger = page.getByRole("button", { name: clip.label });
        await trigger.scrollIntoViewIfNeeded();
        const topBefore = await trigger.evaluate(button => button.getBoundingClientRect().top);
        await page.evaluate(() => { window.previewScrollCalls = 0; });
        await trigger.click();
        await assertIdle(page);
        assert.equal(await trigger.getAttribute("aria-pressed"), "true");
        assert.equal(await trigger.getAttribute("aria-expanded"), "true");
        const topAfter = await trigger.evaluate(button => button.getBoundingClientRect().top);
        assert.ok(Math.abs(topAfter - topBefore) < 3, `Keep the selected label in place when earlier panels collapse: ${topBefore} -> ${topAfter}`);
        assert.ok(await trigger.evaluate(button => {
          const preview = button.nextElementSibling;
          return preview?.hasAttribute("data-eaic-capability-preview") && preview.id === button.getAttribute("aria-controls") && preview.getBoundingClientRect().top >= button.getBoundingClientRect().bottom - 1;
        }), "The corresponding preview must expand immediately below its own action, not at the end of the list");
        assert.equal(await page.evaluate(() => window.previewScrollCalls), 0, "Choosing an action must not scroll to a distant shared player");
        await page.locator("[data-eaic-code-input]").fill("not_a_command");
        await page.getByRole("button", { name: "Run code preview", exact: true }).click();
        await page.locator("[data-eaic-code-feedback][role=alert]").waitFor();
        await assertIdle(page);
        await runCommand(page, clip);
        const state = await assertPlaying(page, clip);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
        views.push({ width, theme, file: clip.file, playing: !state.paused });
      }
      await page.screenshot({ path: `.codex-artifacts/eaic-capability-video/${width}-${theme}.png` });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const wave = page.getByRole("button", { name: /Wave back/ });
  await wave.click();
  await runCommand(page, clips[0]);
  await page.waitForFunction(() => document.querySelector("[data-eaic-capability-preview] video").currentTime > 1.5);
  await page.getByRole("button", { name: "Run code preview", exact: true }).click();
  assert.ok(await page.locator("[data-eaic-capability-preview] video").evaluate(video => video.currentTime < 1), "Run again restarts the same video");
  await assertPlaying(page, clips[0]);

  const command = page.getByRole("textbox", { name: "Command for Wave back" });
  await command.fill('wave(); alert("not code")');
  await page.getByRole("button", { name: "Run code preview", exact: true }).click();
  await page.locator("[data-eaic-code-feedback][role=alert]").waitFor();
  await command.fill("wave");
  await command.press("Enter");
  await assertPlaying(page, clips[0]);
  assert.match(await page.locator("[data-eaic-code-feedback]").innerText(), /running/i);
  for (const [label, value, clip] of [[/Return home/, "return_to_home", clips[1]], [/Capture a view/, "capture_image", clips[2]]]) {
    await page.getByRole("button", { name: label }).click();
    await page.locator("[data-eaic-code-input]").fill(value);
    await page.getByRole("button", { name: "Run code preview", exact: true }).click();
    await assertPlaying(page, clip);
  }
  await wave.focus();
  await page.keyboard.press("Enter");
  await assertIdle(page);
  await runCommand(page, clips[0], true);
  await assertPlaying(page, clips[0]);
  await page.getByRole("button", { name: /Return home/ }).click();
  await assertIdle(page);
  await wave.click();
  await runCommand(page, clips[0]);
  await assertPlaying(page, clips[0]);

  await page.route("**/02_action_wave_right.mp4", route => route.abort());
  await wave.click();
  await runCommand(page, clips[0]);
  await page.locator("[data-eaic-video-notice]").waitFor();
  assert.match(await page.locator("[data-eaic-video-notice]").innerText(), /could not|blocked/i);
  await page.unroute("**/02_action_wave_right.mp4");
  await wave.click();
  await runCommand(page, clips[0]);
  await assertPlaying(page, clips[0]);

  // Model a browser policy rejection once; recovery must use Run, not hidden native controls.
  await wave.click();
  await page.evaluate(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      HTMLMediaElement.prototype.play = play;
      return Promise.reject(new DOMException("Playback policy test", "NotAllowedError"));
    };
  });
  await runCommand(page, clips[0]);
  await page.locator("[data-eaic-video-notice]").waitFor();
  assert.match(await page.locator("[data-eaic-video-notice]").innerText(), /blocked by your browser/i);
  assert.match(await page.locator("[data-eaic-video-notice]").innerText(), /Run/);
  await page.getByRole("button", { name: "Run code preview", exact: true }).click();
  await assertPlaying(page, clips[0]);
  assert.equal(await page.locator("[data-eaic-video-notice]").count(), 0);

  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phoneSite = await phoneContext.newPage();
  await phoneSite.goto(`${origin}/agentech-products/eaic`);
  await phoneSite.getByRole("button", { name: /Return home/ }).click();
  await assertIdle(phoneSite);
  await runCommand(phoneSite, clips[1]);
  await assertPlaying(phoneSite, clips[1]);
  assert.ok(await phoneSite.getByRole("button", { name: /Return home/ }).evaluate(button => button.nextElementSibling?.hasAttribute("data-eaic-capability-preview")));
  await phoneSite.screenshot({ path: ".codex-artifacts/eaic-capability-video/desktop-phone-preview.png" });
  await phoneContext.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, [], "Preview clicks cannot send commands to a robot");
  console.log(JSON.stringify({ status: "passed", views, inlineExpansion: true, codeCompletion: true, nativeControlsHidden: true, waitsForRun: true, replay: true, keyboard: true, errorRecovery: true, runRetryRecovery: true, phonePreview: true, errors, writes }, null, 2));
} catch (error) {
  console.error({ url: page.url(), errors, buttons: await page.getByRole("button").allTextContents().catch(() => []) });
  await page.screenshot({ path: ".codex-artifacts/eaic-capability-video/failure.png" }).catch(() => {});
  throw error;
} finally { await context.close(); await browser.close(); }
