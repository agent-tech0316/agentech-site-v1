import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const baseUrl = process.env.AGENTECH_GALAXY_BASE_URL ?? "http://127.0.0.1:3013/";
const cdpOrigin = process.env.AGENTECH_GALAXY_CDP_ORIGIN ?? "http://127.0.0.1:9232";
const artifactDir = path.resolve(process.cwd(), ".codex-artifacts");
mkdirSync(artifactDir, { recursive: true });

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class CdpClient {
  constructor(webSocketUrl) {
    this.nextId = 0;
    this.pending = new Map();
    this.exceptions = [];
    this.socket = new WebSocket(webSocketUrl);
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      if (message.method === "Runtime.exceptionThrown") {
        this.exceptions.push(message.params.exceptionDetails.text);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    }
    return response.result.value;
  }

  close() {
    this.socket.close();
  }
}

const tabs = await fetch(`${cdpOrigin}/json/list`).then((response) => response.json());
const page = tabs.find((tab) => tab.type === "page");
assert.ok(page?.webSocketDebuggerUrl, "A CDP page target is required");

const client = new CdpClient(page.webSocketDebuggerUrl);
await client.open();
await client.send("Page.enable");
await client.send("Runtime.enable");

async function setViewport(width, height, mobile = false) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 2,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
}

async function loadHome() {
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 8, y: 8, button: "none" });
  const url = new URL(baseUrl);
  url.searchParams.set("ui-check", String(Date.now()));
  await client.send("Page.navigate", { url: url.href });
  for (let attempt = 0; attempt < 240; attempt++) {
    const ready = await client.evaluate(`({
      ready: document.readyState,
      currentUrl: location.href,
      hasHero: Boolean(document.querySelector('[data-agentech-galaxy-hero]')),
      particleCount: document.querySelector('[data-agentech-galaxy-hero]')?.dataset.galaxyParticleCount ?? null,
      wordmarkReady: document.querySelector('[data-agentech-galaxy-hero]')?.dataset.galaxyWordmarkSource === 'brand-image'
    })`);
    if (ready.currentUrl === url.href && ready.ready === "complete" && ready.hasHero && ready.particleCount && ready.wordmarkReady) return;
    await wait(250);
  }
  throw new Error("Homepage did not become interactive");
}

async function inspect() {
  return client.evaluate(`(() => {
    const hero = document.querySelector('[data-agentech-galaxy-hero]');
    const layer = document.querySelector('[data-agentech-galaxy-interaction]');
    const canvas = hero?.querySelector('canvas');
    return {
      phase: hero?.dataset.galaxyPhase ?? null,
      progress: Number(hero?.dataset.galaxyProgress ?? -1),
      tier: hero?.dataset.galaxyPerformanceTier ?? null,
      particleCount: Number(hero?.dataset.galaxyParticleCount ?? -1),
      dpr: Number(hero?.dataset.galaxyDpr ?? -1),
      animationState: hero?.dataset.galaxyAnimationState ?? null,
      role: layer?.getAttribute('role') ?? null,
      tabIndex: layer?.tabIndex ?? -1,
      ariaHidden: layer?.getAttribute('aria-hidden') ?? null,
      touchAction: layer ? getComputedStyle(layer).touchAction : null,
      controls: document.querySelectorAll('[data-agentech-galaxy-controls], [data-agentech-galaxy-replay], [data-agentech-galaxy-reset]').length,
      wordmarkOpacity: Number(getComputedStyle(document.querySelector('[data-agentech-galaxy-content] img')).opacity),
      wordmarkTransform: getComputedStyle(document.querySelector('[data-agentech-galaxy-content] img')).transform,
      wordmarkSource: hero?.dataset.galaxyWordmarkSource ?? null,
      canvasScale: canvas ? Number((canvas.width / canvas.clientWidth).toFixed(2)) : 0,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      errorOverlay: Boolean(document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')),
      bodyTextLength: document.body.innerText.trim().length,
      theme: document.documentElement.dataset.theme ?? null
    };
  })()`);
}

async function screenshot(name) {
  const capture = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  writeFileSync(path.join(artifactDir, name), Buffer.from(capture.data, "base64"));
}

