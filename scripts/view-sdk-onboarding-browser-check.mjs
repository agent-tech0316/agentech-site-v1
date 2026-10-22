import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");

const origin = process.env.EAIC_VIEW_SDK_ONBOARDING_ORIGIN ?? "http://127.0.0.1:3019";
const cdp = process.env.EAIC_VIEW_SDK_ONBOARDING_CDP ?? "http://127.0.0.1:9234";
const routePath = "/agentech-products/eaic-hub/view-sdk";
const storageKey = "agentech:eaic:view-sdk-onboarding:v1";
const artifactDirectory = ".codex-artifacts/view-sdk-onboarding";
const browser = await chromium.connectOverCDP(cdp);

mkdirSync(artifactDirectory, { recursive: true });

const report = {
  status: "running",
  origin,
  route: routePath,
  chromeVersion: await browser.version(),
  scenarios: [],
  matrix: [],
  screenshots: [],
  unexpectedErrors: [],
  applicationWrites: [],
  checkoutActions: [],
  robotOrSimulatorCalls: [],
  onboardingNetworkRequests: [],
};

const scenarioNames = [
  "empty storage completes only through four real Master actions",
  "refresh and a new tab restore progress without auto-reopening a finished tour",
  "partial unfinished progress reopens at the first incomplete step",
  "Skip Finish Restart Back and Next preserve evidence",
  "same selected Master click completes Choose without increasing history length",
  "Master Navi Aegis evidence stays robot-scoped",
  "Navi search category ref copied URL refresh and Back Forward coexist",
  "direct Navi ref hydration creates no Choose or Explore evidence",
  "Navi Common Task and row open record only explicit Explore",
  "Master and Aegis categories do not count but function details do",
  "setup review and copy are independent and both are required",
  "clipboard API resolve reject and fallback true false are truthful",
  "persistent blocked write-failure and corrupt storage modes remain usable",
  "signed-out locked and access-error shells mount zero onboarding DOM",
  "premium allow deny and error record only Explore and perform zero POST",
  "all three destination links persist before normal navigation",
  "keyboard coach Escape focus return and Navi Escape priorities hold",
  "pointer and touch targets remain operable and at least 44 by 44",
  "reduced motion removes movement but not behavior",
  "onboarding produces no application write checkout simulator or robot call",
];

function emptyEvidence() {
  return {
    robotSelected: false,
    functionDetailViewed: false,
    setupReviewed: false,
    setupCopied: false,
    nextAction: null,
  };
}

function stateWith(overrides = {}) {
  const robots = {
    master: { ...emptyEvidence(), ...(overrides.master ?? {}) },
    aegis: { ...emptyEvidence(), ...(overrides.aegis ?? {}) },
    navi: { ...emptyEvidence(), ...(overrides.navi ?? {}) },
  };
  return {
    version: 1,
    lastExplicitlySelectedRobot: overrides.lastExplicitlySelectedRobot ?? null,
    robots,
    tour: { dismissed: false, finished: false, ...(overrides.tour ?? {}) },
  };
}

async function installBaseInit(context, { theme = "light", state, copyMode = "api-resolve", storageMode = "normal" } = {}) {
  await context.addInitScript(({ key, themeName, initialState, initialCopyMode, requestedStorageMode }) => {
    window.__eaicCopyMode = initialCopyMode;
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;

    if (initialState !== undefined && originalGetItem.call(window.localStorage, key) === null) {
      originalSetItem.call(window.localStorage, key, typeof initialState === "string" ? initialState : JSON.stringify(initialState));
    }
    originalSetItem.call(window.localStorage, "agentech-theme", themeName);

    if (requestedStorageMode === "read-failure") {
      Storage.prototype.getItem = function getItem(name) {
        if (name === key) throw new DOMException("Storage read blocked", "SecurityError");
        return originalGetItem.call(this, name);
      };
    }
    if (requestedStorageMode === "write-failure" || requestedStorageMode === "read-failure") {
      Storage.prototype.setItem = function setItem(name, value) {
        if (name === key) throw new DOMException("Storage write blocked", "QuotaExceededError");
        return originalSetItem.call(this, name, value);
      };
    }

    Object.defineProperty(Navigator.prototype, "clipboard", {
      configurable: true,
      get() {
        const mode = new URLSearchParams(location.search).get("copyMode") || window.__eaicCopyMode;
        if (mode === "api-resolve") return { writeText: async () => undefined };
        if (mode === "api-reject") return { writeText: async () => { throw new Error("Clipboard rejected"); } };
        return undefined;
      },
    });
    document.execCommand = (command) => {
      const mode = new URLSearchParams(location.search).get("copyMode") || window.__eaicCopyMode;
      return command === "copy" && mode === "fallback-true";
    };
  }, { key: storageKey, themeName: theme, initialState: state, initialCopyMode: copyMode, requestedStorageMode: storageMode });
}

