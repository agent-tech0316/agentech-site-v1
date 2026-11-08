// Run against a local Next server. The signed account, saved program and receipt are read fixtures.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const origin = new URL(process.env.EAIC_PACKAGE_ORIGIN ?? "http://127.0.0.1:3001").origin;
assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
const output = process.env.EAIC_PACKAGE_QA_DIR;
if (output) mkdirSync(output, { recursive: true });
const dance = JSON.parse(readFileSync(new URL("./master-happy-dance.json", import.meta.url), "utf8"));
const email = "ui-fixture@example.invalid";
const program = {
  id: "local-program", robotModel: "Master", uploadedFileName: "program.py",
  code: 'from agentech import Agentech\n\nAgentech.heart("both")\nAgentech.shake_head(angle_degrees=5, cycles=2)',
  physicalSafetyStatus: "passed", aiSecurityStatus: "passed",
};
const receipt = {
  id: "local-receipt", sha256: dance.zip, native_motion_name: dance.motion,
  content_manifest: {
    movement: { path: "policy.onnx" },
    audio: { path: "audio.wav", durationSeconds: 65, sampleRateHz: 16000, channels: 1 },
    playback: { mode: "movement_with_audio" },
  },
};
const reads = {
  "/api/account": { account: { email }, accessProfiles: [{ profile_type: "developer" }], featureAccess: { hasProfiles: true } },
  "/api/agentech-code-submit": { fullReviewExempt: true, currentSubmissionId: program.id, latestSubmission: program },
  "/api/eaic-account-assets": { files: [{ key: "sample", name: "ultra_example_kuaile.zip", kind: "Package", receipt }], nextOffset: null },
};

function readColors(element, pseudo) {
  const style = getComputedStyle(element, pseudo);
  let background = style.backgroundColor;
  let opacity = Number(style.opacity);
  let parent = pseudo ? element : element.parentElement;
  while (parent) {
    const ancestor = getComputedStyle(parent);
    if (background === "rgba(0, 0, 0, 0)") background = ancestor.backgroundColor;
    opacity *= Number(ancestor.opacity);
    parent = parent.parentElement;
  }
  return { color: style.color, fill: style.webkitTextFillColor, background, opacity };
}

