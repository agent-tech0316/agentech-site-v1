import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadTypeScriptModule } from "./test-utils/load-typescript-module.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const browser = await chromium.connectOverCDP(process.env.EAIC_SDK_EXPLORER_CDP ?? "http://127.0.0.1:9234");
const context = await browser.newContext();
const page = await context.newPage();
const origin = process.env.EAIC_SDK_EXPLORER_ORIGIN ?? "http://127.0.0.1:3290";
const route = "/agentech-products/eaic-hub/view-sdk";
const canonical = loadTypeScriptModule("features/eaic/02-unified-api/projects-validation/navi-sdk-reference.ts");
const explorerModel = loadTypeScriptModule("features/eaic/01-clients/eaic-hub/contracts/navi-sdk-explorer.ts");
const aegisCanonical = loadTypeScriptModule("features/eaic/02-unified-api/projects-validation/aegis-sdk-reference.ts");
const masterCanonical = loadTypeScriptModule("features/eaic/01-clients/eaic-hub/contracts/master-sdk-documentation.ts");
const errors = [];
const applicationWrites = [];
const matrixReport = [];
const observedRequests = [];
const browserReport = { route, baseSha: "72c1a4b32554f0f5628d05739f8bbcaa6a6673b1" };
let premiumGets = 0;
let premiumPosts = 0;

await page.addInitScript(() => {
  const NativeIntersectionObserver = window.IntersectionObserver;
  const stats = { created: 0, disconnected: 0, active: 0 };
  const onboardingWrites = [];
  const nativeSetItem = Storage.prototype.setItem;
  Object.defineProperty(window, "__naviObserverStats", { configurable: true, value: stats });
  Object.defineProperty(window, "__viewSdkOnboardingWrites", { configurable: true, value: onboardingWrites });
  Storage.prototype.setItem = function instrumentedSetItem(key, value) {
    if (key === "agentech:eaic:view-sdk-onboarding:v1") onboardingWrites.push(value);
    return nativeSetItem.call(this, key, value);
  };
  window.IntersectionObserver = class InstrumentedIntersectionObserver {
    constructor(callback, options) {
      this.nativeObserver = new NativeIntersectionObserver(callback, options);
      this.closed = false;
      stats.created += 1;
      stats.active += 1;
    }
    observe(target) { this.nativeObserver.observe(target); }
    unobserve(target) { this.nativeObserver.unobserve(target); }
    disconnect() {
      this.nativeObserver.disconnect();
      if (!this.closed) {
        this.closed = true;
        stats.disconnected += 1;
        stats.active -= 1;
      }
    }
    takeRecords() { return this.nativeObserver.takeRecords(); }
    get root() { return this.nativeObserver.root; }
    get rootMargin() { return this.nativeObserver.rootMargin; }
    get thresholds() { return this.nativeObserver.thresholds; }
  };
});

page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error" && !/Failed to load resource: the server responded with a status of 401/.test(message.text())) {
    errors.push(`console: ${message.text()}`);
  }
});
page.on("request", (request) => {
  observedRequests.push({ method: request.method(), resourceType: request.resourceType(), url: request.url() });
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && /\/api\//.test(request.url())) {
    applicationWrites.push(`${request.method()} ${request.url()}`);
  }
});

await page.route("**/api/premium-features/return-to-home", async (routeHandle) => {
  const method = routeHandle.request().method();
  if (method === "GET") premiumGets += 1;
  if (method === "POST") premiumPosts += 1;
  await routeHandle.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(method === "GET"
      ? { access: { allowed: false, source: "none" }, priceCents: 1234 }
      : { error: "Checkout intercepted by browser verification." }),
  });
});

async function openReference(name) {
  const row = page.locator(`[data-navi-reference-row][data-navi-reference-name="${name}"]`);
  await row.scrollIntoViewIfNeeded();
  await row.locator("[data-navi-reference-toggle]").click();
  await page.locator(`[data-navi-reference-detail][data-navi-reference-name="${name}"]`).waitFor();
}

async function closeOpenDetail() {
  await page.locator("[data-navi-mobile-back]").click();
  await page.locator("[data-navi-reference-detail]").waitFor({ state: "detached" });
}

async function runDetailScenario() {
  await page.goto(`${origin}${route}?robot=navi`, { waitUntil: "domcontentloaded" });
  assert.equal(new URL(page.url()).pathname, route);
  await page.locator('[data-navi-sdk-explorer][data-navi-hydrated="true"]').waitFor();

  const rows = page.locator("[data-navi-reference-row]");
  assert.equal(await rows.count(), 130, "Navi must render 130 lightweight canonical rows");
  assert.equal(await page.locator("[data-navi-reference-detail]").count(), 0);
  await openReference("lateral");

  const detail = page.locator('[data-navi-reference-detail][data-navi-reference-name="lateral"]');
  assert.equal(await page.locator("[data-navi-reference-detail]").count(), 1);
  assert.deepEqual(await detail.locator("[data-navi-detail-section]").evaluateAll((nodes) => nodes.filter((node) => {
    const style = getComputedStyle(node);
    return style.display !== "none" && style.visibility !== "hidden";
  }).map((node) => node.getAttribute("data-navi-detail-section"))), [
    "signature",
    "availability",
    "definition",
    "profiles",
    "parameters",
    "returns",
    "example",
    "safety",
    "media",
  ]);
  assert.match(await detail.locator('[data-navi-detail-section="returns"]').innerText(), /Not documented in the current public reference\./);
  assert.match(await detail.locator('[data-navi-detail-section="example"]').innerText(), /Agentech\.lateral_left\(speed_mps=0\.5, duration_s=1\.0\)/);

  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async () => undefined },
  }));
  await detail.getByRole("button", { name: "Copy example" }).click();
  await assert.doesNotReject(() => detail.getByText("Code copied.", { exact: true }).waitFor());

  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async () => { throw new Error("forced clipboard failure"); } },
  }));
  await detail.getByRole("button", { name: "Copy example" }).click();
  await assert.doesNotReject(() => detail.getByText("Copy failed. Select and copy the code manually.", { exact: true }).waitFor());

  const bodyText = await detail.innerText();
  assert.doesNotMatch(bodyText, /Live verified|controller error=0|connect_kwargs|navi_return_to_home|featureCode/i);
  assert.equal(premiumGets, 0, "normal details must not request premium status");
  assert.equal(premiumPosts, 0);
  assert.deepEqual(applicationWrites, []);

  await closeOpenDetail();
  await openReference("return_to_home");
  await page.waitForFunction(() => document.querySelector('[data-navi-reference-detail][data-navi-reference-name="return_to_home"] [data-navi-premium-panel]'));
  assert.equal(premiumGets, 1);
  assert.equal(premiumPosts, 0);
  const premiumDetail = page.locator('[data-navi-reference-detail][data-navi-reference-name="return_to_home"]');
  await premiumDetail.getByRole("button", { name: "Unlock for $12.34" }).click();
  await page.waitForTimeout(50);
  assert.equal(premiumPosts, 1, "only the explicitly activated intercepted purchase may POST");
  assert.equal(applicationWrites.length, 1);
  assert.match(applicationWrites[0], /^POST .*\/api\/premium-features\/return-to-home$/);
}