async function createAuditedContext(options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1280, height: 900 },
    reducedMotion: options.reducedMotion ?? "no-preference",
    hasTouch: options.hasTouch ?? false,
    javaScriptEnabled: options.javaScriptEnabled ?? true,
  });
  await installBaseInit(context, options);
  const audit = {
    errors: [],
    writes: [],
    checkout: [],
    robotCalls: [],
    onboardingFetches: [],
    premiumGets: 0,
    premiumPosts: 0,
    premiumMode: "deny",
    accountMode: "locked",
  };

  await context.route("**/api/premium-features/return-to-home", async (route) => {
    const request = route.request();
    if (request.method() === "POST") audit.premiumPosts += 1;
    else audit.premiumGets += 1;
    const mode = audit.premiumMode;
    if (mode === "error") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ error: "Unavailable" }) });
      return;
    }
    const allowed = mode === "allow";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        feature: { name: "Return to Home" },
        access: { allowed, source: allowed ? "subscription" : "none" },
        priceCents: allowed ? null : 9900,
      }),
    });
  });

  await context.route("**/api/account?**", async (route) => {
    if (audit.accountMode === "error") {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Unavailable" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ accessProfiles: audit.accountMode === "allowed" ? [{ profile_type: "developer" }] : [] }),
    });
  });

  function attach(page) {
    page.on("pageerror", (error) => audit.errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      if (/401 \(Unauthorized\)|favicon/i.test(message.text())) return;
      audit.errors.push(`console: ${message.text()}`);
    });
    page.on("request", (request) => {
      const url = request.url();
      const parsed = new URL(url);
      const method = request.method();
      if (/stripe|checkout/i.test(url)) audit.checkout.push(`${method} ${url}`);
      if (/^\/api\/(?:robot|simulator|execute|run|runner|compiler|gateway|schedule|session)/i.test(parsed.pathname)) {
        audit.robotCalls.push(`${method} ${url}`);
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(method) && parsed.pathname.startsWith("/api/")) {
        audit.writes.push(`${method} ${url}`);
      }
      const currentPath = new URL(page.url() || origin).pathname;
      if (currentPath === routePath && parsed.pathname.startsWith("/api/") && !/\/api\/(?:premium-features\/return-to-home|account|master-heartbeat)/.test(parsed.pathname)) {
        audit.onboardingFetches.push(`${method} ${url}`);
      }
    });
    return page;
  }

  return { context, audit, attach };
}

async function openView(page, query = "") {
  await page.goto(`${origin}${routePath}${query}`, { waitUntil: "domcontentloaded" });
  const surface = page.locator('[data-eaic-sdk-onboarding="true"]');
  await surface.waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector('[data-eaic-sdk-onboarding="true"]')?.getAttribute("data-eaic-sdk-onboarding-hydrated") === "true");
  return surface;
}

async function closeCoach(page, action = "Skip") {
  const coach = page.getByRole("dialog", { name: /Choose Robot|Explore Commands|Set Up SDK|Next Action/ });
  if (await coach.isVisible().catch(() => false)) await coach.getByRole("button", { name: action, exact: true }).click();
}

async function readState(page) {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, storageKey);
}

async function capture(page, name, { fullPage = false } = {}) {
  const path = `${artifactDirectory}/${name}.png`;
  await page.screenshot({ path, fullPage });
  if (!report.screenshots.includes(path)) report.screenshots.push(path);
  return path;
}

async function readRootAlignment(page, stage) {
  return page.evaluate((label) => {
    const main = document.querySelector("main")?.getBoundingClientRect();
    return {
      stage: label,
      bodyScrollLeft: document.body.scrollLeft,
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollLeft: document.documentElement.scrollLeft,
      documentScrollWidth: document.documentElement.scrollWidth,
      innerWidth,
      mainRect: main ? { left: main.left, right: main.right, width: main.width } : null,
    };
  }, stage);
}

function assertRootAlignment(alignment, context, { requireContainedBody = true } = {}) {
  assert.equal(alignment.bodyScrollLeft, 0, `${context} ${alignment.stage}: body stays horizontally aligned`);
  assert.equal(alignment.documentScrollLeft, 0, `${context} ${alignment.stage}: document stays horizontally aligned`);
  if (requireContainedBody) assert.ok(alignment.bodyScrollWidth <= alignment.innerWidth + 1, `${context} ${alignment.stage}: hidden UI does not widen the body scroll area`);
  assert.ok(alignment.documentScrollWidth <= alignment.innerWidth + 1, `${context} ${alignment.stage}: document has no horizontal overflow`);
  assert.ok(alignment.mainRect && alignment.mainRect.left >= -1, `${context} ${alignment.stage}: main left edge stays in view`);
  assert.ok(alignment.mainRect && alignment.mainRect.right <= alignment.innerWidth + 1, `${context} ${alignment.stage}: main right edge stays in view`);
}

function assertStepCardLayout(stepCards, width, theme) {
  const context = `${width}px ${theme} onboarding cards`;
  assert.equal(stepCards.length, 4, `${context}: all four cards are present`);

  const expectedRows = width >= 1024 ? 1 : width >= 640 ? 2 : 4;
  const rowTops = [...new Set(stepCards.map(({ cardRect }) => Math.round(cardRect.top)))];
  assert.equal(rowTops.length, expectedRows, `${context}: responsive grid uses the expected row count`);

  const cardHeights = stepCards.map(({ cardRect }) => cardRect.height);
  assert.ok(Math.max(...cardHeights) - Math.min(...cardHeights) <= 1, `${context}: all four cards stay equal height`);

  const titleOffsets = stepCards.map(({ cardRect, titleRect }) => titleRect.top - cardRect.top);
  assert.ok(Math.max(...titleOffsets) - Math.min(...titleOffsets) <= 1, `${context}: every title starts from the same top padding`);

  for (const rowTop of rowTops) {
    const row = stepCards.filter(({ cardRect }) => Math.abs(cardRect.top - rowTop) <= 1);
    if (row.length < 2) continue;
    const titleTops = row.map(({ titleRect }) => titleRect.top);
    const titleBottoms = row.map(({ titleRect }) => titleRect.bottom);
    assert.ok(Math.max(...titleTops) - Math.min(...titleTops) <= 1, `${context}: titles in each grid row share one top line`);
    assert.ok(Math.max(...titleBottoms) - Math.min(...titleBottoms) <= 1, `${context}: titles in each grid row share one baseline`);
  }

  for (const { step, titleRect, titleLineHeight } of stepCards) {
    assert.ok(titleRect.height <= titleLineHeight + 1, `${context}: ${step} title stays on one unobscured line`);
  }
}

