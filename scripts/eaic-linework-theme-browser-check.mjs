import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const origin = process.env.EAIC_LINEWORK_BASE_URL ?? "http://127.0.0.1:3019";
const cdp = process.env.EAIC_LINEWORK_CDP_ORIGIN ?? "http://127.0.0.1:9233";
const artifacts = path.resolve(".codex-artifacts/eaic-linework-theme");
await mkdir(artifacts, { recursive: true });

const pages = await fetch(`${cdp}/json/list`).then((response) => response.json());
const target = pages.find((page) => page.type === "page");
assert.ok(target?.webSocketDebuggerUrl, "Start an isolated Chrome session on the EAIC linework CDP port");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 0;
const pending = new Map();
const exceptions = [];
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

async function waitUntil(expression) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${expression}`);
}

async function screenshot(clip) {
  const result = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
    ...(clip ? { clip } : {})
  });
  return Buffer.from(result.data, "base64");
}

async function lineworkState(width, label, expectedTheme) {
  await waitUntil(`document.documentElement.dataset.theme === ${JSON.stringify(expectedTheme)} && [...document.querySelectorAll('.eaic-public-hero-art img')].every(img => img.complete && img.naturalWidth > 0)`);
  const rect = await evaluate(`(() => {
    const art = document.querySelector('.eaic-public-hero-art');
    art.scrollIntoView({ block: 'center', behavior: 'instant' });
    const rect = art.getBoundingClientRect();
    return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height, scale: 1 };
  })()`);
  const clip = { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 };
  const artBuffer = await screenshot(clip);
  await writeFile(path.join(artifacts, `${width}-${label}.png`), await screenshot());
  await evaluate("document.querySelector('.eaic-public-hero-art').style.visibility = 'hidden'");
  const backgroundBuffer = await screenshot(clip);
  await evaluate("document.querySelector('.eaic-public-hero-art').style.removeProperty('visibility')");

  const art = await sharp(artBuffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const background = await sharp(backgroundBuffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const contrasts = [];
  const signedLuminance = [];
  for (let y = Math.ceil(art.info.height * 0.08); y < art.info.height * 0.78; y++) {
    for (let x = Math.ceil(art.info.width * 0.38); x < art.info.width * 0.88; x++) {
      const index = (y * art.info.width + x) * art.info.channels;
      const delta = Math.max(...[0, 1, 2].map((channel) => Math.abs(art.data[index + channel] - background.data[index + channel])));
      contrasts.push(delta);
      if (delta >= 20) {
        const luminance = (buffer) => 0.2126 * buffer[index] + 0.7152 * buffer[index + 1] + 0.0722 * buffer[index + 2];
        signedLuminance.push(luminance(art.data) - luminance(background.data));
      }
    }
  }
  contrasts.sort((a, b) => a - b);
  const contrast95 = contrasts[Math.floor((contrasts.length - 1) * 0.95)];
  const meanSignedLuminance = signedLuminance.reduce((sum, value) => sum + value, 0) / signedLuminance.length;
  assert.ok(contrast95 >= 30, `${width}px ${label}: linework contrast must remain visible (actual ${contrast95})`);
  if (expectedTheme === "dark") assert.ok(meanSignedLuminance >= 20, `${width}px ${label}: dark-theme linework must be lighter than its background`);
  else assert.ok(meanSignedLuminance <= -20, `${width}px ${label}: light-theme linework must be darker than its background`);
  return { width, label, theme: expectedTheme, contrast95, meanSignedLuminance: Math.round(meanSignedLuminance) };
}

async function selectTheme(label, expectedTheme) {
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('[role="radio"][aria-label=${JSON.stringify(label)}]')]
      .find((element) => element.getBoundingClientRect().width > 0);
    if (!button) throw new Error(${JSON.stringify(`${label} theme control was not found`)});
    button.click();
  })()`);
  await waitUntil(`document.documentElement.dataset.theme === ${JSON.stringify(expectedTheme)}`);
}

const report = [];
try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setEmulatedMedia", { features: [
    { name: "prefers-color-scheme", value: "dark" },
    { name: "prefers-reduced-motion", value: "reduce" }
  ] });

  for (const width of [1440, 768, 390]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width === 390 });
    await evaluate("localStorage.removeItem('agentech-theme')");
    const url = `${origin}/agentech-products/eaic?linework-check=${Date.now()}`;
    await send("Page.navigate", { url });
    await waitUntil(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete' && document.documentElement.dataset.themeMode === 'system' && document.documentElement.dataset.theme === 'dark'`);
    await evaluate("document.fonts.ready");
    report.push(await lineworkState(width, "system-dark", "dark"));

    await selectTheme("Light", "light");
    report.push(await lineworkState(width, "light-first", "light"));
    await selectTheme("Dark", "dark");
    report.push(await lineworkState(width, "dark-after-light", "dark"));
    await selectTheme("Light", "light");
    report.push(await lineworkState(width, "light-after-dark", "light"));
  }
  assert.deepEqual(exceptions, [], "The EAIC page should not raise browser runtime exceptions");
  console.log(JSON.stringify({ status: "passed", report, exceptions }, null, 2));
} finally {
  socket.close();
}
