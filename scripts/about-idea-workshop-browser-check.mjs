import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { after, test } from "node:test";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const sharp = require(process.env.AGENTECH_SHARP_PATH ?? "sharp");
const baseUrl = process.env.ABOUT_IDEA_BASE_URL ?? "http://127.0.0.1:3005";
const evidenceDir = process.env.ABOUT_IDEA_EVIDENCE_DIR;
const approvedStatement = "At Agentech, we turn curiosity into creation with AI and robotics.";
const approvedExplanation =
  "Through software tools, robot applications, and hands-on learning, we help you explore ideas, build skills, and create projects of your own.";
const browserPath = process.env.AGENTECH_BROWSER_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath: browserPath, headless: true });

after(async () => {
  await browser.close();
});

async function captureAtViewportWidth(page, filename, viewportWidth) {
  if (!evidenceDir) return;
  const source = await page.screenshot({ fullPage: true });
  const metadata = await sharp(source).metadata();
  await sharp(source)
    .extract({ left: 0, top: 0, width: viewportWidth, height: metadata.height })
    .png()
    .toFile(path.join(evidenceDir, filename));
}

async function waitForWorkshopReady(page) {
  const workshop = page.locator("[data-idea-workshop]");
  await workshop.waitFor();
  await workshop.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const element = document.querySelector("[data-idea-workshop]");
    return element?.dataset.framesReady === "true" && element?.dataset.inViewport === "true";
  });
  return workshop;
}

async function readFrameMetrics(workshop) {
  return workshop.locator("[data-idea-frame]").evaluateAll((frames) =>
    frames.map((element) => {
      const image = element;
      const rect = image.getBoundingClientRect();
      const style = getComputedStyle(image);
      return {
        index: Number(image.dataset.ideaFrame),
        active: image.dataset.activeFrame,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        objectFit: style.objectFit,
        objectPosition: style.objectPosition,
        opacity: style.opacity,
        animationName: style.animationName,
        transform: style.transform
      };
    })
  );
}

