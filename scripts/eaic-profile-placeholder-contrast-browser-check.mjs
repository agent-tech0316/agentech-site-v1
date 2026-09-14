import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const browser = await chromium.connectOverCDP(process.env.EAIC_PROFILE_PLACEHOLDER_CDP ?? "http://127.0.0.1:9233");
const context = await browser.newContext();
const page = await context.newPage();
const origin = process.env.EAIC_PROFILE_PLACEHOLDER_ORIGIN ?? "http://127.0.0.1:3019";
const route = "/agentech-products/eaic-hub/view-sdk";
const artifacts = ".codex-artifacts/eaic-profile-placeholder-contrast";
const expectedSyntax = 'Agentech.squat_lateral(direction="left", speed_mps=x, duration_s=x)';
const errors = [];
const writes = [];
const report = [];

mkdirSync(artifacts, { recursive: true });
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error" && !/Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/.test(message.text())) {
    errors.push(`console: ${message.text()}`);
  }
});
page.on("request", (request) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && /\/api\//.test(request.url())) {
    writes.push(`${request.method()} ${request.url()}`);
  }
});

function channelToLinear(channel) {
  const normalized = channel / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb) {
  return 0.2126 * channelToLinear(rgb[0])
    + 0.7152 * channelToLinear(rgb[1])
    + 0.0722 * channelToLinear(rgb[2]);
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(color) {
  const channels = color.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
  assert.equal(channels?.length, 3, `expected an rgb color, received ${color}`);
  return channels;
}

try {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Aegis", exact: true }).click();
  await page.locator('details[data-sdk-category="Movement"] > summary').click();
  await page.locator('details[data-sdk-function-name="squat_lateral"] > summary').click();

  const profileCode = page.locator('details[data-sdk-function-name="squat_lateral"] [data-sdk-typeface="code"]')
    .filter({ hasText: expectedSyntax })
    .first();
  assert.equal((await profileCode.innerText()).trim(), expectedSyntax, "the SDK profile code must remain unchanged");

  for (const theme of ["light", "dark"]) {
    await page.getByRole("radio", { name: theme === "light" ? "Light" : "Dark", exact: true }).click();
    await page.waitForFunction((expectedTheme) => document.documentElement.dataset.theme === expectedTheme, theme);

    const placeholder = profileCode.locator('[data-sdk-profile-placeholder="true"], span[class*="text-[#4c1d95]"]').first();
    const styles = await placeholder.evaluate((element) => {
      const profile = element.closest('div[class*="bg-white"]');
      const code = element.parentElement;
      return {
        color: getComputedStyle(element).color,
        background: profile ? getComputedStyle(profile).backgroundColor : "",
        codeColor: code ? getComputedStyle(code).color : "",
      };
    });
    const contrast = contrastRatio(parseRgb(styles.color), parseRgb(styles.background));

    assert.equal(
      styles.color,
      theme === "light" ? "rgb(76, 29, 149)" : "rgb(196, 181, 253)",
      `${theme}: the profile placeholder must use the approved theme color`,
    );
    assert.equal(styles.codeColor, "rgb(0, 106, 92)", `${theme}: ordinary green profile code must remain unchanged`);
    assert.ok(contrast >= 4.5, `${theme}: placeholder contrast must be at least 4.5:1 (received ${contrast.toFixed(2)}:1)`);

    await profileCode.screenshot({
      path: `${artifacts}/1440-${theme}-squat-lateral-profile.png`,
      animations: "disabled",
    });
    report.push({ theme, ...styles, contrast: Number(contrast.toFixed(2)) });
  }

  assert.deepEqual(errors, [], "the profile contrast check must not produce runtime or console errors");
  assert.deepEqual(writes, [], "the profile contrast check must not call application write APIs");
  console.log(JSON.stringify({ status: "passed", route, expectedSyntax, report, errors, writes }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