async function selectNavi() {
  await page.goto(`${origin}${route}?robot=navi`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-navi-sdk-explorer][data-navi-hydrated="true"]').waitFor();
}

async function runOnboardingDetailEvidenceScenario() {
  await page.goto(`${origin}${route}?robot=navi`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.removeItem("agentech:eaic:view-sdk-onboarding:v1"));
  await page.goto(`${origin}${route}?robot=navi&ref=stand`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-navi-sdk-explorer][data-navi-hydrated="true"]').waitFor();
  await page.locator('[data-navi-reference-detail][data-navi-reference-name="stand"]').waitFor();
  assert.equal(await page.evaluate(() => window.__viewSdkOnboardingWrites.length), 0, "direct ref hydration must report zero detail evidence writes");

  const standToggle = page.locator('[data-navi-reference-row][data-navi-reference-name="stand"] [data-navi-reference-toggle]');
  await standToggle.click();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("ref"));
  assert.equal(await page.evaluate(() => window.__viewSdkOnboardingWrites.length), 0, "explicit close must report zero detail evidence writes");

  await standToggle.click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("ref") === "stand");
  assert.equal(await page.evaluate(() => window.__viewSdkOnboardingWrites.length), 1, "explicit reopen must report exactly one detail evidence write");
  const coach = page.locator("[data-eaic-sdk-onboarding-coach]");
  if (await coach.isVisible()) await coach.getByRole("button", { name: "Skip", exact: true }).click();
  return { hydrationReports: 0, closeReports: 0, reopenReports: 1 };
}

async function runExplorerScenario() {
  await selectNavi();
  const explorer = page.locator("[data-navi-sdk-explorer]");
  const rows = page.locator("[data-navi-reference-row]");
  assert.equal(await page.locator('[data-navi-explorer-title]').innerText(), "Start with a task, then inspect one exact reference.");
  assert.equal(await page.locator('[data-navi-result-count]').innerText(), "130 Navi references");
  assert.equal(await explorer.locator('[data-navi-search-controls]').count(), 1);
  assert.equal(await explorer.locator('[data-navi-category-filters]').count(), 1);
  assert.equal(await explorer.evaluate((element) => {
    const search = element.querySelector('[data-navi-search-input]');
    const filters = element.querySelector('[data-navi-category-filters]');
    const count = element.querySelector('[data-navi-result-count]');
    return Boolean(search && filters && count && (search.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING) && (filters.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING));
  }), true, "search, filters, and dynamic count must appear in task-first order");
  assert.deepEqual(await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-navi-reference-name"))), canonical.naviFunctions.map((item) => item.name));
  assert.equal(new Set(await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-navi-reference-name")))).size, 130);
  assert.equal(await page.locator("[data-navi-reference-detail]").count(), 0);
  assert.equal(await page.locator("[data-navi-detail-placeholder]").count(), 1, "desktop starts with a neutral detail prompt");
  assert.equal(await rows.locator("[data-navi-reference-detail]").count(), 0, "detail DOM must never be nested inside an index row");
  assert.equal(await page.locator("[data-navi-preview-media]").count(), 0);
  assert.equal(premiumGets, 0);
  assert.deepEqual(applicationWrites, []);

  const categoryButtons = page.locator("[data-navi-category-filter]");
  assert.deepEqual(await categoryButtons.evaluateAll((nodes) => nodes.map((node) => [
    node.getAttribute("data-navi-category-filter"),
    Number(node.getAttribute("data-navi-category-count")),
  ])), [
    ["All", 130], ["Movement", 6], ["Athletics", 6], ["Actions", 92], ["Posture", 13],
    ["Configuration", 6], ["Safety", 2], ["Sensing", 5],
  ]);
  assert.deepEqual(await page.locator("[data-navi-quick-start-primary] [data-navi-common-task]").evaluateAll((nodes) => nodes.map((node) => [
    node.getAttribute("data-navi-common-task"),
    node.querySelector("[data-navi-common-task-label]")?.textContent?.trim(),
  ])), [
    ["stand", "Get Navi ready in a standing state"],
    ["forward", "Move forward"],
    ["turn", "Turn left or right"],
  ]);
  const moreTasks = page.locator("[data-navi-more-tasks-toggle]");
  assert.equal(await moreTasks.getAttribute("aria-expanded"), "false");
  assert.equal(await page.locator("[data-navi-quick-start-secondary]").count(), 0);
  const urlBeforeMore = page.url();
  await moreTasks.click();
  assert.equal(await moreTasks.getAttribute("aria-expanded"), "true");
  assert.equal(page.url(), urlBeforeMore, "opening More tasks must not mutate URL state");
  assert.deepEqual(await page.locator("[data-navi-quick-start-secondary] [data-navi-common-task]").evaluateAll((nodes) => nodes.map((node) => [
    node.getAttribute("data-navi-common-task"),
    node.querySelector("[data-navi-common-task-label]")?.textContent?.trim(),
  ])), [
    ["sit", "Sit and return to standing automatically"],
    ["stop", "Stop walking or turning"],
    ["get_battery_status", "View battery status"],
  ]);
  await page.locator('[data-navi-quick-start-secondary] [data-navi-common-task="get_battery_status"]').click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("ref") === "get_battery_status");
  assert.equal(await page.locator('[data-navi-reference-row][data-navi-reference-name="get_battery_status"] [data-navi-reference-selected="true"]').count(), 1);
  assert.equal(await page.locator('[data-navi-reference-detail][data-navi-reference-name="get_battery_status"]').count(), 1);
  assert.equal(await page.locator("[data-navi-reference-detail]").count(), 1, "desktop master-detail keeps exactly one detail instance");
  await closeOpenDetail();
  await moreTasks.click();
  assert.equal(await moreTasks.getAttribute("aria-expanded"), "false");
  assert.equal(page.url(), urlBeforeMore, "closing More tasks must not mutate URL state");

  const search = page.locator("[data-navi-search-input]");
  const searchCases = [
    ["return_to_home", "return_to_home"],
    ["lateral_right", "lateral"],
    ["standing state ready", "stand"],
    ["auto return to stand", "sit"],
    ["facing_angle_deg", "return_to_home"],
    ["Face backward", "return_to_home"],
    ["robot advertised range", "set_gait"],
    ["battery = Agentech.get_battery_status()", "get_battery_status"],
    ["standing ready", "stand"],
    ["turn", "turn"],
  ];
  for (const [query, expectedFirst] of searchCases) {
    await search.fill(query);
    await page.waitForFunction((expected) => new URL(location.href).searchParams.get("q") === expected, query);
    assert.equal(await rows.first().getAttribute("data-navi-reference-name"), expectedFirst, query);
  }

  await search.fill("view battery status");
  await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "view battery status");
  assert.equal(await page.locator('[data-navi-category-filter="All"]').getAttribute("data-navi-category-count"), "1");
  assert.equal(await page.locator('[data-navi-category-filter="Sensing"]').getAttribute("data-navi-category-count"), "1");
  await search.fill("turn");
  await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "turn");
  await page.locator('[data-navi-category-filter="Movement"]').click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("category") === "movement");
  assert.ok((await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-navi-reference-category")))).every((category) => category === "Movement"));

  await search.fill("no-match-sentinel");
  await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "no-match-sentinel");
  await page.locator('[data-navi-category-filter="Actions"]').click();
  await page.getByText('No Navi references match “no-match-sentinel” in Actions.', { exact: true }).waitFor();
  await page.locator('[data-navi-empty-state]').getByRole("button", { name: "Clear search" }).click();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("q"));
  assert.equal(await search.inputValue(), "");
  await page.getByRole("button", { name: "Show all categories" }).click();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("category"));
  assert.equal(await rows.count(), 130);

  await search.fill("sentinel");
  await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "sentinel");
  await page.locator('[data-navi-category-filter="Safety"]').click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("category") === "safety");
  await page.locator('[data-navi-common-task="turn"]').click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("ref") === "turn" && !new URL(location.href).searchParams.has("q") && !new URL(location.href).searchParams.has("category"));
  assert.equal(await search.inputValue(), "");
  assert.equal(await page.locator('[data-navi-category-filter="All"]').getAttribute("aria-pressed"), "true");
  assert.equal(await rows.count(), 130);
  assert.equal(await page.locator('[data-navi-reference-detail][data-navi-reference-name="turn"]').count(), 1);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-navi-reference-toggle")), "true");

  await page.locator('[data-navi-reference-row][data-navi-reference-name="stand"] [data-navi-reference-toggle]').click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("ref") === "stand");
  assert.equal(await page.locator("[data-navi-reference-detail]").count(), 1);
  assert.equal(await page.locator('[data-navi-reference-detail][data-navi-reference-name="turn"]').count(), 0);
  const standToggle = page.locator('[data-navi-reference-row][data-navi-reference-name="stand"] [data-navi-reference-toggle]');
  await standToggle.click();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("ref"));
  assert.equal(await page.locator("[data-navi-reference-detail]").count(), 0);
  await standToggle.click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("ref") === "stand");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("ref"));
  assert.equal(await page.locator("[data-navi-reference-detail]").count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.closest("[data-navi-reference-row]")?.getAttribute("data-navi-reference-name")), "stand");

  await standToggle.click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("ref") === "stand");
  await page.locator('[data-navi-category-filter="Movement"]').click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("category") === "movement");
  assert.equal(await page.locator("[data-navi-reference-detail]").count(), 0, "filtering out the open row must unmount its detail");
}