test("the full artwork plays once on hover, holds, repeats from keyboard, and resets with context", async () => {
  if (evidenceDir) await mkdir(evidenceDir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem("agentech-theme", "light"));
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

  const response = await page.goto(`${baseUrl}/about`, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200);
  const workshop = await waitForWorkshopReady(page);

  assert.equal(await workshop.evaluate((element) => element.tagName), "BUTTON");
  assert.equal(await workshop.locator("button").count(), 0, "the full-frame button must not contain extra controls");
  assert.equal(await workshop.locator("svg").count(), 0, "bitmap frames must not have a drawing overlay");
  assert.equal(await workshop.getAttribute("data-loaded-frame-count"), "4");
  assert.equal(await workshop.getAttribute("data-frame-index"), "0");
  assert.equal(await workshop.getAttribute("data-playing"), "false");
  assert.equal(await page.getByText("Sketch an idea", { exact: true }).count(), 0);

  const idleFrames = await readFrameMetrics(workshop);
  assert.deepEqual(idleFrames.map((frame) => frame.index), [0, 1, 2, 3]);
  assert.ok(idleFrames.every((frame) => frame.naturalWidth > 0 && frame.naturalHeight > 0));
  assert.ok(idleFrames.every((frame) => frame.width === idleFrames[0].width && frame.height === idleFrames[0].height));
  assert.ok(idleFrames.every((frame) => frame.objectFit === "cover" && frame.objectPosition === "50% 50%"));
  assert.ok(idleFrames.every((frame) => frame.animationName === "none" && frame.transform === "none"));
  assert.deepEqual(idleFrames.map((frame) => frame.opacity), ["1", "0", "0", "0"]);
  await captureAtViewportWidth(page, "about-idea-frame-player-1440-light-idle.png", 1440);

  await workshop.hover();
  await page.waitForFunction(() => document.querySelector("[data-idea-workshop]")?.dataset.playing === "true");
  const firstCycle = await workshop.getAttribute("data-playback-cycle");
  await page.waitForTimeout(250);
  await workshop.click();
  await page.waitForFunction(
    (cycle) => document.querySelector("[data-idea-workshop]")?.dataset.playbackCycle !== cycle,
    firstCycle
  );
  const restartedAt = Date.now();
  for (const expectedFrame of [1, 2, 3]) {
    await page.waitForFunction(
      (frame) => document.querySelector("[data-idea-workshop]")?.dataset.frameIndex === String(frame),
      expectedFrame,
      { timeout: 1600 }
    );
    if (expectedFrame === 2) {
      await captureAtViewportWidth(page, "about-idea-frame-player-1440-light-mid.png", 1440);
    }
  }
  const elapsed = Date.now() - restartedAt;
  assert.ok(elapsed >= 2600 && elapsed <= 4600, `expected a roughly three-second sequence, received ${elapsed}ms`);
  assert.equal(await workshop.getAttribute("data-playing"), "false");
  await page.waitForTimeout(900);
  assert.equal(await workshop.getAttribute("data-frame-index"), "3", "the completed frame should hold");
  await captureAtViewportWidth(page, "about-idea-frame-player-1440-light-complete.png", 1440);

  await page.mouse.move(10, 90);
  await page.waitForFunction(() => document.querySelector("[data-idea-workshop]")?.dataset.frameIndex === "0");
  assert.equal(await workshop.getAttribute("data-playing"), "false");

  await workshop.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("[data-idea-workshop]")?.dataset.frameIndex === "1");
  await page.getByRole("tab", { name: "Build", exact: true }).focus();
  await page.waitForFunction(() => document.querySelector("[data-idea-workshop]")?.dataset.frameIndex === "0");
  assert.equal(await workshop.getAttribute("data-active"), "true", "blur should reset without changing the active panel");

  await workshop.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("[data-idea-workshop]")?.dataset.frameIndex === "1");
  await page.getByRole("tab", { name: "Build", exact: true }).click();
  assert.equal(await workshop.getAttribute("data-active"), "false");
  assert.equal(await workshop.getAttribute("data-frame-index"), "0");
  assert.equal(await workshop.getAttribute("data-playing"), "false");

  await page.getByRole("tab", { name: "Idea", exact: true }).click();
  await waitForWorkshopReady(page);
  await workshop.focus();
  await page.keyboard.press("Space");
  await page.waitForFunction(() => document.querySelector("[data-idea-workshop]")?.dataset.frameIndex === "1");
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await page.waitForFunction(() => document.querySelector("[data-idea-workshop]")?.dataset.inViewport === "false");
  assert.equal(await workshop.getAttribute("data-frame-index"), "0");
  assert.equal(await workshop.getAttribute("data-playing"), "false");
  assert.equal(errors.length, 0, errors.join("\n"));
  await context.close();
});

test("a hover that begins before frame decoding finishes starts automatically once ready", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  let releaseFrameRequests;
  const frameGate = new Promise((resolve) => {
    releaseFrameRequests = resolve;
  });

  await page.route("**/*", async (route) => {
    if (route.request().url().includes("idea-sketch-frames-v3")) await frameGate;
    await route.continue();
  });

  const response = await page.goto(`${baseUrl}/about`, { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200);
  const workshop = page.locator("[data-idea-workshop]");
  await workshop.waitFor();
  await workshop.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector("[data-idea-workshop]")?.dataset.inViewport === "true");
  assert.equal(await workshop.getAttribute("data-frames-ready"), "false");

  await workshop.hover();
  assert.equal(await workshop.getAttribute("data-playing"), "false");
  releaseFrameRequests();
  await page.waitForFunction(() => document.querySelector("[data-idea-workshop]")?.dataset.framesReady === "true");
  await page.waitForFunction(() => document.querySelector("[data-idea-workshop]")?.dataset.playing === "true");
  await page.waitForFunction(() => document.querySelector("[data-idea-workshop]")?.dataset.frameIndex === "1", null, {
    timeout: 1700
  });
  await page.mouse.move(10, 90);
  await page.waitForFunction(() => document.querySelector("[data-idea-workshop]")?.dataset.frameIndex === "0");
  await context.close();
});

