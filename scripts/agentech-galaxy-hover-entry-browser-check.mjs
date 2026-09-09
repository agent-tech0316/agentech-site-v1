import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const baseUrl = process.env.AGENTECH_GALAXY_HOVER_BASE_URL ?? "http://127.0.0.1:3021/";
const cdpOrigin = process.env.AGENTECH_GALAXY_HOVER_CDP_ORIGIN ?? "http://127.0.0.1:9249";
const stage = process.env.AGENTECH_GALAXY_HOVER_STAGE ?? "after";
const artifactDir = path.resolve(process.cwd(), ".codex-artifacts/galaxy-hover-entry");
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
  url.searchParams.set("galaxy-hover-check", `${stage}-${label}-${Date.now()}`);
  await client.send("Page.navigate", { url: url.href });
  for (let attempt = 0; attempt < 240; attempt++) {
    const ready = await client.evaluate(`({
      ready: document.readyState,
      currentUrl: location.href,
      wordmarkReady: document.querySelector('[data-agentech-galaxy-hero]')?.dataset.galaxyWordmarkSource === 'brand-image'
    })`);
    if (ready.ready === "complete" && ready.currentUrl === url.href && ready.wordmarkReady) return;
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
    const width = heroRect.width;
    const height = heroRect.height;
    const isDesktop = width >= 768;
    const centerX = width * 0.5;
    const centerY = height * (width < 640 ? 0.31 : isDesktop ? 0.24 : 0.34);
    const scale = Math.min(width, height);
    const galaxyRx = isDesktop ? Math.max(width * 0.88, scale * 1.35) : width * 0.88;
    const galaxyRy = isDesktop ? Math.max(height * 0.29, scale * 0.3) : Math.min(height * 0.24, width * 0.24);
    const hitRx = Math.min(width * 0.46, galaxyRx * 0.55);
    const hitRy = Math.min(height * 0.25, galaxyRy * 0.72);
    const toClient = (point) => ({ x: heroRect.left + point.x, y: heroRect.top + point.y });
    return {
      phase: hero.dataset.galaxyPhase,
      progress: Number(hero.dataset.galaxyProgress),
      pointerIntent: hero.dataset.galaxyPointerIntent ?? null,
      galaxyArmed: hero.dataset.galaxyEntryArmed ?? null,
      hero: { left: heroRect.left, top: heroRect.top, right: heroRect.right, bottom: heroRect.bottom, width, height },
      wordmark: { left: wordmarkRect.left, top: wordmarkRect.top, right: wordmarkRect.right, bottom: wordmarkRect.bottom },
      points: {
        center: toClient({ x: centerX, y: centerY }),
        arm: toClient({ x: centerX + hitRx * 0.52, y: centerY + hitRy * 0.18 }),
        outside: toClient({ x: 36, y: Math.min(height - 28, centerY + hitRy + 210) })
      },
      touchAction: getComputedStyle(interaction).touchAction,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      errorOverlay: Boolean(document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay'))
    };
  })()`);
}

async function waitForPhase(phases, timeoutMs = 3_500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const state = await inspectPage();
    if (state && phases.includes(state.phase)) return state;
    await wait(50);
  }
  return inspectPage();
}

async function moveMouse(point) {
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: Math.round(point.x),
    y: Math.round(point.y),
    button: "none",
  });
}

function centerOf(rect) {
  return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
}

function pointInsideRect(point, rect) {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function validateAssembled(label, initial, assembled, failures) {
  if (pointInsideRect(initial.points.center, initial.wordmark) || pointInsideRect(initial.points.arm, initial.wordmark)) {
    failures.push(`${label}: galaxy test point overlaps the initial logo`);
  }
  if (assembled?.phase !== "assembled" || assembled?.progress !== 1) {
    failures.push(`${label}: galaxy hover did not reach the assembled state`);
  }
  if (assembled?.overflowX !== 0 || assembled?.errorOverlay) {
    failures.push(`${label}: overflow or framework error overlay detected`);
  }
}

const report = {};
const failures = [];

await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
await setViewport(1440, 900);
await loadHome("desktop-center");
await screenshot("1440-initial");
const desktopInitial = await inspectPage();
await moveMouse(desktopInitial.points.center);
const centerAssembled = await waitForPhase(["assembled"]);
await screenshot("1440-center-assembled");
validateAssembled("1440x900 center", desktopInitial, centerAssembled, failures);

await moveMouse(centerAssembled.points.arm);
await wait(220);
const releaseStarted = await inspectPage();
await moveMouse({ x: centerAssembled.points.arm.x + 3, y: centerAssembled.points.arm.y + 2 });
await wait(1_450);
const releaseIdle = await inspectPage();
await moveMouse({ x: centerAssembled.points.arm.x - 3, y: centerAssembled.points.arm.y - 2 });
await wait(180);
const heldIdleInGalaxy = await inspectPage();
await screenshot("1440-released-idle-in-galaxy");
if (releaseStarted?.phase !== "releasing" || releaseStarted?.progress >= 1) {
  failures.push("1440x900: leaving final text for the galaxy did not start release");
}
if (releaseIdle?.phase !== "idle" || releaseIdle?.progress !== 0) {
  failures.push("1440x900: release did not finish at the initial galaxy");
}
if (heldIdleInGalaxy?.phase !== "idle" || heldIdleInGalaxy?.progress !== 0) {
  failures.push("1440x900: pointer remaining inside the galaxy retriggered without a fresh entry");
}

await moveMouse(heldIdleInGalaxy.points.outside);
await wait(100);
const rearmedOutside = await inspectPage();
await moveMouse(rearmedOutside.points.center);
const reenteredGalaxy = await waitForPhase(["assembled"]);
await screenshot("1440-galaxy-reentered");
if (reenteredGalaxy?.phase !== "assembled" || reenteredGalaxy?.progress !== 1) {
  failures.push("1440x900: exiting and re-entering the galaxy did not reassemble");
}

await loadHome("desktop-arm");
const armInitial = await inspectPage();
await moveMouse(armInitial.points.arm);
const armAssembled = await waitForPhase(["assembled"]);
await screenshot("1440-arm-assembled");
validateAssembled("1440x900 arm", armInitial, armAssembled, failures);
await moveMouse(armAssembled.points.outside);
await wait(320);
const quickRelease = await inspectPage();
await moveMouse(centerOf(armAssembled.wordmark));
await wait(80);
const quickReverse = await inspectPage();
if (quickRelease?.phase !== "releasing" || quickRelease?.progress <= 0 || quickRelease?.progress >= 1) {
  failures.push("1440x900: quick release did not retain an intermediate progress");
}
if (quickReverse?.phase !== "assembling" || quickReverse?.progress <= 0 || quickReverse?.progress >= 1) {
  failures.push("1440x900: final wordmark re-entry did not reverse from the current progress");
}
report.desktop = {
  center: { initial: desktopInitial, assembled: centerAssembled },
  release: { started: releaseStarted, idle: releaseIdle, heldIdleInGalaxy, rearmedOutside, reenteredGalaxy },
  arm: { initial: armInitial, assembled: armAssembled, quickRelease, quickReverse },
};

await moveMouse(armAssembled.points.outside);
await wait(1_500);
await setViewport(768, 1024);
await wait(180);
const tabletInitial = await inspectPage();
await moveMouse(tabletInitial.points.center);
const tabletAssembled = await waitForPhase(["assembled"]);
await screenshot("768-resized-center-assembled");
validateAssembled("768x1024 resize center", tabletInitial, tabletAssembled, failures);
report.resizedTablet = { initial: tabletInitial, assembled: tabletAssembled };

await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await setViewport(1440, 900);
await loadHome("reduced");
const reducedInitial = await inspectPage();
await moveMouse(reducedInitial.points.center);
await wait(100);
const reducedAssembled = await inspectPage();
await moveMouse(reducedAssembled.points.arm);
await wait(100);
const reducedReleased = await inspectPage();
await moveMouse({ x: reducedAssembled.points.arm.x + 3, y: reducedAssembled.points.arm.y + 2 });
await wait(100);
const reducedHeld = await inspectPage();
if (reducedAssembled?.phase !== "reduced" || reducedAssembled?.progress !== 1) {
  failures.push("reduced-motion: galaxy hover did not assemble immediately");
}
if (reducedReleased?.phase !== "reduced" || reducedReleased?.progress !== 0) {
  failures.push("reduced-motion: leaving final text did not restore immediately");
}
if (reducedHeld?.progress !== 0) {
  failures.push("reduced-motion: remaining inside the galaxy retriggered without re-entry");
}
report.reducedMotion = { initial: reducedInitial, assembled: reducedAssembled, released: reducedReleased, held: reducedHeld };

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
if (phoneAssembled?.phase !== "assembled" || phoneAssembled?.progress !== 1) {
  failures.push("390x844 touch: press-and-hold did not assemble");
}
if (phoneReleased?.phase !== "releasing" || phoneReleased?.progress >= 1) {
  failures.push("390x844 touch: release did not restore the galaxy");
}
if (phoneReleased?.touchAction !== "pan-y") {
  failures.push(`390x844 touch: expected pan-y scrolling, got ${phoneReleased?.touchAction}`);
}
report.phone = { initial: phoneInitial, assembled: phoneAssembled, released: phoneReleased };

if (client.runtimeExceptions.length > 0) failures.push(`runtime exceptions: ${client.runtimeExceptions.join(" | ")}`);
if (client.consoleErrors.length > 0) failures.push(`console errors: ${client.consoleErrors.join(" | ")}`);
client.close();

const result = { stage, report, consoleErrors: client.consoleErrors, runtimeExceptions: client.runtimeExceptions, failures };
writeFileSync(path.join(artifactDir, `${stage}-report.json`), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
assert.deepEqual(failures, []);
