import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const origin = new URL(process.env.EAIC_THEME_TEST_BASE_URL ?? "http://127.0.0.1:3001");
assert.ok(["127.0.0.1", "localhost"].includes(origin.hostname));
const schedule = new URL("/agentech-products/eaic-hub/schedule-time", origin);
const email = "schedule-fixture@example.invalid";
const motionNames = ["Slow turn", "Arm wave", "Head turn", "Standing bow", "Two-arm wave", "Happy Dance", "Shoulder motion", "Happy Dance with bundled audio"];
const booked = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  session_title: motionNames[i],
  approved_run_type: "custom_code",
  created_at: new Date(Date.UTC(2026, 9, i+1)).toISOString(),
  scheduled_start: new Date(Date.UTC(2026, 10, 10-i)).toISOString(),
  body_booking_starts_automatically: i % 2 === 0,
  session_status: ["scheduled", "failed", "completed"][i % 3],
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
          "/api/eaic-account-assets": {file:{name:"Example.zip",receipt:{id:"fixture",content_manifest:{movement:{metadata:{}}}}}},
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
      await entries.first().waitFor();
      assert.equal(await entries.count(),3);
      const titles = () => page.locator("[data-booking-title]").allTextContents();
      assert.deepEqual(await titles(),motionNames.slice(5,8).reverse());
      if (process.env.EAIC_BOOKING_QA_DIR) {
        const {mkdir} = await import("node:fs/promises");
        const {join} = await import("node:path");
        await mkdir(process.env.EAIC_BOOKING_QA_DIR,{recursive:true});
        await page.locator('[data-schedule-panel="history"]').screenshot({path:join(process.env.EAIC_BOOKING_QA_DIR,`history-${theme}-${width}.png`)});
      }
      const previous = page.getByRole("button",{name:"View previous bookings"});
      await previous.click();
      assert.deepEqual(await titles(),motionNames.slice(2,5).reverse());
      await previous.click();
      assert.deepEqual(await titles(),motionNames.slice(0,2).reverse());
      await entries.first().locator("summary").first().click();
      assert.ok(await entries.first().getByText("View submitted code").isVisible());
      assert.equal(await page.getByRole("button",{name:"I’m ready at Master"}).count(),0);
      await page.getByRole("button",{name:"Newer bookings"}).click();
      await page.getByRole("button",{name:"Newer bookings"}).click();
      assert.deepEqual(await titles(),motionNames.slice(5,8).reverse());
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
