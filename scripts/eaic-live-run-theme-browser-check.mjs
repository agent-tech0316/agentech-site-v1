import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const origin = new URL(process.env.EAIC_THEME_TEST_BASE_URL ?? "http://127.0.0.1:3001").origin;
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const hub = origin + "/agentech-products/eaic-hub";
const output = process.env.EAIC_LIVE_RUN_QA_DIR;
if (output) mkdirSync(output, { recursive: true });
const email = "live-theme@example.invalid";
const capture = {
  captureId: "fixture",
  createdAt: "2026-01-02T03:04:05Z",
  dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWBkAAAAASUVORK5CYII=",
};

function cardStyle(card) {
  const css = getComputedStyle(card);
  return [card.getBoundingClientRect().width, css.paddingLeft, css.borderRadius, css.backgroundColor];
}

async function assertSurface(element, theme, description) {
  const [background, foreground] = await element.evaluate(el => {
    const ctx = document.createElement("canvas").getContext("2d");
    const style = getComputedStyle(el);
    return [style.backgroundColor, style.color].map(color => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data);
    });
  });
  const [r, g, b, a] = background;
  assert.ok(a === 255 && (theme === "light" ? Math.min(r, g, b) > 200 : Math.max(r, g, b) < 80),
    `${description} should have a ${theme} surface, got rgba(${[r, g, b, a]})`);
  const luminance = rgb => {
    const [red, green, blue] = rgb.slice(0, 3).map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const [lo, hi] = [luminance(background), luminance(foreground)].sort((x, y) => x - y);
  assert.ok((hi + 0.05) / (lo + 0.05) >= 4.5, `${description} needs readable text in ${theme}`);
}

const browser = await chromium.launch({ channel: process.env.EAIC_BROWSER_CHANNEL ?? "msedge" });
try {
  for (const theme of ["light", "dark"]) {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme === "light" ? "dark" : "light" });
      let session = null;
      const errors = [];
      page.on("pageerror", error => errors.push(`${page.url()} ${error.stack ?? error.message}`));
      await page.addInitScript(({ theme, email }) => {
        localStorage.setItem("agentech-theme", theme);
        localStorage.setItem("agentechAccountEmail", email);
      }, { theme, email });
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.fulfill({ status: 204 });
        if (!url.pathname.startsWith("/api/")) return route.continue();
        const reads = {
          "/api/account": { account: { email }, accessProfiles: [{ profile_type: "developer" }], featureAccess: { hasProfiles: true } },
          "/api/master-heartbeat": { online: false },
          "/api/agentech-live-session": { active: Boolean(session), session },
          "/api/agentech-capture": { captures: [capture] },
          "/api/master-live-camera": { selection: { mode: "wall" } },
          "/api/livekit-token": { error: "Fixture has no video stream." },
        };
        if (route.request().method() !== "GET" || !Object.hasOwn(reads, url.pathname)) {
          errors.push(`Unexpected request: ${route.request().method()} ${url.pathname}`);
          return route.fulfill({ status: 404, json: {} });
        }
        return route.fulfill({ json: reads[url.pathname] });
      });

      await page.goto(hub + "/view-sdk");
      const reference = await page.locator("[data-eaic-task-card]").evaluate(cardStyle);
      await page.goto(hub + "/watch-live-run");
      await page.getByRole("link", { name: "Download image" }).waitFor();
      await assertSurface(page.getByText("No active robot session.", { exact: false }), theme, "Idle session status");
      const card = page.locator("[data-eaic-task-card]");
      assert.doesNotMatch(await card.innerText(), /Aegies/);
      assert.deepEqual(await card.evaluate(cardStyle), reference, `Live Run matches View SDK at ${width}px`);
      assert.ok(await card.getByRole("button", { name: "Waiting for Scheduled Time" }).isDisabled());
      await assertSurface(card.getByRole("region", { name: "Saved Aegis Captures" }), theme, "Capture archive");
      assert.equal(await card.getByRole("link", { name: "Schedule Time" }).getAttribute("href"), "/agentech-products/eaic-hub/schedule-time");
      const download = card.getByRole("link", { name: "Download image" });
      assert.equal(await download.getAttribute("href"), capture.dataUrl);
      assert.match(await download.getAttribute("download"), /\.png$/);
      if (output) await card.screenshot({ path: path.join(output, `live-run-${theme}-${width}.png`), animations: "disabled" });

      for (const robotModel of ["Aegies", "Navi", "Master"]) {
        session = { id: 7, robotModel, danceOutcome: "completed" };
        const displayName = robotModel === "Aegies" ? "Aegis" : robotModel;
        const status = card.getByText(displayName + " live session:", { exact: false });
        await status.waitFor();
        await assertSurface(status, theme, robotModel + " active status");
        assert.equal(await card.locator("video").first().evaluate(el => getComputedStyle(el.parentElement).backgroundColor), "rgb(0, 0, 0)");
        assert.equal(await card.getByRole("img", { name: "Latest image captured by Agentech.capture_image()" }).isVisible(), robotModel === "Aegies");
      }
      const result = card.getByText("Happy Dance completed · music played");
      await assertSurface(result, theme, "Completed result");
      await card.getByRole("button", { name: "Robot cameras" }).click();
      const controls = card.getByRole("region", { name: "Master camera view controls" });
      await assertSurface(controls, theme, "Master camera controls");
      assert.equal(await controls.getByRole("button", { name: "Camera Wall" }).getAttribute("aria-pressed"), "true");
      session = { ...session, danceOutcome: "failed" };
      await assertSurface(card.getByText("Happy Dance failed"), theme, "Failed result");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS ${theme}, ${width}px: card, idle, robot sessions, camera controls, capture archive and results`);
    }
  }
} finally {
  await browser.close();
}
