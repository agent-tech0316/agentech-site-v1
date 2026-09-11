import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const origin = process.env.AGENTECH_MY_WORKS_BASE_URL ?? "http://127.0.0.1:3005";
const cdp = process.env.AGENTECH_MY_WORKS_CDP_ORIGIN ?? "http://127.0.0.1:9237";
const artifacts = path.resolve(".codex-artifacts/my-works");
mkdirSync(artifacts, { recursive: true });
const browser = await chromium.connectOverCDP(cdp);
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const exceptions = [];
const uploads = [];
page.on("pageerror", (error) => exceptions.push(error.message));
page.on("request", (request) => {
  const url = new URL(request.url());
  // The shared site already sends analytics; project uploads must remain absent.
  if (["POST", "PUT", "PATCH"].includes(request.method()) && !url.pathname.includes("__nextjs") && !url.hostname.endsWith("google-analytics.com")) uploads.push(request.url());
});
await page.addInitScript(() => {
  window.__worksUrls = { created: [], revoked: [] };
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (blob) => { const url = create(blob); window.__worksUrls.created.push(url); return url; };
  URL.revokeObjectURL = (url) => { window.__worksUrls.revoked.push(url); revoke(url); };
});
const report = [];
let openDialogReport;
const cover = readFileSync(path.resolve("public/assets/eais-showcase/sort-at-sight-concept-v1.png"));
const form = page.locator("[data-my-works-form]");
async function chooseImage(name = "verification-cover.png") {
  await form.locator('input[type="file"]').setInputFiles({ name, mimeType: "image/png", buffer: cover });
  await form.locator('img[alt="Selected cover preview"]').waitFor();
}
async function addProject(title, fromEmptyState = false) {
  await page.locator(fromEmptyState ? "[data-my-works-empty] button" : "[data-my-works-add]").click();
  await chooseImage();
  if (fromEmptyState) {
    openDialogReport = await page.evaluate(() => {
      const dialog = document.querySelector("[data-my-works-form]");
      const rect = dialog.getBoundingClientRect();
      const drawer = document.querySelector("[data-site-mobile-drawer]");
      const drawerRect = drawer.getBoundingClientRect();
      window.scrollTo({ left: 320, behavior: "instant" });
      const attemptedScrollX = window.scrollX;
      window.scrollTo({ left: 0, behavior: "instant" });
      return {
        innerWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
        documentOverflowX: getComputedStyle(document.documentElement).overflowX,
        bodyOverflowX: getComputedStyle(document.body).overflowX,
        attemptedScrollX,
        closedDrawer: { x: drawerRect.x, right: drawerRect.right, width: drawerRect.width, ariaHidden: drawer.getAttribute("aria-hidden") },
        dialog: { open: dialog.open, x: rect.x, right: rect.right, width: rect.width, scrollWidth: dialog.scrollWidth, clientWidth: dialog.clientWidth }
      };
    });
    console.log(JSON.stringify({ openDialogReport }, null, 2));
    assert.equal(openDialogReport.innerWidth, 390);
    assert.equal(openDialogReport.documentScrollWidth, 390);
    assert.equal(openDialogReport.bodyClientWidth, 390);
    assert.equal(openDialogReport.attemptedScrollX, 0, "The closed shared drawer must not create horizontal page scrolling");
    assert.equal(openDialogReport.dialog.open, true);
    assert.ok(openDialogReport.dialog.x >= 0 && openDialogReport.dialog.right <= 390);
    assert.equal(openDialogReport.dialog.scrollWidth, openDialogReport.dialog.clientWidth);
    await page.screenshot({ path: path.join(artifacts, "form-390-dark-viewport.png"), fullPage: false });
  }
  await page.getByLabel("Project title", { exact: false }).fill(title);
  await page.getByLabel("Robot category").selectOption("Robot arm");
  await page.getByLabel("The project story", { exact: false }).fill("A locally previewed finished project. This browser test does not upload or publish it.");
  await page.getByRole("button", { name: "Add to this tab" }).click();
  await form.waitFor({ state: "hidden" });
}

async function checkFirstProjectFocus() {
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto(`${origin}/account/my-works?preview=1`);
  await page.locator("[data-my-works-empty]").waitFor();
  await page.getByRole("radio", { name: "Dark", exact: true }).click();
  await addProject("First project from the empty state", true);
  assert.equal(await page.locator("[data-my-works-empty]").count(), 0);
  await page.waitForFunction(() => document.activeElement === document.querySelector("[data-my-works-add]"), null, { timeout: 2000 });
  assert.equal(await page.locator("[data-my-works-add]").evaluate((button) => button === document.activeElement), true, "Adding the first project restores focus to the persistent header action");
}
async function checkView(width, theme, state) {
  await page.setViewportSize({ width, height: 1000 });
  await page.getByRole("radio", { name: theme === "light" ? "Light" : "Dark", exact: true }).click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const view = await page.evaluate(() => {
    const scope = document.querySelector("[data-my-works-page]");
    const title = scope.querySelector("h1");
    return {
      theme: document.documentElement.dataset.theme,
      overflow: document.documentElement.scrollWidth - innerWidth,
      background: getComputedStyle(scope).backgroundColor,
      titleFont: getComputedStyle(title).fontFamily,
      brokenImages: [...scope.querySelectorAll("img")].filter((image) => image.complete && !image.naturalWidth).length,
      addButtonHeight: scope.querySelector("[data-my-works-add]").getBoundingClientRect().height
    };
  });
  assert.equal(view.overflow, 0);
  assert.equal(view.theme, theme);
  assert.equal(view.background, theme === "light" ? "rgb(245, 244, 241)" : "rgb(8, 14, 24)");
  assert.match(view.titleFont, /Oxanium/i);
  assert.equal(view.brokenImages, 0);
  assert.ok(view.addButtonHeight >= 44);
  await page.screenshot({ path: path.join(artifacts, `${state}-${width}-${theme}.png`), fullPage: true });
  report.push({ width, state, ...view });
}
async function allUrlsReleased() {
  // Native dialog close events dispatch after the dialog becomes hidden.
  await page.waitForFunction(() => window.__worksUrls.created.every((url) => window.__worksUrls.revoked.includes(url)));
  const { created, revoked } = await page.evaluate(() => window.__worksUrls);
  assert.deepEqual([...new Set(revoked)].sort(), [...new Set(created)].sort());
  assert.equal(revoked.length, new Set(revoked).size, "Each URL is released once");
}

