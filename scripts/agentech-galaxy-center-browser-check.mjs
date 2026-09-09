import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const baseUrl = process.env.AGENTECH_GALAXY_CENTER_BASE_URL ?? "http://127.0.0.1:3016/";
const cdpOrigin = process.env.AGENTECH_GALAXY_CENTER_CDP_ORIGIN ?? "http://127.0.0.1:9233";
const stage = process.env.AGENTECH_GALAXY_CENTER_STAGE ?? "after";
const artifactDir = path.resolve(process.cwd(), ".codex-artifacts/galaxy-center");
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
  const url = new URL(baseUrl);
  url.searchParams.set("galaxy-center-check", `${stage}-${Date.now()}`);
  await client.send("Page.navigate", { url: url.href });
  for (let attempt = 0; attempt < 240; attempt++) {
    const ready = await client.evaluate(`({
      ready: document.readyState,
      currentUrl: location.href,
      wordmarkReady: document.querySelector('[data-agentech-galaxy-hero]')?.dataset.galaxyWordmarkSource === 'brand-image'
    })`);
    if (ready.currentUrl === url.href && ready.ready === "complete" && ready.wordmarkReady) return;
    await wait(250);
  }
  throw new Error("Homepage did not become interactive");
}

async function screenshot(name) {
  const capture = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  writeFileSync(path.join(artifactDir, `${stage}-${name}.png`), Buffer.from(capture.data, "base64"));
}

async function measureWordmark() {
  return client.evaluate(`(() => {
    const hero = document.querySelector('[data-agentech-galaxy-hero]');
    const canvas = hero?.querySelector('canvas');
    const content = hero?.querySelector('[data-agentech-galaxy-content]');
    const bottom = content?.nextElementSibling;
    if (!hero || !canvas) return null;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const bottomHeight = bottom instanceof HTMLElement ? bottom.getBoundingClientRect().height : 0;
    const visualHeight = Math.max(0, height - bottomHeight);
    const expectedCenter = { x: width / 2, y: visualHeight / 2 };

    const sample = document.createElement('canvas');
    sample.width = width;
    sample.height = height;
    const sampleContext = sample.getContext('2d', { willReadFrequently: true });
    sampleContext.drawImage(canvas, 0, 0, width, height);
    const pixels = sampleContext.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let brightPixels = 0;

    for (let y = 0; y < visualHeight; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        if (Math.max(red, green, blue) < 150 || (red + green + blue) / 3 < 112) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        brightPixels += 1;
      }
    }

    const bounds = brightPixels > 0 ? { minX, minY, maxX, maxY } : null;
    const actualCenter = bounds
      ? { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
      : null;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      hero: { width, height, bottomHeight, visualHeight },
      expectedCenter,
      bounds,
      actualCenter,
      delta: actualCenter
        ? { x: actualCenter.x - expectedCenter.x, y: actualCenter.y - expectedCenter.y }
        : null,
      brightPixels,
      phase: hero.dataset.galaxyPhase,
      progress: Number(hero.dataset.galaxyProgress),
      dataCenter: {
        x: Number(hero.dataset.galaxyFormationCenterX ?? NaN),
        y: Number(hero.dataset.galaxyFormationCenterY ?? NaN),
        targetX: Number(hero.dataset.galaxyTargetCenterX ?? NaN),
        targetY: Number(hero.dataset.galaxyTargetCenterY ?? NaN)
      },
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      errorOverlay: Boolean(document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay'))
    };
  })()`);
}

async function assembleMouse() {
  const point = await client.evaluate(`(() => {
    const wordmark = document.querySelector('[data-agentech-galaxy-wordmark]');
    if (!(wordmark instanceof HTMLElement)) return null;
    const bounds = wordmark.getBoundingClientRect();
    return { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  })()`);
  assert.ok(point, "The initial wordmark pointer target is required");
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(point.x), y: Math.round(point.y), button: "none" });
  await wait(2_500);
}

async function assembleTouch(width) {
  const point = [{ x: Math.round(width / 2), y: 300, radiusX: 8, radiusY: 8, force: 1, id: 1 }];
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point });
  await wait(2_500);
}

function collectFailure(label, measurement, failures) {
  if (!measurement?.actualCenter) {
    failures.push(`${label}: no assembled particle bounds found`);
    return;
  }
  if (measurement.phase !== "assembled" && measurement.phase !== "reduced") {
    failures.push(`${label}: unexpected phase ${measurement.phase}`);
  }
  if (Math.abs(measurement.delta.x) > 6) {
    failures.push(`${label}: horizontal center delta ${measurement.delta.x}px`);
  }
  if (Math.abs(measurement.delta.y) > 8) {
    failures.push(`${label}: vertical center delta ${measurement.delta.y}px`);
  }
  if (measurement.overflowX !== 0) failures.push(`${label}: horizontal overflow ${measurement.overflowX}px`);
  if (measurement.errorOverlay) failures.push(`${label}: framework error overlay visible`);
}

const report = {};
const failures = [];

await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
await setViewport(1440, 900);
await loadHome();
await screenshot("1440-default");
await assembleMouse(1440);
report.desktop = await measureWordmark();
await screenshot("1440-assembled");
collectFailure("1440x900", report.desktop, failures);

await setViewport(768, 1024);
await wait(180);
await assembleMouse();
report.resizedTablet = await measureWordmark();
await screenshot("768-resized-assembled");
collectFailure("768x1024 resize", report.resizedTablet, failures);

await setViewport(390, 844, true);
await loadHome();
await screenshot("390-default");
await assembleTouch(390);
report.phone = await measureWordmark();
await screenshot("390-assembled");
collectFailure("390x844 touch", report.phone, failures);
await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await loadHome();
await assembleTouch(390);
report.reducedMotion = await measureWordmark();
await screenshot("390-reduced-assembled");
collectFailure("390x844 reduced motion", report.reducedMotion, failures);
await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
if (client.exceptions.length > 0) failures.push(`runtime exceptions: ${client.exceptions.join(" | ")}`);
client.close();

const result = { stage, report, failures };
writeFileSync(path.join(artifactDir, `${stage}-report.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
assert.deepEqual(failures, []);