function urlState() {
  const current = new URL(page.url());
  return {
    pathname: current.pathname,
    robot: current.searchParams.get("robot"),
    query: current.searchParams.get("q"),
    category: current.searchParams.get("category"),
    reference: current.searchParams.get("ref"),
    source: current.searchParams.get("utm_source"),
  };
}

async function assertNaviState({ query = "", category = "All", reference = null } = {}) {
  await page.locator('[data-navi-sdk-explorer][data-navi-hydrated="true"]').waitFor();
  assert.equal(await page.locator("[data-navi-search-input]").inputValue(), query);
  assert.equal(await page.locator(`[data-navi-category-filter="${category}"]`).getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator("[data-navi-reference-detail]").count(), reference ? 1 : 0);
  if (reference) {
    assert.equal(await page.locator("[data-navi-reference-detail]").getAttribute("data-navi-reference-name"), reference);
  }
}

async function assertLegacyRobot(robot, expectedNames) {
  await page.getByRole("button", { name: robot, exact: true }).click();
  const rows = page.locator("[data-sdk-function-name]");
  assert.deepEqual(
    await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-sdk-function-name"))),
    expectedNames,
  );
  const firstCategory = page.locator("[data-sdk-category]").first();
  await firstCategory.locator(":scope > summary").click();
  const first = firstCategory.locator("[data-sdk-function-name]").first();
  assert.equal(await first.getAttribute("open"), null);
  await first.locator(":scope > summary").click();
  assert.equal(await first.getAttribute("open"), "");
  await first.locator(":scope > summary").click();
  assert.equal(await first.getAttribute("open"), null);
}

function namesInCategoryOrder(items, categories) {
  return categories.flatMap((category) => items.filter((item) => item.category === category).map((item) => item.name));
}