async function hoverMouse(width, screenshotName) {
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(width / 2), y: 310, button: "none" });
  await wait(600);
  const transforming = await inspect();
  await screenshot(screenshotName.replace('assembled', 'merging'));
  await wait(1_750);
  const assembled = await inspect();
  await screenshot(screenshotName);
  const resizedOpacity = await client.evaluate(`(() => {
    window.dispatchEvent(new Event('resize'));
    return Number(getComputedStyle(document.querySelector('[data-agentech-galaxy-wordmark]')).opacity);
  })()`);
  assert.equal(resizedOpacity, 0, 'resize must not flash the separate white logo before the next frame');
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(width / 2), y: 24, button: "none" });
  await wait(700);
  const releasing = await inspect();
  await wait(800);
  return { transforming, assembled, releasing, restored: await inspect() };
}

async function holdTouch(width, screenshotName) {
  const x = Math.round(width * 0.5);
  const y = 300;
  const touchPoint = (x) => [{ x, y, radiusX: 8, radiusY: 8, force: 1, id: 1 }];
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touchPoint(x) });
  await wait(600);
  const transforming = await inspect();
  await wait(1_750);
  const assembled = await inspect();
  await screenshot(screenshotName);
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await wait(1_500);
  return { transforming, assembled, restored: await inspect() };
}

async function measureFrameTiming(sampleCount = 45) {
  return client.evaluate(`new Promise((resolve) => {
    const samples = [];
    let previous = performance.now();
    const measure = (now) => {
      samples.push(now - previous);
      previous = now;
      if (samples.length < ${sampleCount}) requestAnimationFrame(measure);
      else {
        const sorted = [...samples].sort((a, b) => a - b);
        resolve({
          averageMs: Number((samples.reduce((sum, value) => sum + value, 0) / samples.length).toFixed(2)),
          p95Ms: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2))
        });
      }
    };
    requestAnimationFrame(measure);
  })`);
}

const report = {};

await setViewport(1440, 900);
await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
await loadHome();
const desktopInitial = await inspect();
assert.equal(desktopInitial.tier, "desktop");
assert.equal(desktopInitial.particleCount, 7_200);
assert.equal(desktopInitial.dpr, 1.75);
assert.equal(desktopInitial.canvasScale, 1.75);
assert.equal(desktopInitial.role, null);
assert.equal(desktopInitial.tabIndex, -1);
assert.equal(desktopInitial.ariaHidden, "true");
assert.equal(desktopInitial.touchAction, "pan-y");
assert.equal(desktopInitial.controls, 0);
assert.equal(desktopInitial.overflowX, 0);
assert.equal(desktopInitial.errorOverlay, false);
assert.equal(desktopInitial.wordmarkSource, "brand-image");
assert.equal(desktopInitial.wordmarkOpacity, 1);
assert.ok(desktopInitial.bodyTextLength > 0);
await screenshot("galaxy-1440-default.png");
await wait(3_000);
await screenshot("galaxy-1440-idle.png");

const desktopPointer = await hoverMouse(1440, "galaxy-1440-assembled.png");
assert.equal(desktopPointer.transforming.phase, "assembling");
assert.ok(desktopPointer.transforming.progress > 0.1 && desktopPointer.transforming.progress < 0.3);
assert.equal(desktopPointer.assembled.phase, "assembled");
assert.equal(desktopPointer.assembled.progress, 1);
assert.equal(desktopPointer.assembled.wordmarkOpacity, 0, 'the separate white logo must merge into the assembled particle wordmark');
assert.notEqual(desktopPointer.transforming.wordmarkTransform, desktopInitial.wordmarkTransform, 'the white logo must move toward the galaxy during assembly');
assert.equal(desktopPointer.releasing.phase, "releasing");
assert.ok(desktopPointer.releasing.progress > 0 && desktopPointer.releasing.progress < 1);
assert.equal(desktopPointer.restored.phase, "idle");
assert.equal(desktopPointer.restored.progress, 0);
assert.equal(desktopPointer.restored.wordmarkOpacity, 1, 'leaving the galaxy restores the original white logo');

