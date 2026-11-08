import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const origin = new URL(process.env.EAIC_THEME_TEST_BASE_URL ?? "http://127.0.0.1:3001");
assert.ok(["127.0.0.1", "localhost"].includes(origin.hostname));
const schedule = new URL("/agentech-products/eaic-hub/schedule-time", origin);
const email = "schedule-fixture@example.invalid";
const booked = [true, false].map((automatic, i) => ({
  id: i + 1,
  session_title: automatic ? "Automatic booking" : "Manual booking",
  body_booking_starts_automatically: automatic,
  session_status: "approved",
  code_submission_id: "master-body-fixture",
  robot_model: "Master",
  device_results: [],
}));

const browser = await chromium.launch({ channel: process.env.EAIC_BROWSER_CHANNEL ?? "msedge" });
try {
  for (const theme of ["light", "dark"]) {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.addInitScript(({ theme, email }) => {
        localStorage.setItem("agentech-theme", theme);
        localStorage.setItem("agentechAccountEmail", email);
      }, { theme, email });
      await page.route("**/*", route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin.origin) return route.abort();
        if (request.method() !== "GET") {
          errors.push(`Unexpected ${request.method()} ${url.pathname}`);
          return route.fulfill({ status: 405 });
        }
        if (!url.pathname.startsWith("/api/")) return route.continue();
        const fixtures = {
          "/api/account": {
            account: { email, first_name: "Schedule", last_name: "Fixture", credit_balance: 10000 },
            accessProfiles: [{ id: 1, username: "schedule", profile_type: "developer" }],
            robotSessions: booked,
          },
          "/api/account/code-submissions": { submissions: [] },
          "/api/robot-slot": { ok: true, bookedSlots: [] },
        };
        return route.fulfill({ json: fixtures[url.pathname] ?? {} });
      });

      await page.goto(schedule.href + "?nativeAssetId=fixture");
      const request = page.getByRole("button", { name: "Request Robot Slot" });
      await page.waitForFunction(() => document.querySelector("[data-schedule-panel=request] button")?.disabled === false);
      const form = page.locator("[data-schedule-panel=request]");
      const field = form.getByLabel(/Start Time/);
      assert.ok((await field.locator("option").count()) > 1);
      assert.deepEqual(await field.evaluate(el => {
        const css = getComputedStyle(el);
        return [css.backgroundColor, css.color];
      }), theme === "light" ? ["rgb(255, 255, 255)", "rgb(17, 17, 17)"] : ["rgb(13, 17, 23)", "rgb(229, 237, 245)"]);
      assert.equal(await form.evaluate(el => getComputedStyle(el).backgroundColor),
        theme === "light" ? "rgb(250, 249, 246)" : "rgb(17, 21, 27)");
      assert.doesNotMatch(await form.innerText(), /confirm your presence/i);
      const entries = page.locator("[data-schedule-session]");
      await entries.filter({ hasText: "Automatic booking" }).waitFor();
      const checkIn = { name: "I’m ready at Master" };
      assert.equal(await entries.filter({ hasText: "Automatic booking" }).getByRole("button", checkIn).count(), 0);
      assert.equal(await entries.filter({ hasText: "Manual booking" }).getByRole("button", checkIn).count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

      await page.goto(schedule.href);
      await form.getByText(/Custom live-code testing is locked/).waitFor();
      assert.equal(await request.isDisabled(), true);
      assert.deepEqual(errors, []);
      console.log(`Schedule Time passed at ${width}px in ${theme} mode.`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
