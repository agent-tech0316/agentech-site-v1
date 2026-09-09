import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const baseUrl = process.env.AGENTECH_GALAXY_POINTER_BASE_URL ?? "http://127.0.0.1:3021/";
const cdpOrigin = process.env.AGENTECH_GALAXY_POINTER_CDP_ORIGIN ?? "http://127.0.0.1:9248";
const stage = process.env.AGENTECH_GALAXY_POINTER_STAGE ?? "after";
const artifactDir = path.resolve(process.cwd(), ".codex-artifacts/galaxy-pointer-exit");
mkdirSync(artifactDir, { recursive: true });

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class CdpClient {
  constructor(webSocketUrl) {
    this.nextId = 0;
    this.pending = new Map();
    this.runtimeExceptions = [];
    this.consoleErrors = [];
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
        this.runtimeExceptions.push(message.params.exceptionDetails.text);
      }
      if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
        this.consoleErrors.push(message.params.args.map((argument) => argument.value ?? argument.description ?? "").join(" "));
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

async function loadHome(label) {
  const url = new URL(baseUrl);
  url.searchParams.set("galaxy-pointer-check", `${stage}-${label}-${Date.now()}`);
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

async function inspectPage() {
  return client.evaluate(`(() => {
    const hero = document.querySelector('[data-agentech-galaxy-hero]');
    const wordmark = document.querySelector('[data-agentech-galaxy-wordmark]');
    const interaction = document.querySelector('[data-agentech-galaxy-interaction]');
    if (!(hero instanceof HTMLElement) || !(wordmark instanceof HTMLElement) || !(interaction instanceof HTMLElement)) return null;
    const heroRect = hero.getBoundingClientRect();
    const wordmarkRect = wordmark.getBoundingClientRect();
    return {
      phase: hero.dataset.galaxyPhase,
      progress: Number(hero.dataset.galaxyProgress),
      hero: { left: heroRect.left, top: heroRect.top, right: heroRect.right, bottom: heroRect.bottom },
      wordmark: { left: wordmarkRect.left, top: wordmarkRect.top, right: wordmarkRect.right, bottom: wordmarkRect.bottom },
      touchAction: getComputedStyle(interaction).touchAction,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      errorOverlay: Boolean(document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay'))
    };
  })()`);
}

async function waitForPhase(accepted, timeoutMs = 3_500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const state = await inspectPage();
    if (state && accepted.includes(state.phase)) return state;
    await wait(50);
  }
  return inspectPage();
}

async function moveMouse(x, y) {
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(x), y: Math.round(y), button: "none" });
}

function centerOf(rect) {
  return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
}

function blankPoint(state) {
  return { x: (state.hero.left + state.hero.right) / 2, y: state.hero.top + 24 };
}

async function exerciseMouse(label) {
  const initial = await inspectPage();
  assert.ok(initial, `${label}: homepage elements are required`);
  await moveMouse(...Object.values(centerOf(initial.wordmark)));
  const assembled = await waitForPhase(["assembled", "reduced"]);
  await screenshot(`${label}-assembled`);

  const outside = blankPoint(assembled);
  await moveMouse(outside.x, outside.y);
  await wait(180);
  const afterExit = await inspectPage();
  await wait(260);
  const releasing = await inspectPage();

  const finalWordmarkCenter = centerOf(assembled.wordmark);
  await moveMouse(finalWordmarkCenter.x, finalWordmarkCenter.y);
  const afterReenter = await inspectPage();
  await screenshot(`${label}-reentered`);
  await moveMouse(outside.x, outside.y);
  await wait(180);
  await screenshot(`${label}-releasing`);

  return { initial, assembled, outside, afterExit, releasing, afterReenter };
}

function validateMouse(label, result, failures, reducedMotion = false) {
  if (reducedMotion) {
    if (result.assembled?.phase !== "reduced" || result.assembled?.progress !== 1) {
      failures.push(`${label}: reduced-motion entry did not assemble immediately`);
    }
    if (result.afterExit?.phase !== "reduced" || result.afterExit?.progress !== 0) {
      failures.push(`${label}: reduced-motion blank-space exit did not restore immediately`);
    }
    return;
  }

  if (result.assembled?.phase !== "assembled" || result.assembled?.progress !== 1) {
    failures.push(`${label}: initial wordmark hover did not assemble`);
  }
  if (result.afterExit?.phase !== "releasing" || result.afterExit?.progress >= 1) {
    failures.push(`${label}: moving to blank hero space did not start release`);
  }
  if (result.releasing?.progress >= result.afterExit?.progress) {
    failures.push(`${label}: release did not continue smoothly`);
  }
  if (result.afterReenter?.phase !== "assembling") {
    failures.push(`${label}: re-entering final wordmark did not reverse to assembling`);
  }
  if (result.afterReenter?.progress <= 0 || result.afterReenter?.progress >= 1) {
    failures.push(`${label}: rapid reversal did not continue from an in-progress particle state`);
  }
  if (result.afterExit?.overflowX !== 0 || result.afterExit?.errorOverlay) {
    failures.push(`${label}: overflow or framework error overlay detected`);
  }
}

const report = {};
const failures = [];

await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
await setViewport(1440, 900);
await loadHome("desktop");
report.desktop = await exerciseMouse("1440");
validateMouse("1440x900", report.desktop, failures);

await moveMouse(4, 4);
await wait(1_500);
await setViewport(768, 1024);
await wait(180);
report.resizedTablet = await exerciseMouse("768-resized");
validateMouse("768x1024 resize", report.resizedTablet, failures);

await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await setViewport(1440, 900);
await loadHome("reduced");
report.reducedMotion = await exerciseMouse("1440-reduced");
validateMouse("1440x900 reduced motion", report.reducedMotion, failures, true);

await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
await setViewport(390, 844, true);
await loadHome("phone");
const phoneInitial = await inspectPage();
const phonePoint = centerOf(phoneInitial.wordmark);
await client.send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ ...phonePoint, radiusX: 8, radiusY: 8, force: 1, id: 1 }],
});
const phoneAssembled = await waitForPhase(["assembled"]);
await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await wait(180);
const phoneReleased = await inspectPage();
await screenshot("390-touch-released");
report.phone = { initial: phoneInitial, assembled: phoneAssembled, released: phoneReleased };
if (phoneAssembled?.phase !== "assembled" || phoneAssembled?.progress !== 1) {
  failures.push("390x844 touch: press-and-hold did not assemble");
}
if (phoneReleased?.phase !== "releasing" || phoneReleased?.progress >= 1) {
  failures.push("390x844 touch: release did not restore the galaxy");
}
if (phoneReleased?.touchAction !== "pan-y") {
  failures.push(`390x844 touch: expected pan-y scrolling, got ${phoneReleased?.touchAction}`);
}

if (client.runtimeExceptions.length > 0) failures.push(`runtime exceptions: ${client.runtimeExceptions.join(" | ")}`);
if (client.consoleErrors.length > 0) failures.push(`console errors: ${client.consoleErrors.join(" | ")}`);
client.close();

const result = { stage, report, consoleErrors: client.consoleErrors, runtimeExceptions: client.runtimeExceptions, failures };
writeFileSync(path.join(artifactDir, `${stage}-report.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
assert.deepEqual(failures, []);