const frameTiming = await measureFrameTiming();
await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await wait(250);
const pausedCanvasFrameTiming = await measureFrameTiming();
await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
await wait(250);
await client.send("Page.navigate", { url: "data:text/html,<title>RAF baseline</title><main>baseline</main>" });
await wait(250);
const blankFrameTiming = await measureFrameTiming();
report.desktop = {
  initial: desktopInitial,
  pointer: desktopPointer,
  frameTiming,
  pausedCanvasFrameTiming,
  blankFrameTiming,
};

await setViewport(768, 900);
await loadHome();
const tablet = await inspect();
assert.equal(tablet.tier, "tablet");
assert.equal(tablet.particleCount, 5_200);
assert.equal(tablet.overflowX, 0);
await client.evaluate(`document.documentElement.dataset.theme = 'light'`);
assert.equal((await inspect()).theme, "light");
await screenshot("galaxy-768-light.png");
await client.evaluate(`document.documentElement.dataset.theme = 'dark'`);
assert.equal((await inspect()).theme, "dark");
report.tablet = tablet;

await setViewport(688, 844);
await loadHome();
assert.equal((await inspect()).overflowX, 0);
await screenshot("galaxy-688-default.png");

for (const width of [430, 390]) {
  await setViewport(width, 844, true);
  await loadHome();
  const initial = await inspect();
  assert.equal(initial.tier, "phone");
  assert.equal(initial.particleCount, 3_600);
  assert.equal(initial.dpr, 2);
  assert.equal(initial.touchAction, "pan-y");
  assert.equal(initial.controls, 0);
  assert.equal(initial.overflowX, 0);
  await screenshot(`galaxy-${width}-default.png`);
  const touch = await holdTouch(width, `galaxy-${width}-assembled.png`);
  assert.equal(touch.transforming.phase, "assembling");
  assert.ok(touch.transforming.progress > 0.1 && touch.transforming.progress < 0.3);
  assert.equal(touch.assembled.phase, "assembled");
  assert.equal(touch.assembled.progress, 1);
  assert.equal(touch.assembled.wordmarkOpacity, 0);
  assert.equal(touch.restored.phase, "idle");
  assert.equal(touch.restored.progress, 0);
  assert.equal(touch.restored.wordmarkOpacity, 1);
  report[`phone${width}`] = { initial, touch };
}

await setViewport(430, 844, true);
await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await loadHome();
const reducedInitial = await inspect();
assert.equal(reducedInitial.tier, "reduced");
assert.equal(reducedInitial.particleCount, 2400);
assert.equal(reducedInitial.dpr, 1.5);
assert.equal(reducedInitial.animationState, "reduced");
await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 215, y: 300, radiusX: 8, radiusY: 8, force: 1, id: 1 }] });
await wait(80);
const reducedAssembled = await inspect();
await wait(700);
const reducedStable = await inspect();
assert.equal(reducedAssembled.phase, "reduced");
assert.equal(reducedAssembled.progress, 1);
assert.equal(reducedAssembled.wordmarkOpacity, 0);
assert.equal(reducedStable.progress, 1);
assert.equal(reducedStable.phase, "reduced");
await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await wait(80);
const reducedRestored = await inspect();
assert.equal(reducedRestored.progress, 0);
assert.equal(reducedRestored.wordmarkOpacity, 1);
report.reducedMotion = { initial: reducedInitial, assembled: reducedAssembled, stable: reducedStable, restored: reducedRestored };

await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
assert.deepEqual(client.exceptions, []);
client.close();

writeFileSync(path.join(artifactDir, "galaxy-browser-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  desktop: { particleCount: report.desktop.initial.particleCount, pointer: report.desktop.pointer.assembled.phase, frameTiming: report.desktop.frameTiming, pausedCanvasFrameTiming: report.desktop.pausedCanvasFrameTiming, blankFrameTiming: report.desktop.blankFrameTiming },
  tablet: report.tablet.tier,
  phones: [report.phone430.touch.assembled.phase, report.phone390.touch.assembled.phase],
  reduced: report.reducedMotion.stable.phase,
  exceptions: client.exceptions,
}, null, 2));
