// Local UI integration fixture. No cloud uploads or robot requests are made.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
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
    const receiptId = randomUUID();
    const email = "motion-user@example.invalid";
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(({theme,email}) => {
      localStorage.setItem("agentech-theme", theme);
      localStorage.setItem("agentechAccountEmail", email);
    },{theme,email});
    await page.route("**/api/account?*", route => route.fulfill({json:{
      account:{email,first_name:"Dance",last_name:"Fixture",credit_balance:10000},
      accessProfiles:[],
      featureAccess:{hasProfiles:true,accountOnly:false,lockedFeatures:[]},robotSessions:[]
    }}));
    await page.route("**/api/account/code-submissions", route => route.fulfill({json:{submissions:[]}}));
    await page.route("**/api/robot-slot*", route => route.fulfill({json: {ok:true,bookedSlots:[]}}));
    let files = [], transferCount = 0;
    await page.route("**/api/agentech-code-submit*", route => route.fulfill({ json: {
      ok: true, fullReviewExempt: false, internalAccount: false, creditsRequired: 0,
      masterLiveTestAccess: true, latestSubmission: null,
    } }));
    await page.route("**/api/eaic-account-assets*", async route => {
      const request = route.request();
      if (request.method() === "GET") {
        if (new URL(request.url()).searchParams.has("id")) return route.fulfill({json:{file:files[0]}});
        return route.fulfill({ json: { files, nextOffset: null } });
      }
      const body = request.postDataJSON();
      if (body.action === "upload") {
        assert.equal(body.robotModel, "Master");
        return route.fulfill({ json: { url: origin + "/api/qa-package-upload", key: "fixture-key", kind: "Package" } });
      }
      assert.equal(body.action, "submit");
      const receipt = { id: receiptId, sha256: createHash("sha256").update(bytes).digest("hex"),
        byte_size: bytes.length, approval_basis:"master-policy-contract-v1", native_motion_name:null, content_manifest };
      files = [{ key: "fixture-key", name: "ultra_example_kuaile.zip", kind: "Package", bytes: bytes.length, receipt }];
      return route.fulfill({ json: { receipt } });
    });
    await page.route("**/api/qa-package-upload", route => {
      assert.equal(route.request().method(), "PUT"); transferCount++;
      assert.ok(bytes.equals(route.request().postDataBuffer()), "The original ZIP must reach the upload endpoint intact");
      return route.fulfill({ status: 200, json: { ok: true } });
    });
    await page.goto(origin + "/agentech-products/eaic-hub/software-check");
    await page.getByRole("heading", { name: "File submissions" }).waitFor();
    await page.getByRole("region", { name: "Master motion uploads" }).waitFor();
    await page.getByLabel("Upload movement and audio package").setInputFiles(process.env.EAIC_HAPPY_DANCE_FIXTURE);
    const contents = page.locator("[data-asset-contents]");
    await contents.getByText("Movement · ONNX", { exact: true }).waitFor();
    assert.equal(await contents.getByText("policy.onnx", { exact: true }).count(), 1);
    assert.equal(await contents.getByText("audio.wav", { exact: true }).count(), 1);
    assert.match(await contents.innerText(), /65\.0 s/);
    assert.match(await contents.innerText(), /Movement and audio paired/);
    const foreground = await contents.getByText("Movement · ONNX", { exact: true }).evaluate(element => getComputedStyle(element).color);
    assert.equal(foreground, theme === "dark" ? "rgb(229, 237, 245)" : "rgb(17, 17, 17)", `${theme} package labels should use the EAIC title color`);
    assert.equal(transferCount, 1);
    assert.equal(await page.getByRole("link", { name: "Schedule this motion", exact: true }).count(), 1);
    if (output) await contents.screenshot({ path: path.join(output, `eaic-package-${theme}.png`) });
    await page.reload();
    await page.locator("[data-asset-contents]").waitFor();
    assert.match(await page.locator("[data-asset-contents]").innerText(), /policy\.onnx/);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    if (output) await page.locator("[data-asset-contents]").screenshot({ path: path.join(output, `eaic-package-${theme}-mobile.png`) });
    const schedule = page.getByRole("link", { name:"Schedule this motion", exact:true });
    const bookingPath = "/agentech-products/eaic-hub/schedule-time?nativeAssetId="+receiptId;
    assert.equal(await schedule.getAttribute("href"), bookingPath);
    await schedule.click();
    await page.waitForURL(origin+bookingPath);
    await page.getByRole("heading",{name:"New Slot Request"}).waitFor();
    const robot = page.getByLabel("Robot Model",{exact:false});
    assert.equal(await robot.inputValue(), "Master");
    const request = page.waitForRequest(r => new URL(r.url()).pathname === "/api/robot-slot" && r.method() === "POST");
    await page.getByRole("button", {name:"Request Robot Slot"}).click();
    const booking = (await request).postDataJSON();
    assert.equal(booking.nativeAssetId, receiptId);
    assert.equal(booking.robotModel, "Master");
    assert.equal(booking.email, email);
    assert.deepEqual(errors, []);
    console.log(`${theme}: original ZIP uploaded once, automatic policy/WAV pairing persisted, Master booking selected the same receipt`);
    await page.close();
  }
} finally { await browser.close(); }