try {
  await checkFirstProjectFocus();
  if (process.env.AGENTECH_MY_WORKS_FOCUS_CHECK === "1") {
    writeFileSync(path.join(artifacts, "focus-dialog-report.json"), JSON.stringify({ openDialogReport, firstProjectFocus: "header action", exceptions, uploads }, null, 2));
    console.log(JSON.stringify({ firstProjectFocus: "passed", openDialogOverflow: "none", exceptions, uploads }, null, 2));
  } else {
  await page.goto(`${origin}/account/my-works`);
  await page.locator("[data-my-works-access-gate]").waitFor();
  assert.equal(await page.locator("[data-my-works-form]").count(), 0);
  await context.addCookies([{ name: "agentech_account_email", value: "untrusted%40example.com", url: origin }]);
  await page.reload();
  await page.locator("[data-my-works-access-gate]").waitFor();
  await context.clearCookies();

  await page.goto(`${origin}/account/my-works?preview=1`);
  await page.locator("[data-my-works-empty]").waitFor();
  assert.match(await page.locator("[data-my-works-page]").innerText(), /Local development preview/);
  for (const width of [1440, 768, 390]) {
    for (const theme of ["light", "dark"]) await checkView(width, theme, "empty");
  }

  await page.locator("[data-my-works-add]").click();
  await form.locator('input[type="file"]').setInputFiles({ name: "script.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  assert.match(await page.locator("[data-my-works-error]").innerText(), /JPG, PNG, WebP, or GIF/);
  assert.equal((await page.evaluate(() => window.__worksUrls.created)).length, 0);
  await form.locator('input[type="file"]').setInputFiles({ name: "invalid.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
  await page.getByText("This image could not be opened.", { exact: false }).waitFor();
  await chooseImage();
  await chooseImage("replacement.png");
  await page.screenshot({ path: path.join(artifacts, "form-390-dark.png"), fullPage: true });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await form.waitFor({ state: "hidden" });
  await allUrlsReleased();
  assert.equal(await page.locator("[data-my-works-add]").evaluate((button) => button === document.activeElement), true);

  await addProject("My robot sorting study");
  assert.equal(await page.locator("[data-my-works-card]").count(), 1);
  assert.match(await page.locator("[data-my-works-status]").innerText(), /has not been uploaded or published/);
  await page.getByRole("button", { name: "View project", exact: false }).click();
  await page.locator("[data-my-works-view][open]").waitFor();
  await page.keyboard.press("Escape");
  await page.locator("[data-my-works-view]").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Remove My robot sorting study", exact: true }).click();
  await page.locator("[data-my-works-empty]").waitFor();
  await allUrlsReleased();

  for (const title of ["Object sorting", "Motion study", "A finished robot project"]) await addProject(title);
  for (const width of [1440, 768, 390]) {
    for (const theme of ["light", "dark"]) await checkView(width, theme, "projects");
  }
  await page.evaluate(() => window.dispatchEvent(new Event("agentech-account-session-change")));
  await page.locator("[data-my-works-empty]").waitFor();
  await allUrlsReleased();
  await addProject("Refresh clears this project");
  await page.reload();
  await page.locator("[data-my-works-empty]").waitFor();
  assert.equal(await page.locator("[data-my-works-card]").count(), 0);
  await addProject("Leaving clears this project");
  await page.getByRole("link", { name: "Explore EAIS", exact: false }).click();
  await page.waitForURL("**/agentech-products/eais");
  await allUrlsReleased();
  assert.deepEqual(uploads, [], "The project prototype must not send uploads");
  assert.deepEqual(exceptions, []);
  writeFileSync(path.join(artifacts, "report.json"), JSON.stringify({ views: report, exceptions, uploads, interactions: "gate, legacy-cookie rejection, file rejection, image decode, replace, cancel, add, view, remove, session change, refresh, unmount" }, null, 2));
  console.log(JSON.stringify({ viewsPassed: report.length, exceptions, uploads, interactions: "all passed" }, null, 2));
  }
} catch (error) {
  console.error({ url: page.url(), exceptions, uploads });
  await page.screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