test("a frame decode rejection leaves the static fallback visible and blocks playback", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    const nativeDecode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function decodeWithFailure() {
      const source = decodeURIComponent(this.currentSrc || this.src);
      if (source.includes("idea-sketch-frames-v3/frame-2.webp")) {
        return Promise.reject(new DOMException("Synthetic frame decode failure", "EncodingError"));
      }
      return nativeDecode.call(this);
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(`${baseUrl}/about`, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200);
  const workshop = page.locator("[data-idea-workshop]");
  await workshop.waitFor();
  await workshop.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector("[data-idea-workshop]")?.dataset.inViewport === "true");
  await page.waitForFunction(() => document.querySelector("[data-idea-workshop]")?.dataset.frameError === "true");

  assert.equal(await workshop.getAttribute("data-frames-ready"), "false");
  assert.equal(await workshop.getAttribute("data-failed-frame-count"), "1");
  assert.equal(await workshop.getAttribute("data-frame-index"), "0");
  await workshop.hover();
  await page.waitForTimeout(1200);
  assert.equal(await workshop.getAttribute("data-frame-index"), "0");
  assert.equal(await workshop.getAttribute("data-playing"), "false");
  assert.match((await workshop.locator('[aria-live="polite"]').textContent()) ?? "", /could not load/i);
  assert.deepEqual(errors, []);
  await context.close();
});

test("touch and reduced motion jump to the completed frame and remain repeatable", async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    hasTouch: true,
    isMobile: true
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  const response = await page.goto(`${baseUrl}/about`, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200);
  const workshop = await waitForWorkshopReady(page);

  const box = await workshop.boundingBox();
  assert.ok(box.width >= 44 && box.height >= 44);
  await workshop.tap();
  await page.waitForFunction(() => document.querySelector("[data-idea-workshop]")?.dataset.frameIndex === "3");
  assert.equal(await workshop.getAttribute("data-playing"), "false");
  assert.match((await workshop.locator('[aria-live="polite"]').textContent()) ?? "", /complete/i);

  const reducedFrames = await readFrameMetrics(workshop);
  assert.ok(reducedFrames.every((frame) => frame.animationName === "none"));
  assert.deepEqual(reducedFrames.map((frame) => frame.opacity), ["0", "0", "0", "1"]);
  if (evidenceDir) {
    await workshop.screenshot({ path: path.join(evidenceDir, "about-idea-frame-player-390-reduced-complete.png") });
  }

  await page.evaluate(() => {
    const workshopElement = document.querySelector("[data-idea-workshop]");
    workshopElement?.dispatchEvent(
      new PointerEvent("pointerout", { bubbles: true, pointerType: "touch", relatedTarget: document.body })
    );
  });
  await page.waitForTimeout(100);
  assert.equal(await workshop.getAttribute("data-frame-index"), "3", "touch pointer leave must not cancel click playback");

  await page.getByRole("tab", { name: "Build", exact: true }).tap();
  assert.equal(await workshop.getAttribute("data-frame-index"), "0");
  await page.getByRole("tab", { name: "Idea", exact: true }).tap();
  await waitForWorkshopReady(page);
  await workshop.tap();
  await page.waitForFunction(() => document.querySelector("[data-idea-workshop]")?.dataset.frameIndex === "3");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.equal(errors.length, 0, errors.join("\n"));
  await context.close();
});

