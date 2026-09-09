import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const origin = process.env.EAIS_PAGINATION_ORIGIN ?? "http://127.0.0.1:3005";
const artifactLabel = process.env.EAIS_PAGINATION_ARTIFACT_LABEL ?? "final";
const artifacts = `.codex-artifacts/eais-pagination/${artifactLabel}`;
mkdirSync(artifacts, { recursive: true });

const browser = await chromium.connectOverCDP(process.env.EAIS_PAGINATION_CDP ?? "http://127.0.0.1:9233");
const context = await browser.newContext();
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });

const report = { origin, route: "/agentech-products/eais", desktop: {}, phone: {}, pageErrors, consoleErrors };

async function openPage(width, height) {
  await page.setViewportSize({ width, height });
  const response = await page.goto(`${origin}/agentech-products/eais`, { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const mode = document.documentElement.dataset.themeMode;
    const selected = document.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute("aria-label")?.toLowerCase();
    return Boolean(mode && selected === mode);
  });
}

async function cardTitles() {
  return page.locator("[data-eais-work-list] [data-eais-work-card] strong").allTextContents();
}

async function summaryText() {
  return page.locator("[data-eais-pagination-summary]").innerText();
}

try {
  await openPage(1440, 1000);
  assert.equal(await page.locator("[data-eais-work-list]").count(), 1, "The page must expose one unambiguous full work list");
  assert.equal(await page.locator("[data-eais-pagination]").count(), 1, "The work list needs one pagination control");
  assert.equal(await page.locator("[data-eais-work-list]").getAttribute("data-eais-page-size"), "3");
  assert.deepEqual(await cardTitles(), ["Night Run Rover", "The Gesture Lab", "Trail Check"], "Featured works must lead page one in stable source order");
  assert.match(await summaryText(), /Showing 1–3 of 9 works/i);

  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await page.getByRole("button", { name: "Page 2", exact: true }).waitFor();
  assert.deepEqual(await cardTitles(), ["Sort at Sight", "Campus Carry", "Drone Chorus"], "Page two must continue the stable non-featured source order");
  assert.match(await summaryText(), /Showing 4–6 of 9 works/i);

  await page.getByRole("button", { name: "Page 3", exact: true }).click();
  assert.deepEqual(await cardTitles(), ["Build a Rover Day", "Before the First Move", "Walk Together"]);
  assert.match(await summaryText(), /Showing 7–9 of 9 works/i);

  const search = page.getByPlaceholder("Search an idea, robot, or scene");
  await search.fill("rover");
  await page.waitForFunction(() => document.querySelector("[data-eais-pagination]")?.getAttribute("data-current-page") === "1");
  assert.match(await summaryText(), /Showing 1–2 of 2 works/i, "Search must filter before pagination and show a truthful range");
  assert.deepEqual(await cardTitles(), ["Night Run Rover", "Build a Rover Day"]);

  await search.fill("");
  await page.getByRole("button", { name: "Page 2", exact: true }).click();
  await page.getByRole("tab", { name: "Humanoids", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-eais-pagination]")?.getAttribute("data-current-page") === "1");
  assert.match(await summaryText(), /Showing 1–2 of 2 works/i, "Category changes must reset to page one and show a truthful total");
  assert.deepEqual(await cardTitles(), ["The Gesture Lab", "Walk Together"]);

  await page.locator("[data-eais-work-card]").first().click();
  await page.locator("[data-eais-work-dialog][open]").waitFor();
  assert.equal(await page.locator("[data-eais-open-project]").count(), 1, "Paginated works must preserve the existing project-detail flow");
  await page.getByRole("button", { name: "Close work detail", exact: true }).click();
  await page.locator("[data-eais-work-dialog][open]").waitFor({ state: "detached" });

  await page.getByRole("tab", { name: "For You", exact: true }).click();
  await page.locator("[data-eais-featured-work]").screenshot({ path: `${artifacts}/1440-list.png` });
  report.desktop = { initialFeaturedOrder: ["Night Run Rover", "The Gesture Lab", "Trail Check"], totalWorks: 9, pageSize: 3, searchTotal: 2, humanoidTotal: 2, detailPreserved: true };

  await openPage(390, 844);
  const pagination = page.locator("[data-eais-pagination]");
  await pagination.scrollIntoViewIfNeeded();
  const targets = await pagination.locator("button").evaluateAll(buttons => buttons.map(button => ({
    width: button.getBoundingClientRect().width,
    height: button.getBoundingClientRect().height
  })));
  assert.ok(targets.length >= 5);
  assert.ok(targets.every(target => target.width >= 44 && target.height >= 44), "Every phone pagination target must be at least 44px");
  assert.ok(await pagination.evaluate(element => element.getBoundingClientRect().width <= innerWidth), "Phone pagination must stay compact");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, "Phone page must not overflow horizontally");
  await page.locator("[data-eais-featured-work]").screenshot({ path: `${artifacts}/390-list.png` });
  await page.evaluate(() => {
    const pagination = document.querySelector("[data-eais-pagination]");
    const template = pagination?.querySelector("[data-eais-page-number]");
    const pages = template?.parentElement;
    if (!pagination || !(template instanceof HTMLButtonElement) || !pages) throw new Error("Pagination fixture target is unavailable");
    const fixturePages = [1, 67, 68, 69, 136].map(number => {
      const button = template.cloneNode(true);
      button.textContent = String(number);
      button.setAttribute("aria-label", `Page ${number}`);
      button.removeAttribute("data-compact");
      if (number === 68) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
      return button;
    });
    pages.replaceChildren(...fixturePages);
    pagination.setAttribute("data-current-page", "68");
    pagination.setAttribute("data-total-pages", "136");
    pagination.querySelectorAll("button").forEach(button => { button.disabled = false; });
  });
  const scaleViews = [];
  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const scale = await pagination.evaluate(element => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      documentOverflow: document.documentElement.scrollWidth - innerWidth,
      targets: Array.from(element.querySelectorAll("button"), button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height }))
    }));
    assert.ok(scale.scrollWidth <= scale.clientWidth, `${width}px scale fixture: pagination must not overflow its own container`);
    assert.equal(scale.documentOverflow, 0, `${width}px scale fixture: pagination must not overflow the page`);
    assert.ok(scale.targets.every(target => target.width >= 44 && target.height >= 44), `${width}px scale fixture: targets must remain at least 44px`);
    scaleViews.push({ width, ...scale });
    await page.locator("[data-eais-pagination]").screenshot({ path: `${artifacts}/${width}-scale-pagination.png` });
  }
  report.phone = { targets, horizontalOverflow: 0, scaleViews };

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  report.status = "passed";
  writeFileSync(`${artifacts}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.status = "failed";
  report.error = error instanceof Error ? error.stack : String(error);
  writeFileSync(`${artifacts}/failure.json`, `${JSON.stringify(report, null, 2)}\n`);
  await page.screenshot({ path: `${artifacts}/failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
