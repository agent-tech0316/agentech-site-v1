import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { after, test } from "node:test";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const baseUrl = process.env.LOGIN_PASSWORD_BASE_URL ?? "http://127.0.0.1:3114";
const evidenceDir = process.env.LOGIN_PASSWORD_EVIDENCE_DIR;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.AGENTECH_BROWSER_PATH ? { executablePath: process.env.AGENTECH_BROWSER_PATH } : {}),
});
after(() => browser.close());

for (const theme of ["light", "dark"]) {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    test(`sign-in password visibility preserves input and never submits (${theme}, ${viewport.width}px)`, async () => {
      const context = await browser.newContext({
        viewport,
        // Exercise the real login page without its localhost-only login bypass.
        extraHTTPHeaders: { "x-forwarded-host": "login-preview.agent-tech.test" },
      });
      try {
        const page = await context.newPage();
        const errors = [];
        const submissions = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error" && !message.text().includes("status of 401")) errors.push(message.text());
        });
        // Keep test credentials local; no real account or auth service is contacted.
        await page.route("**/api/auth/**", async (route) => {
          submissions.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
          await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Test sign-in rejected." }) });
        });
        await page.goto(`${baseUrl}/login?next=%2Faccount`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForLoadState("networkidle");
        await page.getByRole("button", { name: "Sign In", exact: true }).click();
        await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);

        const password = page.getByLabel("Password", { exact: true });
        const sample = "Demo-only-password!42";
        await page.getByLabel("Email", { exact: true }).fill("visibility-test@example.com");
        await password.fill(sample);
        assert.equal(await password.getAttribute("type"), "password");
        const show = page.getByRole("button", { name: "Show password", exact: true });
        assert.equal(await show.count(), 1, "sign-in must offer a password visibility button");
        await show.click();
        assert.equal(await password.getAttribute("type"), "text");
        assert.equal(await password.inputValue(), sample);
        assert.equal(await password.getAttribute("autocomplete"), "current-password");

        const hide = page.getByRole("button", { name: "Hide password", exact: true });
        const buttonBox = await hide.boundingBox();
        assert.ok(buttonBox.width >= 44 && buttonBox.height >= 44, "toggle must have a usable touch target");
        const inputBox = await password.boundingBox();
        assert.ok(buttonBox.x >= inputBox.x && buttonBox.x + buttonBox.width <= inputBox.x + inputBox.width, "toggle stays inside the password field");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "login should not overflow horizontally");
        if (evidenceDir) {
          await mkdir(evidenceDir, { recursive: true });
          await page.locator("[data-login-card]").screenshot({ path: path.join(evidenceDir, `password-${theme}-${viewport.width}.png`) });
        }

        await hide.press("Enter");
        assert.equal(await password.getAttribute("type"), "password");
        await show.press("Space");
        assert.equal(await password.getAttribute("type"), "text");
        assert.equal(await password.inputValue(), sample);
        assert.deepEqual(submissions, [], "clicking or keyboard-activating the toggle must not submit");

        await page.getByRole("button", { name: "Create Account", exact: true }).click();
        await page.getByRole("button", { name: "Sign In", exact: true }).click();
        assert.equal(await password.getAttribute("type"), "password", "returning to sign-in hides the password again");
        assert.equal(await password.inputValue(), "");

        await password.fill(sample);
        await show.click();
        await page.locator('form button[type="submit"]').click();
        await page.getByText("Test sign-in rejected.", { exact: true }).waitFor();
        assert.deepEqual(submissions, [{ path: "/api/auth/sign-in", body: { email: "visibility-test@example.com", password: sample } }]);
        assert.deepEqual(errors, [], "login should render without browser errors");
      } finally {
        await context.close();
      }
    });
  }
}