async function runUrlScenario() {
  await page.goto(`${origin}${route}?robot=navi&q=turn&category=movement&ref=turn&utm_source=docs`, { waitUntil: "domcontentloaded" });
  await assertNaviState({ query: "turn", category: "Movement", reference: "turn" });
  assert.deepEqual(urlState(), {
    pathname: route, robot: "navi", query: "turn", category: "movement", reference: "turn", source: "docs",
  });

  const search = page.locator("[data-navi-search-input]");
  const historyBeforeTyping = await page.evaluate(() => history.length);
  await search.fill("stand");
  await page.waitForTimeout(80);
  assert.equal(new URL(page.url()).searchParams.get("q"), "turn", "typing must not update the URL before 150 ms");
  await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "stand");
  assert.equal(new URL(page.url()).searchParams.get("q"), "stand");
  assert.equal(await page.evaluate(() => history.length), historyBeforeTyping, "typing must replace the current entry");

  const historyBeforeCategory = await page.evaluate(() => history.length);
  await page.locator('[data-navi-category-filter="Posture"]').click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("category") === "posture");
  assert.equal(await page.evaluate(() => history.length), historyBeforeCategory + 1, "category changes must create explicit history");
  await page.locator('[data-navi-reference-row][data-navi-reference-name="stand"] [data-navi-reference-toggle]').click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("ref") === "stand");
  assert.equal(new URL(page.url()).searchParams.get("ref"), "stand");

  const explicitUrl = page.url();
  await page.reload({ waitUntil: "domcontentloaded" });
  await assertNaviState({ query: "stand", category: "Posture", reference: "stand" });
  const copiedPage = await context.newPage();
  await copiedPage.goto(explicitUrl, { waitUntil: "domcontentloaded" });
  assert.equal(await copiedPage.locator("[data-navi-search-input]").inputValue(), "stand");
  assert.equal(await copiedPage.locator('[data-navi-category-filter="Posture"]').getAttribute("aria-pressed"), "true");
  assert.equal(await copiedPage.locator('[data-navi-reference-detail][data-navi-reference-name="stand"]').count(), 1);
  await copiedPage.close();

  await page.goBack({ waitUntil: "domcontentloaded" });
  await assertNaviState({ query: "stand", category: "Posture" });
  await page.goForward({ waitUntil: "domcontentloaded" });
  await assertNaviState({ query: "stand", category: "Posture", reference: "stand" });

  await page.goto(`${origin}${route}?robot=navi&q=%20turn%20&category=unknown&ref=missing&utm_source=docs`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("category") && !new URL(location.href).searchParams.has("ref"));
  assert.deepEqual(urlState(), {
    pathname: route, robot: "navi", query: "turn", category: null, reference: null, source: "docs",
  });
  await assertNaviState({ query: "turn" });

  await page.goto(`${origin}${route}?robot=navi&q=battery&category=sensing&ref=turn&utm_source=docs`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("q") && !new URL(location.href).searchParams.has("category"));
  assert.deepEqual(urlState(), {
    pathname: route, robot: "navi", query: null, category: null, reference: "turn", source: "docs",
  });
  await assertNaviState({ reference: "turn" });

  const formerNaviUrl = page.url();
  await page.getByRole("button", { name: "Aegis", exact: true }).click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("robot") === "aegis");
  assert.deepEqual(urlState(), {
    pathname: route, robot: "aegis", query: null, category: null, reference: null, source: "docs",
  });
  await page.getByRole("button", { name: "Navi", exact: true }).click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("robot") === "navi");
  await assertNaviState();
  assert.deepEqual(urlState(), {
    pathname: route, robot: "navi", query: null, category: null, reference: null, source: "docs",
  });
  await page.goBack({ waitUntil: "domcontentloaded" });
  assert.equal(urlState().robot, "aegis");
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForFunction((expected) => location.href === expected, formerNaviUrl);
  await assertNaviState({ reference: "turn" });

  await assertLegacyRobot("Aegis", namesInCategoryOrder(aegisCanonical.aegisFunctions, ["Movement", "Posture", "Safety", "Sensing"]));
  await assertLegacyRobot("Master", namesInCategoryOrder(masterCanonical.masterWebsiteFunctions, ["Joint Adjustments", "Sensing", "Actions", "Custom Movements"]));
  assert.deepEqual(applicationWrites, []);
}

async function waitForNaviHydration(targetPage = page) {
  await targetPage.locator('[data-navi-sdk-explorer][data-navi-hydrated="true"]').waitFor();
  await targetPage.evaluate(() => document.fonts.ready);
}

async function assertVisibleFocus(locator, label) {
  await locator.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  const focusState = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      focused: document.activeElement === element,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
      left: rect.left,
      right: rect.right,
      viewportWidth: innerWidth,
    };
  });
  assert.equal(focusState.focused, true, `${label}: control must receive focus`);
  assert.ok(
    (focusState.outlineStyle !== "none" && focusState.outlineWidth !== "0px") || focusState.boxShadow !== "none",
    `${label}: focused control must have a visible outline or ring`,
  );
  assert.ok(focusState.left >= -1 && focusState.right <= focusState.viewportWidth + 1, `${label}: focus target must not be clipped by the viewport`);
}

async function assertNoHorizontalShift(label) {
  const state = await page.evaluate(() => ({
    bodyScrollLeft: document.body.scrollLeft,
    documentScrollLeft: document.documentElement.scrollLeft,
    bodyWidth: document.body.getBoundingClientRect().width,
    documentWidth: document.documentElement.getBoundingClientRect().width,
    viewportWidth: innerWidth,
  }));
  assert.equal(state.bodyScrollLeft, 0, `${label}: body.scrollLeft must remain zero`);
  assert.equal(state.documentScrollLeft, 0, `${label}: document.scrollLeft must remain zero`);
  assert.ok(state.bodyWidth <= state.viewportWidth + 1, `${label}: body must stay inside the viewport (${JSON.stringify(state)})`);
  assert.ok(state.documentWidth <= state.viewportWidth + 1, `${label}: document must stay inside the viewport (${JSON.stringify(state)})`);
  return state;
}

async function runMobileNavigationScenario(width, theme) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`${origin}${route}?robot=navi&q=stand&category=posture`, { waitUntil: "domcontentloaded" });
  await waitForNaviHydration();
  await page.getByRole("radio", { name: theme === "light" ? "Light" : "Dark", exact: true }).click();
  await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected, theme);
  await page.waitForTimeout(250);

  const index = page.locator("[data-navi-reference-index]");
  const standToggle = page.locator('[data-navi-reference-row][data-navi-reference-name="stand"] [data-navi-reference-toggle]');
  await standToggle.scrollIntoViewIfNeeded();
  const indexScrollTop = await index.evaluate((element) => element.scrollTop);
  await standToggle.click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("ref") === "stand");
  assert.equal(await page.locator("[data-navi-reference-index]").isVisible(), false, `${width}px ${theme}: selected mobile state hides the index`);
  assert.equal(await page.locator('[data-navi-reference-detail][data-navi-reference-name="stand"]').isVisible(), true, `${width}px ${theme}: selected mobile state shows one full-width detail`);
  assert.equal(await page.locator("[data-navi-reference-detail]").count(), 1);
  assert.equal(new URL(page.url()).searchParams.get("q"), "stand");
  assert.equal(new URL(page.url()).searchParams.get("category"), "posture");

  await page.getByRole("button", { name: "Back to references", exact: true }).click();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("ref"));
  assert.equal(new URL(page.url()).searchParams.get("q"), "stand", `${width}px ${theme}: Back keeps q`);
  assert.equal(new URL(page.url()).searchParams.get("category"), "posture", `${width}px ${theme}: Back keeps category`);
  assert.equal(await index.isVisible(), true);
  await page.waitForFunction(() => document.activeElement?.closest('[data-navi-reference-row]')?.getAttribute('data-navi-reference-name') === 'stand');
  const restored = await standToggle.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom };
  });
  assert.ok(restored.bottom > 0 && restored.top < 1000, `${width}px ${theme}: Back restores the originating row to a useful viewport position`);
  assert.ok(Math.abs((await index.evaluate((element) => element.scrollTop)) - indexScrollTop) <= 1, `${width}px ${theme}: Back preserves index scroll position`);

  const urlBeforeQuickStart = page.url();
  await page.locator('[data-navi-quick-start-primary] [data-navi-common-task="stand"]').click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("ref") === "stand");
  assert.equal(await page.locator("[data-navi-reference-detail]").count(), 1, `${width}px ${theme}: Quick Start opens one dedicated detail`);
  assert.notEqual(page.url(), urlBeforeQuickStart);
  await page.getByRole("button", { name: "Back to references", exact: true }).click();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("ref"));
  await assertNoHorizontalShift(`${width}px ${theme} mobile navigation`);

  return {
    width,
    theme,
    restoredRowTop: restored.top,
    restoredRowBottom: restored.bottom,
    indexScrollTop,
  };
}