test("frame-player visual matrix preserves copy, layout, team, and a single full-frame control", { skip: !evidenceDir }, async () => {
  await mkdir(evidenceDir, { recursive: true });
  const viewports = [
    { name: "1440", width: 1440, height: 1000 },
    { name: "768", width: 768, height: 1024 },
    { name: "390", width: 390, height: 844 }
  ];
  const themes = ["light", "dark"];
  const report = {
    generatedAt: new Date().toISOString(),
    url: `${baseUrl}/about`,
    functionalCoverage: [
      "four complete About v3 bitmap frames with no SVG overlay",
      "all frames load before playback becomes available",
      "whole-frame hover playback advances 0 through 3 in roughly three seconds",
      "final frame holds until pointer leave",
      "Enter, Space, click, and touch repeat playback",
      "reduced motion jumps directly to the completed frame",
      "Build selection and offscreen state reset to frame zero",
      "single native full-frame control with screen-reader-only status"
    ],
    views: []
  };

  for (const theme of themes) {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport });
      await context.addInitScript((selectedTheme) => localStorage.setItem("agentech-theme", selectedTheme), theme);
      const page = await context.newPage();
      const errors = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
      });
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

      const response = await page.goto(`${baseUrl}/about`, { waitUntil: "networkidle" });
      assert.equal(response?.status(), 200);
      assert.equal(await page.locator("html").getAttribute("data-theme"), theme);
      assert.equal((await page.locator("[data-about-intro-statement]").textContent())?.trim(), approvedStatement);
      assert.equal((await page.locator("[data-about-intro-copy]").textContent())?.trim(), approvedExplanation);

      const workshop = await waitForWorkshopReady(page);
      assert.equal(await workshop.evaluate((element) => element.tagName), "BUTTON");
      assert.equal(await workshop.locator("button, svg").count(), 0);
      const idleMetrics = await readFrameMetrics(workshop);
      assert.equal(idleMetrics.length, 4);
      assert.ok(idleMetrics.every((frame) => frame.naturalWidth > 0 && frame.naturalHeight > 0));
      assert.ok(idleMetrics.every((frame) => frame.width === idleMetrics[0].width && frame.height === idleMetrics[0].height));

      await workshop.click();
      await page.waitForFunction(() => document.querySelector("[data-idea-workshop]")?.dataset.frameIndex === "3", null, {
        timeout: 4600
      });
      await captureAtViewportWidth(page, `about-idea-frame-player-${viewport.name}-${theme}-complete.png`, viewport.width);

      const panelHeights = [];
      for (const label of ["Idea", "Build", "Share"]) {
        await page.getByRole("tab", { name: label, exact: true }).click();
        const panel = page.locator('[role="tabpanel"]:visible');
        panelHeights.push(Math.round((await panel.boundingBox()).height));
        if (label !== "Idea") {
          assert.equal(await panel.locator("[data-journey-scene]").getAttribute("aria-hidden"), "true");
        }
      }
      assert.ok(Math.max(...panelHeights) - Math.min(...panelHeights) <= 2, panelHeights.join(", "));

      const layout = await page.evaluate(() => {
        const categories = [...document.querySelectorAll("[data-team-category]")].map((element) =>
          element.getAttribute("data-team-category")
        );
        const statement = document.querySelector("[data-about-intro-statement]");
        const explanation = document.querySelector("[data-about-intro-copy]");
        return {
          viewportWidth: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          teamCardCount: document.querySelectorAll("[data-team-card]").length,
          teamCategoryCount: new Set(categories).size,
          statementClipped: statement.scrollWidth > statement.clientWidth + 1,
          explanationClipped: explanation.scrollWidth > explanation.clientWidth + 1
        };
      });
      assert.equal(layout.horizontalOverflow, false);
      assert.equal(layout.teamCardCount, 9);
      assert.equal(layout.teamCategoryCount, 7);
      assert.equal(layout.statementClipped, false);
      assert.equal(layout.explanationClipped, false);
      assert.equal(errors.length, 0, errors.join("\n"));

      report.views.push({ theme, viewport, idleMetrics, panelHeights, layout, errors });
      await context.close();
    }
  }

  await writeFile(path.join(evidenceDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
});
