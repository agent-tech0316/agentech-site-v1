// Run against a local Next development server with its built-in developer preview.
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const origin = new URL(process.env.EAIC_HISTORY_ORIGIN ?? "http://127.0.0.1:3000");
assert.ok(["localhost", "127.0.0.1"].includes(origin.hostname));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
try {
  const page = await browser.newPage();
  const email = "history@example.test";
  await page.addInitScript(email => localStorage.setItem("agentechAccount", JSON.stringify({ email })), email);
  await page.route("**/api/account?*", route => route.fulfill({ json: {
    account: { email, first_name: "History", developer_latest_code_submission_id: "agentech-preview-approved" },
    accessProfiles: [{ id: 1, profile_type: "developer", username: "history" }]
  } }));
  await page.route("**/api/account/code-submissions", route => route.fulfill({ json: {
    submissions: ["agentech-preview-approved", "agentech-preview-hardware"].map(id => ({
      id, robot_model: "Aegies", code: "fixture", commands: [], physical_safety_status: "passed",
      ai_security_status: "passed", created_at: "2026-01-01T00:00:00Z"
    }))
  } }));
  for (const [id, command] of [
    ["agentech-preview-approved", "Agentech.forward("],
    ["agentech-preview-hardware", "Agentech.turn("]
  ]) {
    await page.goto(new URL("/account", origin).href);
    await page.getByRole("button", { name: /Code Reviews/i }).click();
    const link = page.locator(`a[href$="submissionId=${id}"]`);
    await link.click();
    const editor = page.getByRole("textbox", { name: "Python code submission editor" });
    await page.waitForFunction(({ command }) => document.querySelector("textarea[aria-label='Python code submission editor']")?.value.includes(command), { command });
    assert.equal(new URL(page.url()).searchParams.get("submissionId"), id);
    assert.match(await editor.inputValue(), new RegExp(command.replace("(", "\\(")));
    console.log("Account View opened", id);
  }
  const id = "agentech-preview-hardware";
  await page.goto(new URL(`/agentech-products/eaic-hub/physical-hardware-check?submissionId=${id}`, origin).href);
  await page.waitForURL(`**/software-check?submissionId=${id}`);
  await page.waitForFunction(() => document.querySelector("textarea[aria-label='Python code submission editor']")?.value.includes("Agentech.turn("));
  console.log("Legacy link retained the selected review");
} finally {
  await browser.close();
}