async function runDarkMobileRegressionScenario() {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto(`${origin}${route}?robot=navi&q=lateral&category=movement`, { waitUntil: "domcontentloaded" });
  await waitForNaviHydration();
  await page.getByRole("radio", { name: "Dark", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  await page.waitForTimeout(250);
  await openReference("lateral");
  const copy = page.getByRole("button", { name: "Copy example" });

  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async () => { throw new Error("forced clipboard failure"); } },
  }));
  await copy.click();
  await page.getByText("Copy failed. Select and copy the code manually.", { exact: true }).waitFor();
  const copyFailure = await assertNoHorizontalShift("390px dark copy failure");

  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async () => undefined },
  }));
  await copy.click();
  await page.getByText("Code copied.", { exact: true }).waitFor();
  const copySuccess = await assertNoHorizontalShift("390px dark copy success");

  await page.getByRole("button", { name: "Back to references", exact: true }).click();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("ref"));
  assert.equal(new URL(page.url()).searchParams.get("q"), "lateral");
  assert.equal(new URL(page.url()).searchParams.get("category"), "movement");
  await page.waitForFunction(() => document.activeElement?.closest('[data-navi-reference-row]')?.getAttribute('data-navi-reference-name') === 'lateral');
  const detailBack = await assertNoHorizontalShift("390px dark detail Back");

  await page.goto(`${origin}${route}?robot=navi&q=lateral&category=movement`, { waitUntil: "domcontentloaded" });
  await waitForNaviHydration();
  await openReference("lateral");
  await page.waitForFunction(() => new URL(location.href).searchParams.get("ref") === "lateral");
  await page.goBack({ waitUntil: "domcontentloaded" });
  await waitForNaviHydration();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("ref"));
  assert.equal(new URL(page.url()).searchParams.get("q"), "lateral");
  assert.equal(new URL(page.url()).searchParams.get("category"), "movement");
  const browserBack = await assertNoHorizontalShift("390px dark browser Back");

  const drawerToggle = page.getByRole("button", { name: "Open navigation", exact: true });
  await drawerToggle.click();
  const drawer = page.locator("[data-site-mobile-drawer]");
  assert.equal(await drawer.getAttribute("aria-hidden"), "false");
  await page.waitForFunction(() => {
    const element = document.querySelector("[data-site-mobile-drawer]");
    return element && element.getBoundingClientRect().right <= innerWidth + 1;
  });
  const drawerRect = await drawer.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right };
  });
  assert.ok(drawerRect.left >= -1 && drawerRect.right <= 391, `390px dark: open drawer must stay inside viewport (${JSON.stringify(drawerRect)})`);
  const drawerOpen = await assertNoHorizontalShift("390px dark drawer open");
  await page.getByRole("button", { name: "Close navigation", exact: true }).click();
  assert.equal(await drawer.getAttribute("aria-hidden"), "true");
  const drawerClosed = await assertNoHorizontalShift("390px dark drawer closed");

  return { copyFailure, copySuccess, detailBack, browserBack, drawerRect, drawerOpen, drawerClosed };
}