const black = "rgb(0, 0, 0)";
const white = "rgb(255, 255, 255)";
const failures = [];
const browser = await chromium.launch({ channel: process.env.EAIC_BROWSER_CHANNEL ?? "msedge" });
try {
  for (const theme of ["dark", "light"]) {
    for (const viewport of [{ width: 1920, height: 991 }, { width: 390, height: 844 }]) {
      // Deliberately disagree with the site. OS color preferences must never split the foreground/background pair.
      const page = await browser.newPage({ viewport, colorScheme: theme === "dark" ? "light" : "dark" });
      const scenario = `${theme}-${viewport.width}`;
      page.on("pageerror", error => failures.push(`${scenario}: ${error.message}`));
      page.on("console", message => { if (message.type() === "error") failures.push(`${scenario}: ${message.text()}`); });
      await page.addInitScript(({ theme, email }) => {
        localStorage.setItem("agentech-theme", theme);
        localStorage.setItem("agentechAccountEmail", email);
      }, { theme, email });
      await page.route("**/*", route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.fulfill({ status: 204 });
        if (!url.pathname.startsWith("/api/")) return route.continue();
        if (request.method() === "GET" && Object.hasOwn(reads, url.pathname)) {
          return route.fulfill({ json: reads[url.pathname] });
        }
        failures.push(`Unexpected API request: ${request.method()} ${url.pathname}`);
        return route.fulfill({ status: 404, json: {} });
      });

      await page.goto(origin + "/agentech-products/eaic-hub/software-check");
      const workspace = page.getByRole("region", { name: "Account-exempt submissions" });
      const editor = workspace.getByRole("textbox");
      const picker = workspace.locator('input[type="file"]').first();
      const saved = workspace.getByRole("button", { name: "Program saved", exact: true });
      const summary = workspace.locator("summary");
      await summary.waitFor();
      assert.equal(await saved.isDisabled(), true);
      assert.equal(await editor.inputValue(), program.code);
      assert.equal(await page.locator("html").getAttribute("data-theme"), theme);
      await page.locator(".agentech-library-page").evaluate(element => element.scrollIntoView({ behavior: "instant" }));
      if (output) {
        await page.screenshot({ path: path.join(output, `certification-${scenario}.png`), animations: "disabled" });
        if (viewport.width < 600) await workspace.screenshot({ path: path.join(output, `certification-${scenario}-workspace.png`) });
      }
      await summary.click();
      const samples = [
        ["task title", page.getByRole("heading", { name: "Code Certification" })],
        ["task introduction", page.getByText("Save a program for scheduling or upload a file to your account.")],
        ["program heading", workspace.getByRole("heading", { name: "Program for scheduling" })],
        ["exemption description", workspace.getByText("Your account automatically", { exact: false })],
        ["model label", workspace.locator("label").first()], ["model selector", workspace.getByRole("combobox")],
        ["file label", workspace.locator("label").nth(1)], ["file input name", picker],
        ["Choose File", picker, "::file-selector-button"],
        ["editor", editor], ["saved program", saved], ["time slot link", workspace.getByRole("link", { name: "Request Time Slot" })],
        ["submission heading", workspace.getByRole("heading", { name: "File submissions" })],
        ["package help", workspace.locator("[data-asset-zip-help]")], ["upload label", workspace.locator("label").last()],
        ["asset type", workspace.getByText("Package", { exact: true })], ["download", workspace.getByRole("button", { name: "ultra_example_kuaile.zip" })],
        ["schedule link", workspace.getByRole("link", { name: "Schedule Happy Dance with audio" })],
        ["manifest", workspace.locator("[data-asset-contents] dt").first()],
        ["manifest path", workspace.getByText("policy.onnx", { exact: true })],
        ["manifest note", workspace.getByText("File identification does not verify", { exact: false })],
        ["receipt summary", summary], ["receipt ID", workspace.getByText("ID: local-receipt")],
      ];
      async function checkColor(name, locator, pseudo) {
        const colors = await locator.evaluate(readColors, pseudo);
        if (colors.color !== white || colors.fill !== white || colors.background !== black || colors.opacity !== 1) {
          failures.push(`${scenario} ${name}: ${JSON.stringify(colors)}`);
        }
      }
      for (const [name, locator, pseudo] of samples) await checkColor(name, locator, pseudo);
      await editor.fill("");
      assert.equal(await editor.evaluate(element => element.matches(":placeholder-shown")), true);
      await checkColor("placeholder", editor, "::placeholder");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await editor.press("Shift+Tab");
      const focus = await page.locator(":focus-visible").evaluate(element => {
        const style = getComputedStyle(element);
        return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor };
      });
      if (focus.style === "none" || focus.width < 2 || focus.color !== white) failures.push(`${scenario} focus: ${JSON.stringify(focus)}`);
      // Hold a local file read so the real busy state can be inspected without submitting anything.
      await page.evaluate(() => {
        const read = File.prototype.text;
        File.prototype.text = async function () {
          File.prototype.text = read;
          await new Promise(resolve => { window.finishLocalRead = resolve; });
          return read.call(this);
        };
      });
      await picker.setInputFiles({ name: "sample.py", mimeType: "text/plain", buffer: Buffer.from("# local sample") });
      await workspace.getByText("Working…", { exact: true }).waitFor();
      for (const control of [picker, editor, workspace.getByRole("combobox")]) {
        assert.equal(await control.isDisabled(), true);
        await checkColor("disabled field", control);
      }
      await checkColor("disabled file picker button", picker, "::file-selector-button");
      await page.evaluate(() => window.finishLocalRead());
      await page.waitForFunction(() => document.querySelector("textarea").value === "# local sample");
      await checkColor("enabled save action", workspace.getByRole("button", { name: "Save program for scheduling" }));
      await page.close();
    }
  }
} finally { await browser.close(); }
assert.deepEqual(failures, [], "Signed-in Code Certification must render opaque white text on black, including native and disabled controls");
console.log("Verified white on black (21:1), keyboard focus and viewport width on desktop and mobile in both site themes.");