async function selectRobot(page, robot) {
  const label = robot === "master" ? "Master" : robot === "navi" ? "Navi" : "Aegis";
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForFunction((expected) => document.querySelector(`[data-sdk-robot-option="${expected}"]`)?.getAttribute("aria-pressed") === "true", robot);
}

async function openClassicFunction(page) {
  const category = page.locator("details[data-sdk-category]").first();
  if (!(await category.getAttribute("open"))) await category.locator(":scope > summary").click();
  const card = category.locator("details[data-sdk-function-name]").first();
  if (!(await card.getAttribute("open"))) await card.locator(":scope > summary").click();
  await page.waitForFunction(() => document.querySelector("details[data-sdk-function-name][open]") !== null);
}

async function reviewAndCopySetup(page, robot = "master") {
  const review = page.locator(`[data-sdk-setup-review="${robot}"]`);
  if ((await review.getAttribute("aria-pressed")) !== "true") await review.click();
  await page.locator(`[data-sdk-setup-copy="${robot}"] button[aria-label="Copy code"]`).click();
  await page.waitForFunction((selectedRobot) => document.querySelector(`[data-sdk-setup-copy="${selectedRobot}"] button`)?.getAttribute("title") === "Copied", robot);
}

async function chooseNextStep(page) {
  await page.locator('[data-eaic-sdk-onboarding-step="next"]').click();
  await page.locator('[data-sdk-next-actions="true"]').waitFor({ state: "visible" });
}

async function assertNoUnexpected(audit, name, { allowPremiumGet = true } = {}) {
  assert.deepEqual(audit.errors, [], `${name}: console and page errors`);
  assert.deepEqual(audit.writes, [], `${name}: application writes`);
  assert.deepEqual(audit.checkout, [], `${name}: checkout actions`);
  assert.deepEqual(audit.robotCalls, [], `${name}: robot or simulator calls`);
  assert.deepEqual(audit.onboardingFetches, [], `${name}: onboarding network requests`);
  assert.equal(audit.premiumPosts, 0, `${name}: premium POST count`);
  if (!allowPremiumGet) assert.equal(audit.premiumGets, 0, `${name}: premium GET count`);
}