async function runKeyboardScenario() {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}${route}?robot=navi`, { waitUntil: "domcontentloaded" });
  await waitForNaviHydration();
  const search = page.locator("[data-navi-search-input]");
  await search.focus();
  await page.keyboard.type("turn");
  await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "turn");
  const movement = page.locator('[data-navi-category-filter="Movement"]');
  await movement.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => new URL(location.href).searchParams.get("category") === "movement");

  const moreTasks = page.locator("[data-navi-more-tasks-toggle]");
  await moreTasks.focus();
  await page.keyboard.press("Enter");
  assert.equal(await moreTasks.getAttribute("aria-expanded"), "true");

  for (const name of ["stand", "forward", "turn", "sit", "stop", "get_battery_status"]) {
    const task = page.locator(`[data-navi-common-task="${name}"]`);
    await task.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction((expected) => new URL(location.href).searchParams.get("ref") === expected, name);
    assert.equal(await page.locator("[data-navi-reference-detail]").getAttribute("data-navi-reference-name"), name);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-navi-reference-toggle")), "true");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !new URL(location.href).searchParams.has("ref"));
    assert.equal(await page.evaluate((expected) => document.activeElement?.closest("[data-navi-reference-row]")?.getAttribute("data-navi-reference-name") === expected, name), true);
  }

  const turnToggle = page.locator('[data-navi-reference-row][data-navi-reference-name="turn"] [data-navi-reference-toggle]');
  await turnToggle.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => new URL(location.href).searchParams.get("ref") === "turn");
  assert.equal(await turnToggle.getAttribute("aria-pressed"), "true");
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async () => undefined },
  }));
  const copy = page.getByRole("button", { name: "Copy example" });
  await copy.focus();
  await page.keyboard.press("Enter");
  await page.getByText("Code copied.", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("ref"));
  assert.equal(await page.evaluate(() => document.activeElement?.closest("[data-navi-reference-row]")?.getAttribute("data-navi-reference-name")), "turn");
}

async function runMatrixScenario() {
  const artifacts = ".codex-artifacts/navi-sdk-explorer/task-first-redesign";
  mkdirSync(artifacts, { recursive: true });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const mobileNavigation = [];

  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.goto(`${origin}${route}?robot=navi&ref=lateral`, { waitUntil: "domcontentloaded" });
      await waitForNaviHydration();
      await page.getByRole("radio", { name: theme === "light" ? "Light" : "Dark", exact: true }).click();
      await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected, theme);
      await page.waitForTimeout(250);
      const explorer = page.locator("[data-navi-sdk-explorer]");
      const state = await explorer.evaluate((element, expectedTheme) => {
        const visible = (node) => {
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        };
        const parseColor = (value) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        const luminance = (value) => {
          const rgb = parseColor(value).map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
        };
        const effectiveBackground = (node) => {
          let current = node;
          while (current instanceof Element) {
            const background = getComputedStyle(current).backgroundColor;
            if (background && background !== "rgba(0, 0, 0, 0)") return background;
            current = current.parentElement;
          }
          return getComputedStyle(document.documentElement).backgroundColor;
        };
        const contrast = (node) => {
          const foreground = luminance(getComputedStyle(node).color);
          const background = luminance(effectiveBackground(node));
          return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
        };
        const controls = [...element.querySelectorAll("button, input")].filter(visible);
        const workspace = element.querySelector("[data-navi-reference-workspace]");
        const index = element.querySelector("[data-navi-reference-index]");
        const detailColumn = element.querySelector("[data-navi-desktop-detail]");
        const indexRect = index?.getBoundingClientRect();
        const detailRect = detailColumn?.getBoundingClientRect();
        const duplicateIds = [...element.querySelectorAll("[id]")].map((node) => node.id).filter((id, position, ids) => ids.indexOf(id) !== position);
        const clipped = [...element.querySelectorAll("button, [class*='rounded-full']")].filter(visible).filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.left < -1 || rect.right > innerWidth + 1;
        }).map((node) => node.textContent?.trim() || node.getAttribute("aria-label"));
        const horizontalScrollers = [...element.querySelectorAll("*")].filter((node) => {
          if (!visible(node) || node.scrollWidth <= node.clientWidth + 1) return false;
          return ["auto", "scroll"].includes(getComputedStyle(node).overflowX);
        }).map((node) => node.tagName.toLowerCase());
        const samples = [
          element.querySelector("h2"),
          element.querySelector("[data-navi-search-input]"),
          element.querySelector("[data-navi-reference-name='lateral'] [data-navi-reference-toggle] code"),
          element.querySelector("[data-navi-detail-section='definition'] p"),
          element.querySelector("[data-navi-detail-section='availability'] span"),
          element.querySelector("[data-navi-detail-section='safety'] li"),
        ].filter(Boolean);
        return {
          theme: expectedTheme,
          canvas: getComputedStyle(document.querySelector(".agentech-library-page")).backgroundColor,
          explorerBackground: getComputedStyle(element).backgroundColor,
          pageOverflow: document.documentElement.scrollWidth - innerWidth,
          badTargets: controls.filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width < 44 || rect.height < 44;
          }).map((node) => ({ name: node.textContent?.trim() || node.getAttribute("aria-label"), width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })),
          clipped,
          horizontalScrollers,
          contrasts: samples.map((node) => ({
            text: node.textContent?.trim().slice(0, 60),
            foreground: getComputedStyle(node).color,
            background: effectiveBackground(node),
            ratio: contrast(node),
          })),
          interfaceFonts: [...element.querySelectorAll('[data-sdk-typeface="interface"]')].filter(visible).map((node) => getComputedStyle(node).fontFamily),
          codeFonts: [...element.querySelectorAll('[data-sdk-typeface="code"]')].filter(visible).map((node) => getComputedStyle(node).fontFamily),
          liveResultCounts: element.querySelectorAll('[data-navi-result-count][aria-live="polite"]').length,
          namedGroups: element.querySelectorAll('[role="group"][aria-label]').length,
          primaryTasks: element.querySelectorAll('[data-navi-quick-start-primary] [data-navi-common-task]').length,
          secondaryTasks: element.querySelectorAll('[data-navi-quick-start-secondary] [data-navi-common-task]').length,
          workspaceDisplay: workspace ? getComputedStyle(workspace).display : null,
          indexVisible: index ? visible(index) : false,
          detailVisible: detailColumn ? visible(detailColumn) : false,
          indexWidth: indexRect?.width ?? 0,
          detailWidth: detailRect?.width ?? 0,
          detailInstances: element.querySelectorAll('[data-navi-reference-detail]').length,
          detailsInsideRows: element.querySelectorAll('[data-navi-reference-row] [data-navi-reference-detail]').length,
          duplicateIds,
          bodyScrollLeft: document.body.scrollLeft,
          documentScrollLeft: document.documentElement.scrollLeft,
        };
      }, theme);

      assert.ok(state.pageOverflow <= 1, `${width}px ${theme}: page must not overflow horizontally`);
      assert.deepEqual(state.badTargets, [], `${width}px ${theme}: every visible Navi control must be at least 44×44`);
      assert.deepEqual(state.clipped, [], `${width}px ${theme}: badges and controls must stay inside the viewport`);
      assert.ok(state.horizontalScrollers.every((tag) => tag === "pre" || tag === "code"), `${width}px ${theme}: only code blocks may scroll horizontally`);
      assert.equal(state.liveResultCounts, 1, `${width}px ${theme}: one polite live result count is required`);
      assert.ok(state.namedGroups >= 1, `${width}px ${theme}: filter controls must have a named group`);
      assert.equal(state.primaryTasks, 3, `${width}px ${theme}: exactly three primary Quick Start tasks are visible in the DOM`);
      assert.equal(state.secondaryTasks, 0, `${width}px ${theme}: remaining tasks start collapsed`);
      assert.equal(state.detailInstances, 1, `${width}px ${theme}: exactly one detail instance is mounted`);
      assert.equal(state.detailsInsideRows, 0, `${width}px ${theme}: detail DOM never nests inside index rows`);
      assert.deepEqual(state.duplicateIds, [], `${width}px ${theme}: no duplicate IDs are allowed`);
      assert.equal(state.bodyScrollLeft, 0, `${width}px ${theme}: body.scrollLeft must remain zero`);
      assert.equal(state.documentScrollLeft, 0, `${width}px ${theme}: document.scrollLeft must remain zero`);
      if (width >= 1024) {
        assert.equal(state.workspaceDisplay, "grid", `${width}px ${theme}: desktop uses one two-column workspace`);
        assert.equal(state.indexVisible, true, `${width}px ${theme}: desktop index remains visible`);
        assert.equal(state.detailVisible, true, `${width}px ${theme}: desktop detail remains visible`);
        assert.ok(state.detailWidth > state.indexWidth, `${width}px ${theme}: desktop detail column is wider than the index`);
      } else {
        assert.equal(state.indexVisible, false, `${width}px ${theme}: selected tablet/mobile state hides the index`);
        assert.equal(state.detailVisible, true, `${width}px ${theme}: selected tablet/mobile state shows the dedicated detail`);
      }
      assert.ok(state.interfaceFonts.length >= 5 && state.interfaceFonts.every((family) => /Manrope/i.test(family)), `${width}px ${theme}: interface roles must use Manrope`);
      assert.ok(state.codeFonts.length >= 5 && state.codeFonts.every((family) => /IBM Plex Mono/i.test(family)), `${width}px ${theme}: code roles must use IBM Plex Mono`);
      assert.ok(state.contrasts.every((sample) => sample.ratio >= 4.5), `${width}px ${theme}: representative text contrast must be at least 4.5:1 (${JSON.stringify(state.contrasts)})`);
      if (theme === "light") assert.equal(state.canvas, "rgb(245, 244, 241)", `${width}px light: canvas must be warm off-white`);
      else {
        assert.notEqual(state.explorerBackground, "rgba(255, 255, 255, 0.7)", `${width}px dark: Explorer surface must use the dark palette`);
      }

      await assertVisibleFocus(page.locator("[data-navi-search-input]"), `${width}px ${theme} search`);
      await assertVisibleFocus(page.locator('[data-navi-category-filter="Movement"]'), `${width}px ${theme} filter`);
      await assertVisibleFocus(page.locator('[data-navi-common-task="stand"]'), `${width}px ${theme} Common Task`);
      if (width >= 1024) await assertVisibleFocus(page.locator('[data-navi-reference-row][data-navi-reference-name="lateral"] [data-navi-reference-toggle]'), `${width}px ${theme} reference`);
      else await assertVisibleFocus(page.getByRole("button", { name: "Back to references", exact: true }), `${width}px ${theme} Back to references`);
      await assertVisibleFocus(page.getByRole("button", { name: "Copy example" }), `${width}px ${theme} copy`);
      await page.screenshot({ path: `${artifacts}/${width}-${theme}.png`, fullPage: true });
      matrixReport.push({
        width,
        theme,
        canvas: state.canvas,
        explorerBackground: state.explorerBackground,
        pageOverflow: state.pageOverflow,
        badTargets: state.badTargets,
        clipped: state.clipped,
        horizontalScrollers: state.horizontalScrollers,
        interfaceSamples: state.interfaceFonts.length,
        codeSamples: state.codeFonts.length,
        liveResultCounts: state.liveResultCounts,
        namedGroups: state.namedGroups,
        minimumRepresentativeContrast: Math.min(...state.contrasts.map((sample) => sample.ratio)),
        layout: {
          workspaceDisplay: state.workspaceDisplay,
          indexVisible: state.indexVisible,
          detailVisible: state.detailVisible,
          indexWidth: state.indexWidth,
          detailWidth: state.detailWidth,
          detailInstances: state.detailInstances,
        },
      });
      if (width < 1024) mobileNavigation.push(await runMobileNavigationScenario(width, theme));
    }
  }

  await runKeyboardScenario();
  browserReport.mobileNavigation = mobileNavigation;
  browserReport.darkMobileRegression = await runDarkMobileRegressionScenario();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto(`${origin}${route}?robot=navi&ref=lateral`, { waitUntil: "domcontentloaded" });
  await waitForNaviHydration();
  const media = page.locator("[data-navi-preview-media]");
  await media.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  assert.equal(await media.locator("video").evaluate((video) => video.paused), true, "reduced motion must suppress automatic media playback");
  const reducedTransitions = await page.locator("[data-navi-sdk-explorer] .transition").evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).transitionProperty));
  assert.ok(reducedTransitions.every((property) => property === "none"), `reduced motion must disable nonessential Navi transitions (${JSON.stringify(reducedTransitions)})`);
  await page.getByRole("button", { name: "Copy example" }).focus();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("ref"));
  assert.equal(await page.locator("[data-navi-reference-detail]").count(), 0, "reduced motion must not block state changes");
}

function previewRequestsSince(index, requests = observedRequests) {
  return requests.slice(index).filter((request) => /\/assets\/products\/agentech-library\/simulator-previews\/navi\//.test(request.url));
}

function measurePureSearchP95() {
  const references = explorerModel.buildPublicNaviReferences(canonical.naviFunctions);
  const index = explorerModel.buildNaviSearchIndex(references);
  const queries = ["turn", "standing ready", "battery status", "facing_angle_deg", "auto return", "platform note"];
  const samples = [];
  for (let sample = 0; sample < 2000; sample += 1) {
    const started = performance.now();
    explorerModel.searchNaviReferences(index, queries[sample % queries.length], "All");
    samples.push(performance.now() - started);
  }
  samples.sort((left, right) => left - right);
  return samples[Math.ceil(samples.length * 0.95) - 1];
}

async function measureCandidateSelection() {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`${origin}${route}?robot=master`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Navi", exact: true }).waitFor();
  await page.waitForTimeout(300);
  const requestStart = observedRequests.length;
  const started = performance.now();
  await page.getByRole("button", { name: "Navi", exact: true }).click();
  await waitForNaviHydration();
  const durationMs = performance.now() - started;
  const selectionRequests = observedRequests.slice(requestStart);
  const measurement = {
    durationMs,
    rows: await page.locator("[data-navi-reference-row]").count(),
    domNodes: await page.locator("*").count(),
    totalRequests: selectionRequests.length,
    previewRequests: previewRequestsSince(requestStart).map((request) => request.url),
    requestSummary: Object.fromEntries([...new Set(selectionRequests.map((request) => request.resourceType))].map((type) => [type, selectionRequests.filter((request) => request.resourceType === type).length])),
  };
  assert.equal(measurement.rows, 130);
  assert.deepEqual(measurement.previewRequests, []);
  return measurement;
}

async function measureBaselineSelection() {
  const baselineOrigin = process.env.EAIC_SDK_EXPLORER_BASELINE_ORIGIN;
  if (!baselineOrigin) return null;
  const baselinePage = await context.newPage();
  const baselineRequests = [];
  const baselineErrors = [];
  baselinePage.on("request", (request) => baselineRequests.push({ method: request.method(), resourceType: request.resourceType(), url: request.url() }));
  baselinePage.on("pageerror", (error) => baselineErrors.push(error.message));
  await baselinePage.goto(`${baselineOrigin}${route}`, { waitUntil: "domcontentloaded" });
  await baselinePage.getByRole("button", { name: "Navi", exact: true }).waitFor();
  await baselinePage.waitForTimeout(500);
  const requestStart = baselineRequests.length;
  const started = performance.now();
  await baselinePage.getByRole("button", { name: "Navi", exact: true }).click();
  await baselinePage.waitForFunction(() => document.querySelectorAll("[data-sdk-function-name]").length === 130);
  await baselinePage.waitForTimeout(1000);
  const durationMs = performance.now() - started;
  const selectionRequests = baselineRequests.slice(requestStart);
  const measurement = {
    origin: baselineOrigin,
    durationMs,
    rows: await baselinePage.locator("[data-sdk-function-name]").count(),
    domNodes: await baselinePage.locator("*").count(),
    heavyPreviewElements: await baselinePage.locator('video, img[src*="/simulator-previews/navi/"]').count(),
    totalRequests: selectionRequests.length,
    previewRequests: selectionRequests.filter((request) => /\/assets\/products\/agentech-library\/simulator-previews\/navi\//.test(request.url)).map((request) => request.url),
    requestSummary: Object.fromEntries([...new Set(selectionRequests.map((request) => request.resourceType))].map((type) => [type, selectionRequests.filter((request) => request.resourceType === type).length])),
    pageErrors: baselineErrors,
  };
  mkdirSync(".codex-artifacts/navi-sdk-explorer", { recursive: true });
  await baselinePage.screenshot({ path: ".codex-artifacts/navi-sdk-explorer/baseline-navi-selected.png", fullPage: true });
  await baselinePage.close();
  return measurement;
}

async function runNetworkBoundaryScenario() {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  premiumGets = 0;
  premiumPosts = 0;
  await page.goto(`${origin}${route}?robot=navi`, { waitUntil: "domcontentloaded" });
  await waitForNaviHydration();
  const closedRequestStart = observedRequests.length;
  await page.waitForTimeout(250);
  const closed = {
    rows: await page.locator("[data-navi-reference-row]").count(),
    details: await page.locator("[data-navi-reference-detail]").count(),
    heavyPreviews: await page.locator('[data-navi-preview-media] video, [data-navi-preview-media] img').count(),
    previewRequests: previewRequestsSince(closedRequestStart).map((request) => request.url),
    premiumGets,
    applicationWrites: [...applicationWrites],
    domNodes: await page.locator("*").count(),
  };
  assert.deepEqual(closed, { rows: 130, details: 0, heavyPreviews: 0, previewRequests: [], premiumGets: 0, applicationWrites: [], domNodes: closed.domNodes });
  await page.screenshot({ path: ".codex-artifacts/navi-sdk-explorer/candidate-closed.png", fullPage: true });

  const observerBaseline = await page.evaluate(() => window.__naviObserverStats?.active ?? 0);
  const normalRequestStart = observedRequests.length;
  await openReference("lateral");
  const media = page.locator("[data-navi-preview-media]");
  await media.scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  const normal = {
    details: await page.locator("[data-navi-reference-detail]").count(),
    heavyPreviews: await page.locator('[data-navi-preview-media] video, [data-navi-preview-media] img').count(),
    previewRequests: previewRequestsSince(normalRequestStart).map((request) => request.url),
    premiumGets,
    observersActive: await page.evaluate(() => window.__naviObserverStats?.active ?? 0),
  };
  assert.equal(normal.details, 1);
  assert.ok(normal.heavyPreviews <= 1);
  assert.ok(normal.previewRequests.length <= 1, `normal detail requested multiple preview assets: ${JSON.stringify(normal.previewRequests)}`);
  assert.equal(normal.premiumGets, 0);
  await page.screenshot({ path: ".codex-artifacts/navi-sdk-explorer/candidate-normal-detail.png", fullPage: true });
  await closeOpenDetail();
  const closedAfterNormal = {
    details: await page.locator("[data-navi-reference-detail]").count(),
    previewElements: await page.locator("[data-navi-preview-media]").count(),
    observersActive: await page.evaluate(() => window.__naviObserverStats?.active ?? 0),
  };
  assert.deepEqual({ details: closedAfterNormal.details, previewElements: closedAfterNormal.previewElements }, { details: 0, previewElements: 0 });
  assert.ok(closedAfterNormal.observersActive <= observerBaseline, "closing a normal detail must disconnect its media observer");

  const premiumRequestStart = observedRequests.length;
  await openReference("return_to_home");
  await page.locator("[data-navi-premium-panel]").waitFor();
  await page.waitForTimeout(100);
  const premium = {
    details: await page.locator("[data-navi-reference-detail]").count(),
    premiumGets,
    premiumPosts,
    applicationWrites: [...applicationWrites],
    premiumRequests: observedRequests.slice(premiumRequestStart).filter((request) => /\/api\/premium-features\/return-to-home/.test(request.url)),
  };
  assert.equal(premium.details, 1);
  assert.equal(premium.premiumGets, 1);
  assert.equal(premium.premiumPosts, 0);
  assert.deepEqual(premium.applicationWrites, []);
  assert.deepEqual(premium.premiumRequests.map((request) => request.method), ["GET"]);
  await page.screenshot({ path: ".codex-artifacts/navi-sdk-explorer/candidate-premium-detail.png", fullPage: true });
  await closeOpenDetail();
  return { closed, normal, closedAfterNormal, premium };
}

async function runFullScenario() {
  mkdirSync(".codex-artifacts/navi-sdk-explorer", { recursive: true });
  browserReport.searchP95Ms = measurePureSearchP95();
  browserReport.baselineSelection = await measureBaselineSelection();
  browserReport.candidateSelection = await measureCandidateSelection();
  browserReport.onboardingDetailEvidence = await runOnboardingDetailEvidenceScenario();
  await runExplorerScenario();
  await runUrlScenario();
  await runMatrixScenario();
  browserReport.networkBoundaries = await runNetworkBoundaryScenario();
  browserReport.matrix = matrixReport;
  browserReport.browser = await browser.version();
  browserReport.userAgent = await page.evaluate(() => navigator.userAgent);
  browserReport.errors = errors;
  browserReport.applicationWrites = applicationWrites;
  browserReport.premiumGets = premiumGets;
  browserReport.premiumPosts = premiumPosts;
  browserReport.unintendedActionRequests = observedRequests.filter((request) =>
    ["POST", "PUT", "PATCH", "DELETE"].includes(request.method)
    && new URL(request.url).origin === origin
    && /(checkout|payment|purchase|simulator|robot|execute|live-run)/i.test(request.url)
  );
  assert.deepEqual(applicationWrites, [], "full browser verification must not issue application writes");
  assert.deepEqual(browserReport.unintendedActionRequests, [], "full browser verification must not issue checkout, payment, simulator, robot, or execution writes");
  browserReport.status = "passed";
  writeFileSync(".codex-artifacts/navi-sdk-explorer/browser-report.json", `${JSON.stringify(browserReport, null, 2)}\n`);
}

try {
  const mode = process.argv[2] ?? "--full";
  if (mode === "--detail-only") await runDetailScenario();
  else if (mode === "--explorer-only") await runExplorerScenario();
  else if (mode === "--url-only") await runUrlScenario();
  else if (mode === "--matrix") await runMatrixScenario();
  else if (mode === "--network-only") browserReport.networkBoundaries = await runNetworkBoundaryScenario();
  else if (mode === "--full") await runFullScenario();
  else throw new Error(`Unsupported browser-check mode: ${mode}`);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: "passed", mode, rows: 130, premiumGets, premiumPosts, applicationWrites, errors, matrixReport }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
