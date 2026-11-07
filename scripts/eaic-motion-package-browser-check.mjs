// Local UI integration fixture. No cloud uploads or robot requests are made.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { inspectAssetContent } from "../lib/eaic-asset-content.ts";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const origin = process.env.EAIC_PACKAGE_ORIGIN ?? "http://127.0.0.1:3001";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
assert.ok(process.env.EAIC_HAPPY_DANCE_FIXTURE, "Set EAIC_HAPPY_DANCE_FIXTURE to the local ZIP");
const bytes = readFileSync(process.env.EAIC_HAPPY_DANCE_FIXTURE);
const content_manifest = inspectAssetContent(bytes, "Package", "ultra_example_kuaile.zip");
const output = process.env.EAIC_PACKAGE_QA_DIR;
if (output) mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.EAIC_BROWSER_CHANNEL ?? "msedge" });
try {
  for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(theme => localStorage.setItem("agentech-theme", theme), theme);
    let files = [], transferCount = 0;
    await page.route("**/api/agentech-code-submit*", route => route.fulfill({ json: {
      ok: true, fullReviewExempt: true, internalAccount: true, creditsRequired: 0,
      masterLiveTestAccess: true, latestSubmission: null,
    } }));
    await page.route("**/api/eaic-account-assets*", async route => {
      const request = route.request();
      if (request.method() === "GET") return route.fulfill({ json: { files, nextOffset: null } });
      const body = request.postDataJSON();
      if (body.action === "upload") {
        assert.equal(body.robotModel, "Master");
        return route.fulfill({ json: { url: origin + "/api/qa-package-upload", key: "fixture-key", kind: "Package" } });
      }
      assert.equal(body.action, "submit");
      const receipt = { id: "fixture-receipt", sha256: createHash("sha256").update(bytes).digest("hex"),
        byte_size: bytes.length, native_motion_name: "linkcraft_resource_onnx_ffkuaile_0.0.1", content_manifest };
      files = [{ key: "fixture-key", name: "ultra_example_kuaile.zip", kind: "Package", bytes: bytes.length, receipt }];
      return route.fulfill({ json: { receipt } });
    });
    await page.route("**/api/qa-package-upload", route => {
      assert.equal(route.request().method(), "PUT"); transferCount++;
      return route.fulfill({ status: 200, json: { ok: true } });
    });
    await page.goto(origin + "/agentech-products/eaic-hub/software-check");
    await page.getByRole("heading", { name: "File submissions" }).waitFor();
    await page.getByRole("region", { name: "Account-exempt submissions" }).getByRole("combobox").selectOption("Master");
    await page.getByLabel("Upload movement and audio package").setInputFiles(process.env.EAIC_HAPPY_DANCE_FIXTURE);
    const contents = page.locator("[data-asset-contents]");
    await contents.getByText("Movement · ONNX", { exact: true }).waitFor();
    assert.equal(await contents.getByText("policy.onnx", { exact: true }).count(), 1);
    assert.equal(await contents.getByText("audio.wav", { exact: true }).count(), 1);
    assert.match(await contents.innerText(), /65\.0 s/);
    assert.match(await contents.innerText(), /Movement and audio paired/);
    const foreground = await contents.getByText("Movement · ONNX", { exact: true }).evaluate(element => getComputedStyle(element).color);
    const rgb = foreground.match(/\d+/g).slice(0, 3).map(Number);
    assert.ok(theme === "dark" ? rgb.every(value => value > 200) : rgb.every(value => value < 80), `${theme} package text must contrast with its background: ${foreground}`);
    assert.equal(transferCount, 1);
    assert.equal(await page.getByRole("link", { name: "Schedule Happy Dance with audio", exact: true }).count(), 1);
    if (output) await contents.screenshot({ path: path.join(output, `eaic-package-${theme}.png`) });
    await page.reload();
    await page.locator("[data-asset-contents]").waitFor();
    assert.match(await page.locator("[data-asset-contents]").innerText(), /policy\.onnx/);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    if (output) await page.locator("[data-asset-contents]").screenshot({ path: path.join(output, `eaic-package-${theme}-mobile.png`) });
    assert.deepEqual(errors, []);
    console.log(`${theme}: original ZIP uploaded once; movement/audio shown; pairing restored after reload; mobile has no overflow; no page errors`);
    await page.close();
  }
} finally { await browser.close(); }