async function runScenario(name, callback, options = {}) {
  assert.ok(scenarioNames.includes(name), `unknown scenario: ${name}`);
  const startedAt = Date.now();
  const { context, audit, attach } = await createAuditedContext(options);
  try {
    const page = attach(await context.newPage());
    const detail = await callback({ page, context, audit, attach });
    await assertNoUnexpected(audit, name, options.auditOptions);
    report.scenarios.push({ name, status: "passed", durationMs: Date.now() - startedAt, detail: detail ?? null });
  } catch (error) {
    report.status = "failed";
    report.scenarios.push({ name, status: "failed", durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
    writeFileSync(`${artifactDirectory}/browser-report.json`, `${JSON.stringify(report, null, 2)}\n`);
    throw error;
  } finally {
    report.unexpectedErrors.push(...audit.errors);
    report.applicationWrites.push(...audit.writes);
    report.checkoutActions.push(...audit.checkout);
    report.robotOrSimulatorCalls.push(...audit.robotCalls);
    report.onboardingNetworkRequests.push(...audit.onboardingFetches);
    await context.close();
  }
}

await runScenario(scenarioNames[0], async ({ page }) => {
  const surface = await openView(page, "?robot=master");
  assert.match(await surface.innerText(), /0 of 4 complete/);
  await closeCoach(page);
  await selectRobot(page, "master");
  await openClassicFunction(page);
  await reviewAndCopySetup(page);
  await chooseNextStep(page);
  await page.getByRole("link", { name: "EAIC Hub", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/agentech-products/eaic-hub");
  const state = await readState(page);
  assert.deepEqual(state.robots.master, { robotSelected: true, functionDetailViewed: true, setupReviewed: true, setupCopied: true, nextAction: "hub" });
  assert.deepEqual(state.tour, { dismissed: false, finished: true });
});

await runScenario(scenarioNames[1], async ({ page, context, attach }) => {
  await openView(page, "?robot=master");
  await closeCoach(page);
  await selectRobot(page, "master");
  await openClassicFunction(page);
  await reviewAndCopySetup(page);
  await chooseNextStep(page);
  await page.getByRole("link", { name: "EAIC Hub", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/agentech-products/eaic-hub");
  await openView(page, "?robot=master");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(await page.getByRole("button", { name: "Restart tour" }).count(), 1);
  const nextPage = attach(await context.newPage());
  await openView(nextPage, "?robot=master");
  assert.equal(await nextPage.getByRole("dialog").count(), 0);
  assert.match(await nextPage.locator('[data-eaic-sdk-onboarding="true"]').innerText(), /4 of 4 complete/);
  await capture(nextPage, "state-all-complete-return");
});

await runScenario(scenarioNames[2], async ({ page }) => {
  await openView(page, "?robot=master");
  const coach = page.getByRole("dialog", { name: "Set Up SDK" });
  await coach.waitFor({ state: "visible" });
  assert.match(await page.locator('[data-eaic-sdk-onboarding="true"]').innerText(), /2 of 4 complete/);
  await capture(page, "state-partial-progress");
}, {
  state: stateWith({
    lastExplicitlySelectedRobot: "master",
    master: { robotSelected: true, functionDetailViewed: true },
  }),
});

await runScenario(scenarioNames[3], async ({ page }) => {
  await openView(page);
  const coach = page.getByRole("dialog");
  await coach.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("dialog", { name: "Explore Commands" }).getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("dialog", { name: "Choose Robot" }).getByRole("button", { name: "Skip", exact: true }).click();
  await capture(page, "state-coach-closed");
  let state = await readState(page);
  assert.deepEqual(state.robots.master, emptyEvidence());
  assert.equal(state.tour.dismissed, true);
  await page.getByRole("button", { name: "Restart tour" }).click();
  await capture(page, "state-restart");
  await page.getByRole("dialog", { name: "Choose Robot" }).getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("dialog", { name: "Explore Commands" }).getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("dialog", { name: "Set Up SDK" }).getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("dialog", { name: "Next Action" }).getByRole("button", { name: "Finish", exact: true }).click();
  state = await readState(page);
  assert.deepEqual(state.robots.master, emptyEvidence());
  assert.deepEqual(state.tour, { dismissed: false, finished: true });
});

await runScenario(scenarioNames[4], async ({ page }) => {
  await openView(page, "?robot=master");
  await closeCoach(page);
  const historyLength = await page.evaluate(() => history.length);
  await selectRobot(page, "master");
  assert.equal(await page.evaluate(() => history.length), historyLength);
  assert.equal((await readState(page)).robots.master.robotSelected, true);
});

await runScenario(scenarioNames[5], async ({ page }) => {
  await openView(page, "?robot=master");
  await closeCoach(page);
  await selectRobot(page, "master");
  await openClassicFunction(page);
  await selectRobot(page, "aegis");
  await openClassicFunction(page);
  await selectRobot(page, "navi");
  const state = await readState(page);
  assert.equal(state.robots.master.functionDetailViewed, true);
  assert.equal(state.robots.aegis.functionDetailViewed, true);
  assert.equal(state.robots.navi.functionDetailViewed, false);
  assert.equal(state.robots.navi.robotSelected, true);
});

await runScenario(scenarioNames[6], async ({ page }) => {
  await openView(page, "?robot=navi");
  await closeCoach(page);
  const search = page.locator("[data-navi-search-input]");
  await search.fill("lateral");
  await page.waitForURL(/q=lateral/);
  await page.locator('[data-navi-category-filter="Movement"]').click();
  await page.locator('[data-navi-reference-row][data-navi-reference-name="lateral"] [data-navi-reference-toggle]').click();
  await page.waitForURL(/ref=lateral/);
  const copiedUrl = page.url();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-navi-reference-detail][data-navi-reference-name="lateral"]').waitFor();
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.goForward({ waitUntil: "domcontentloaded" });
  await page.waitForURL(copiedUrl);
  assert.equal(page.url(), copiedUrl);
  await page.goto(copiedUrl, { waitUntil: "domcontentloaded" });
  await page.locator('[data-navi-reference-detail][data-navi-reference-name="lateral"]').waitFor();
});

await runScenario(scenarioNames[7], async ({ page }) => {
  await openView(page, "?robot=navi&ref=stand");
  await page.locator('[data-navi-reference-detail][data-navi-reference-name="stand"]').waitFor();
  const state = await readState(page);
  assert.equal(state?.robots.navi.robotSelected ?? false, false);
  assert.equal(state?.robots.navi.functionDetailViewed ?? false, false);
});

await runScenario(scenarioNames[8], async ({ page }) => {
  await openView(page, "?robot=navi");
  await closeCoach(page);
  assert.equal((await readState(page))?.robots.navi.functionDetailViewed ?? false, false);
  await page.locator("[data-navi-common-task]").first().click();
  assert.equal((await readState(page)).robots.navi.functionDetailViewed, true);
  await page.evaluate((key) => localStorage.removeItem(key), storageKey);
  await page.goto(`${origin}${routePath}?robot=navi`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector('[data-eaic-sdk-onboarding="true"]')?.getAttribute("data-eaic-sdk-onboarding-hydrated") === "true");
  await closeCoach(page);
  await page.locator('[data-navi-reference-row][data-navi-reference-name="stand"] [data-navi-reference-toggle]').click();
  assert.equal((await readState(page)).robots.navi.functionDetailViewed, true);
});

await runScenario(scenarioNames[9], async ({ page }) => {
  for (const robot of ["master", "aegis"]) {
    await page.goto(`${origin}${routePath}?robot=${robot}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector('[data-eaic-sdk-onboarding="true"]')?.getAttribute("data-eaic-sdk-onboarding-hydrated") === "true");
    await closeCoach(page);
    const category = page.locator("details[data-sdk-category]").first();
    await category.locator(":scope > summary").click();
    assert.equal((await readState(page))?.robots[robot].functionDetailViewed ?? false, false);
    await category.locator("details[data-sdk-function-name]").first().locator(":scope > summary").click();
    await page.waitForFunction(({ key, selectedRobot }) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw).robots[selectedRobot].functionDetailViewed === true : false;
    }, { key: storageKey, selectedRobot: robot });
    assert.equal((await readState(page)).robots[robot].functionDetailViewed, true);
    await page.evaluate((key) => localStorage.removeItem(key), storageKey);
  }
});

await runScenario(scenarioNames[10], async ({ page }) => {
  await openView(page, "?robot=master");
  await closeCoach(page);
  await page.locator('[data-sdk-setup-review="master"]').click();
  let state = await readState(page);
  assert.equal(state.robots.master.setupReviewed, true);
  assert.equal(state.robots.master.setupCopied, false);
  assert.notEqual(await page.locator('[data-eaic-sdk-onboarding-step="setup"]').getAttribute("data-eaic-sdk-onboarding-step-state"), "complete");
  await capture(page, "state-step3-one-subcheck");
  await page.locator('[data-sdk-setup-copy="master"] button').click();
  state = await readState(page);
  assert.equal(state.robots.master.setupCopied, true);
  assert.equal(await page.locator('[data-eaic-sdk-onboarding-step="setup"]').getAttribute("data-eaic-sdk-onboarding-step-state"), "complete");
  await capture(page, "state-step3-two-subchecks");
});

await runScenario(scenarioNames[11], async ({ page, context, attach }) => {
  for (const mode of ["api-resolve", "api-reject", "fallback-true", "fallback-false"]) {
    const current = mode === "api-resolve" ? page : attach(await context.newPage());
    await current.goto(`${origin}${routePath}?robot=master&copyMode=${mode}`, { waitUntil: "domcontentloaded" });
    await current.waitForFunction(() => document.querySelector('[data-eaic-sdk-onboarding="true"]')?.getAttribute("data-eaic-sdk-onboarding-hydrated") === "true");
    await current.evaluate(({ key, copyMode }) => { localStorage.removeItem(key); window.__eaicCopyMode = copyMode; }, { key: storageKey, copyMode: mode });
    await current.reload({ waitUntil: "domcontentloaded" });
    await current.waitForFunction(() => document.querySelector('[data-eaic-sdk-onboarding="true"]')?.getAttribute("data-eaic-sdk-onboarding-hydrated") === "true");
    await closeCoach(current);
    const button = current.locator('[data-sdk-setup-copy="master"] button');
    await button.click();
    const succeeds = mode === "api-resolve" || mode === "fallback-true";
    assert.equal(await button.getAttribute("title"), succeeds ? "Copied" : "Copy failed");
    assert.equal((await readState(current))?.robots.master.setupCopied ?? false, succeeds);
    if (mode === "api-reject") await capture(current, "state-copy-error");
  }
});

await runScenario(scenarioNames[12], async ({ page, context, attach }) => {
  await openView(page);
  assert.equal(await page.locator('[data-eaic-sdk-onboarding="true"]').getAttribute("data-eaic-sdk-onboarding-storage"), "persistent");
  const corruptPage = attach(await context.newPage());
  await corruptPage.goto(`${origin}${routePath}?corrupt=1`, { waitUntil: "domcontentloaded" });
  await corruptPage.evaluate((key) => localStorage.setItem(key, "{corrupt"), storageKey);
  await corruptPage.reload({ waitUntil: "domcontentloaded" });
  await corruptPage.waitForFunction(() => document.querySelector('[data-eaic-sdk-onboarding="true"]')?.getAttribute("data-eaic-sdk-onboarding-hydrated") === "true");
  assert.match(await corruptPage.locator('[data-eaic-sdk-onboarding="true"]').innerText(), /0 of 4 complete/);
  const blocked = await createAuditedContext({ storageMode: "read-failure" });
  try {
    const blockedPage = blocked.attach(await blocked.context.newPage());
    await openView(blockedPage);
    assert.equal(await blockedPage.locator('[data-eaic-sdk-onboarding="true"]').getAttribute("data-eaic-sdk-onboarding-storage"), "memory-only");
    await closeCoach(blockedPage);
    await selectRobot(blockedPage, "master");
    assert.match(await blockedPage.locator('[data-eaic-sdk-onboarding="true"]').innerText(), /1 of 4 complete/);
    const shot = `${artifactDirectory}/state-memory-only.png`;
    await blockedPage.locator('[data-eaic-sdk-onboarding="true"]').screenshot({ path: shot });
    report.screenshots.push(shot);
    await assertNoUnexpected(blocked.audit, `${scenarioNames[12]} memory-only`);
  } finally {
    await blocked.context.close();
  }
  const blockedWrite = await createAuditedContext({ storageMode: "write-failure", state: stateWith() });
  try {
    const blockedWritePage = blockedWrite.attach(await blockedWrite.context.newPage());
    await openView(blockedWritePage);
    await closeCoach(blockedWritePage);
    await selectRobot(blockedWritePage, "master");
    assert.equal(await blockedWritePage.locator('[data-eaic-sdk-onboarding="true"]').getAttribute("data-eaic-sdk-onboarding-storage"), "memory-only");
    assert.match(await blockedWritePage.locator('[data-eaic-sdk-onboarding="true"]').innerText(), /1 of 4 complete/);
    await assertNoUnexpected(blockedWrite.audit, `${scenarioNames[12]} blocked-write`);
  } finally {
    await blockedWrite.context.close();
  }
});

await runScenario(scenarioNames[13], async ({ page, context, audit, attach }) => {
  const nonLocalOrigin = origin.replace("127.0.0.1", "lvh.me").replace("localhost", "lvh.me");
  await page.goto(`${nonLocalOrigin}${routePath}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (
    window.location.pathname.startsWith("/login")
    || Boolean(document.querySelector('[data-eaic-sdk-onboarding="true"]'))
    || document.body.textContent?.includes("Sign in to open EAIC HUB.")
    || document.body.textContent?.includes("EAIC HUB is only available to developers.")
    || document.body.textContent?.includes("We could not verify developer access.")
  ));
  const gateBody = await page.locator("body").innerText();
  const isProductionGate = new URL(page.url()).pathname.startsWith("/login") || gateBody.includes("Sign in to open EAIC HUB.");
  if (!isProductionGate) {
    assert.equal(await page.locator('[data-eaic-sdk-onboarding="true"]').count(), 1, "development must retain its documented access bypass");
    return { mode: "development-bypass; full gate states run against production" };
  }
  assert.equal(await page.locator('[data-eaic-sdk-onboarding="true"]').count(), 0);
  for (const mode of ["locked", "error"]) {
    const gated = attach(await context.newPage());
    audit.accountMode = mode;
    await gated.goto(`${nonLocalOrigin}/`, { waitUntil: "domcontentloaded" });
    await gated.evaluate(() => localStorage.setItem("agentechAccount", JSON.stringify({ email: "browser-check@example.com", signedInAt: new Date().toISOString() })));
    await gated.goto(`${nonLocalOrigin}${routePath}`, { waitUntil: "domcontentloaded" });
    await gated.getByText(mode === "locked" ? "EAIC HUB is only available to developers." : "We could not verify developer access.", { exact: true }).waitFor();
    assert.equal(await gated.locator('[data-eaic-sdk-onboarding="true"]').count(), 0);
  }
  audit.errors.splice(0, audit.errors.length, ...audit.errors.filter((error) => (
    error !== "console: Failed to load resource: the server responded with a status of 500 (Internal Server Error)"
  )));
  return { mode: "production-gate", states: ["signed-out", "locked", "error"] };
});

await runScenario(scenarioNames[14], async ({ page, audit }) => {
  for (const mode of ["allow", "deny", "error"]) {
    audit.premiumMode = mode;
    await page.goto(`${origin}${routePath}?robot=navi&premiumMode=${mode}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector('[data-eaic-sdk-onboarding="true"]')?.getAttribute("data-eaic-sdk-onboarding-hydrated") === "true");
    await closeCoach(page);
    await page.locator('[data-navi-reference-row][data-navi-reference-name="return_to_home"] [data-navi-reference-toggle]').click();
    const panel = page.locator("[data-navi-premium-panel]");
    await panel.waitFor();
    await panel.getByText(mode === "allow" ? /Unlocked by monthly subscription/ : mode === "deny" ? /One-time unlock/ : /Unavailable/, { exact: false }).waitFor();
    assert.equal((await readState(page)).robots.navi.functionDetailViewed, true);
    assert.equal(audit.premiumPosts, 0);
    await page.evaluate((key) => localStorage.removeItem(key), storageKey);
  }
  assert.equal(audit.premiumGets, 3);
});

await runScenario(scenarioNames[15], async ({ page, context, attach }) => {
  const destinations = [
    ["Code Certification", "/agentech-products/eaic-hub/software-check", "software-check"],
    ["Start Coding", "/agentech-products/eaic-hub/start-coding", "start-coding"],
    ["EAIC Hub", "/agentech-products/eaic-hub", "hub"],
  ];
  for (const [label, pathname, destination] of destinations) {
    const current = label === "Code Certification" ? page : attach(await context.newPage());
    await openView(current, "?robot=master");
    await closeCoach(current);
    await chooseNextStep(current);
    if (label === "Code Certification") await capture(current, "state-contextual-prompt");
    await current.getByRole("link", { name: label, exact: true }).click();
    await current.waitForURL((url) => url.pathname === pathname);
    assert.equal((await readState(current)).robots.master.nextAction, destination);
  }
});

await runScenario(scenarioNames[16], async ({ page }) => {
  await openView(page, "?robot=navi");
  const initialActiveInCoach = await page.evaluate(() => document.querySelector('[data-eaic-sdk-onboarding-coach]')?.contains(document.activeElement));
  assert.equal(initialActiveInCoach, false, "first auto-open must not steal focus");
  await page.locator('[data-eaic-sdk-onboarding-step="explore"]').click();
  assert.equal(await page.evaluate(() => document.activeElement?.id), "view-sdk-coach-heading");
  await page.locator('[data-eaic-sdk-onboarding-coach="explore"]').press("Escape");
  assert.equal(await page.locator('[data-eaic-sdk-onboarding-step="explore"]').evaluate((element) => element === document.activeElement), true);
  await page.locator('[data-navi-reference-row][data-navi-reference-name="stand"] [data-navi-reference-toggle]').click();
  await page.locator('[data-navi-reference-detail][data-navi-reference-name="stand"]').waitFor();
  await page.locator('[data-navi-reference-row][data-navi-reference-name="stand"] [data-navi-reference-toggle]').press("Escape");
  await page.locator('[data-navi-reference-detail][data-navi-reference-name="stand"]').waitFor({ state: "detached" });
});

await runScenario(scenarioNames[17], async ({ page }) => {
  await openView(page, "?robot=master");
  await closeCoach(page);
  const selectors = [
    '[data-eaic-sdk-onboarding-step="choose"]',
    '[data-sdk-robot-option="master"]',
    '[data-sdk-setup-review="master"]',
    '[data-sdk-setup-copy="master"] button',
  ];
  for (const selector of selectors) {
    const size = await page.locator(selector).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    assert.ok(size.width >= 44 && size.height >= 44, `${selector} is at least 44 by 44`);
  }
  await page.locator('[data-sdk-robot-option="master"]').dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true });
  await page.locator('[data-sdk-robot-option="master"]').dispatchEvent("pointerup", { pointerType: "touch", isPrimary: true });
  await page.locator('[data-sdk-robot-option="master"]').click();
  assert.equal((await readState(page)).robots.master.robotSelected, true);
});

await runScenario(scenarioNames[18], async ({ page }) => {
  await openView(page, "?robot=master");
  const coach = page.locator("[data-eaic-sdk-onboarding-coach]");
  const motion = await coach.evaluate((element) => {
    const style = getComputedStyle(element);
    return { transitionDuration: style.transitionDuration, animationDuration: style.animationDuration };
  });
  assert.match(motion.transitionDuration, /^(?:0s(?:,\s*)?)+$/);
  assert.match(motion.animationDuration, /^(?:0s(?:,\s*)?)+$/);
  await coach.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("dialog", { name: "Explore Commands" }).waitFor();
}, { reducedMotion: "reduce" });

await runScenario(scenarioNames[19], async ({ page, audit }) => {
  await openView(page, "?robot=master");
  await closeCoach(page);
  await selectRobot(page, "master");
  await openClassicFunction(page);
  await reviewAndCopySetup(page);
  await page.locator('[data-eaic-sdk-onboarding-step="next"]').click();
  assert.deepEqual(audit.writes, []);
  assert.deepEqual(audit.checkout, []);
  assert.deepEqual(audit.robotCalls, []);
  assert.deepEqual(audit.onboardingFetches, []);
}, { auditOptions: { allowPremiumGet: false } });

for (const width of [1440, 768, 390]) {
  for (const theme of ["light", "dark"]) {
    const hydration = await createAuditedContext({ viewport: { width, height: 1000 }, theme, javaScriptEnabled: false });
    try {
      const hydrationPage = hydration.attach(await hydration.context.newPage());
      await hydrationPage.goto(`${origin}${routePath}?robot=master`, { waitUntil: "domcontentloaded" });
      const hydrationSurface = hydrationPage.locator('[data-eaic-sdk-onboarding="true"]');
      await hydrationSurface.waitFor();
      assert.equal(await hydrationSurface.getAttribute("data-eaic-sdk-onboarding-hydrated"), "false");
      assert.equal(await hydrationSurface.locator('[role="group"]').getAttribute("aria-busy"), "true");
      assert.match(await hydrationSurface.innerText(), /Loading progress/);
      await capture(hydrationPage, `state-hydration-${width}-${theme}`);
      await assertNoUnexpected(hydration.audit, `${width}px ${theme} hydration placeholder`);
    } finally {
      await hydration.context.close();
    }

    const seeded = stateWith({
      lastExplicitlySelectedRobot: "master",
      master: { robotSelected: true, functionDetailViewed: true, setupReviewed: true },
      tour: { dismissed: false, finished: false },
    });
    const { context, audit, attach } = await createAuditedContext({ viewport: { width, height: 1000 }, theme, state: seeded });
    try {
      const page = attach(await context.newPage());
      const surface = await openView(page, "?robot=master");
      assert.match(await surface.innerText(), /2 of 4 complete/);
      assert.match(await surface.innerText(), /✓ Instructions reviewed/);
      assert.match(await surface.innerText(), /○ Setup code copied/);

      for (const [step, title] of [["choose", "Choose Robot"], ["explore", "Explore Commands"], ["setup", "Set Up SDK"], ["next", "Next Action"]]) {
        await page.locator(`[data-eaic-sdk-onboarding-step="${step}"]`).click();
        await page.getByRole("dialog", { name: title, exact: true }).waitFor();
      }
      await page.locator('[data-sdk-next-actions="true"]').waitFor();
      await page.locator('[data-eaic-sdk-onboarding-step="setup"]').click();
      const coach = page.locator('[data-eaic-sdk-onboarding-coach="setup"]');
      await coach.waitFor();

      await page.evaluate(() => { window.__eaicCopyMode = "api-reject"; });
      const setupCopy = page.locator('[data-sdk-setup-copy="master"] button');
      await setupCopy.click();
      assert.equal(await setupCopy.getAttribute("title"), "Copy failed");
      assert.match(await surface.innerText(), /○ Setup code copied/);
      const phoneAlignment = [];
      if (width === 390) {
        const rejectedAlignment = await readRootAlignment(page, "copy-rejected");
        assertRootAlignment(rejectedAlignment, `${width}px ${theme}`, { requireContainedBody: false });
        phoneAlignment.push(rejectedAlignment);
      }

      await page.evaluate(() => { window.__eaicCopyMode = "api-resolve"; });
      await setupCopy.click();
      assert.equal(await setupCopy.getAttribute("title"), "Copied");
      assert.match(await surface.innerText(), /✓ Setup code copied/);
      assert.equal(await page.locator('[data-eaic-sdk-onboarding-step="setup"]').getAttribute("data-eaic-sdk-onboarding-step-state"), "current");
      assert.match(await page.locator('[data-eaic-sdk-onboarding-step="setup"]').innerText(), /Instructions reviewed and setup code copied/);
      if (width === 390) {
        const copiedAlignment = await readRootAlignment(page, "copy-resolved");
        assertRootAlignment(copiedAlignment, `${width}px ${theme}`);
        phoneAlignment.push(copiedAlignment);
      }

      const layout = await page.evaluate(() => {
        const surface = document.querySelector('[data-eaic-sdk-onboarding="true"]');
        let canvas = surface?.parentElement ?? null;
        while (canvas && !String(canvas.getAttribute("class") || "").includes("bg-[#f5f4f1]")) canvas = canvas.parentElement;
        const heading = document.querySelector("#view-sdk-onboarding-heading");
        const progress = heading?.nextElementSibling;
        const stepLabel = document.querySelector('[data-eaic-sdk-onboarding-step="choose"] > span:first-child > span:last-child');
        const coach = document.querySelector("[data-eaic-sdk-onboarding-coach]");
        const rect = coach?.getBoundingClientRect();
        const stepCards = [...document.querySelectorAll("[data-eaic-sdk-onboarding-step]")].map((card) => {
          const title = card.querySelector(":scope > span:first-child > span:last-child");
          const cardRect = card.getBoundingClientRect();
          const titleRect = title?.getBoundingClientRect();
          const titleLineHeight = title ? Number.parseFloat(getComputedStyle(title).lineHeight) : 0;
          return {
            step: card.getAttribute("data-eaic-sdk-onboarding-step"),
            cardRect: { top: cardRect.top, left: cardRect.left, right: cardRect.right, height: cardRect.height },
            titleRect: titleRect ? { top: titleRect.top, bottom: titleRect.bottom, height: titleRect.height } : null,
            titleLineHeight,
          };
        });
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          canvasBackground: canvas ? getComputedStyle(canvas).backgroundColor : "",
          headingColor: heading ? getComputedStyle(heading).color : "",
          progressColor: progress ? getComputedStyle(progress).color : "",
          stepLabelColor: stepLabel ? getComputedStyle(stepLabel).color : "",
          coachBackground: coach ? getComputedStyle(coach).backgroundColor : "",
          coachRect: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null,
          stepCards,
        };
      });
      assert.ok(layout.overflow <= 1, `${width}px ${theme}: no horizontal overflow`);
      assertStepCardLayout(layout.stepCards, width, theme);
      assert.ok(layout.coachRect && layout.coachRect.left >= 15 && layout.coachRect.right <= width - 15, `${width}px ${theme}: coach respects viewport insets`);
      assert.ok(layout.coachRect.top >= 0 && layout.coachRect.bottom <= 1000, `${width}px ${theme}: coach stays in the viewport`);
      if (theme === "light") {
        assert.equal(layout.canvasBackground, "rgb(245, 244, 241)", `${width}px Light keeps the warm off-white onboarding canvas`);
      } else {
        assert.equal(layout.headingColor, "rgb(229, 237, 245)", `${width}px Dark uses the scoped onboarding heading token`);
        assert.equal(layout.progressColor, "rgb(183, 193, 203)", `${width}px Dark uses the readable progress token`);
        assert.equal(layout.stepLabelColor, "rgb(229, 237, 245)", `${width}px Dark uses the readable step-label token`);
        assert.equal(layout.coachBackground, "rgb(13, 17, 23)", `${width}px Dark uses the scoped coach surface`);
      }
      const screenshot = `${artifactDirectory}/primary-${width}-${theme}.png`;
      await page.screenshot({ path: screenshot });
      report.screenshots.push(screenshot);

      if (width === 390) {
        await coach.getByRole("button", { name: "Next", exact: true }).click();
        const nextCoach = page.getByRole("dialog", { name: "Next Action", exact: true });
        await nextCoach.waitFor();
        const nextAlignment = await readRootAlignment(page, "coach-next-after-copy");
        assertRootAlignment(nextAlignment, `${width}px ${theme}`);
        phoneAlignment.push(nextAlignment);

        await nextCoach.press("Escape");
        await nextCoach.waitFor({ state: "hidden" });
        const escapeAlignment = await readRootAlignment(page, "coach-escape");
        assertRootAlignment(escapeAlignment, `${width}px ${theme}`);
        phoneAlignment.push(escapeAlignment);

        await page.getByRole("button", { name: "Restart tour", exact: true }).click();
        await page.getByRole("dialog", { name: "Choose Robot", exact: true }).waitFor();
        await page.locator('[data-eaic-sdk-onboarding-step="next"]').click();
        const finishCoach = page.getByRole("dialog", { name: "Next Action", exact: true });
        await finishCoach.waitFor();
        await finishCoach.getByRole("button", { name: "Finish", exact: true }).click();
        await finishCoach.waitFor({ state: "hidden" });
        const finishAlignment = await readRootAlignment(page, "coach-finish");
        assertRootAlignment(finishAlignment, `${width}px ${theme}`);
        phoneAlignment.push(finishAlignment);
      } else {
        await coach.getByRole("button", { name: "Skip", exact: true }).click();
        assert.equal(await page.getByRole("dialog").count(), 0);
        await page.getByRole("button", { name: "Restart tour", exact: true }).click();
        await page.getByRole("dialog", { name: "Choose Robot", exact: true }).waitFor();
      }

      const completed = stateWith({
        lastExplicitlySelectedRobot: "master",
        master: { robotSelected: true, functionDetailViewed: true, setupReviewed: true, setupCopied: true, nextAction: "software-check" },
        tour: { finished: true },
      });
      await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: storageKey, value: completed });
      await openView(page, "?robot=master&return=complete");
      assert.match(await page.locator('[data-eaic-sdk-onboarding="true"]').innerText(), /4 of 4 complete/);
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert.equal(await page.getByRole("button", { name: "Restart tour", exact: true }).count(), 1);

      report.matrix.push({
        width,
        theme,
        status: "passed",
        layout,
        phoneAlignment,
        verifiedStates: [
          "hydration-placeholder",
          "steps-1-4",
          "partial-progress",
          "step3-one-subcheck",
          "step3-two-subchecks",
          "contextual-prompt",
          "copy-error",
          "coach-closed",
          "restart",
          "all-complete-return",
        ],
      });
      await assertNoUnexpected(audit, `${width}px ${theme} visual matrix`);
    } catch (error) {
      report.status = "failed";
      report.matrix.push({ width, theme, status: "failed", error: error instanceof Error ? error.message : String(error) });
      writeFileSync(`${artifactDirectory}/browser-report.json`, `${JSON.stringify(report, null, 2)}\n`);
      throw error;
    } finally {
      await context.close();
    }

    const memoryOnly = await createAuditedContext({ viewport: { width, height: 1000 }, theme, storageMode: "read-failure" });
    try {
      const memoryPage = memoryOnly.attach(await memoryOnly.context.newPage());
      const memorySurface = await openView(memoryPage, "?robot=master&storage=blocked");
      assert.equal(await memorySurface.getAttribute("data-eaic-sdk-onboarding-storage"), "memory-only");
      assert.match(await memorySurface.innerText(), /Available for this visit/);
      await assertNoUnexpected(memoryOnly.audit, `${width}px ${theme} memory-only`);
      const matrixRow = report.matrix.find((entry) => entry.width === width && entry.theme === theme);
      matrixRow?.verifiedStates.push("memory-only");
    } finally {
      await memoryOnly.context.close();
    }
  }
}

assert.equal(report.scenarios.length, 20);
assert.deepEqual(report.scenarios.map(({ name }) => name), scenarioNames);
assert.equal(report.matrix.length, 6);
assert.deepEqual(report.unexpectedErrors, []);
assert.deepEqual(report.applicationWrites, []);
assert.deepEqual(report.checkoutActions, []);
assert.deepEqual(report.robotOrSimulatorCalls, []);
assert.deepEqual(report.onboardingNetworkRequests, []);
report.status = "passed";
writeFileSync(`${artifactDirectory}/browser-report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log("View SDK onboarding browser check passed: 20 scenarios, 6 viewport/theme combinations.");
await browser.close();
