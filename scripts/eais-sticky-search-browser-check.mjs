import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const origin = process.env.EAIS_STICKY_SEARCH_ORIGIN ?? "http://127.0.0.1:3005";
const artifactLabel = process.env.EAIS_STICKY_SEARCH_ARTIFACT_LABEL ?? "final";
const artifacts = `.codex-artifacts/eais-sticky-search/${artifactLabel}`;
mkdirSync(artifacts, { recursive: true });

const browser = process.env.EAIS_STICKY_SEARCH_CDP
  ? await chromium.connectOverCDP(process.env.EAIS_STICKY_SEARCH_CDP)
  : await chromium.launch({
      executablePath: process.env.EAIS_STICKY_SEARCH_BROWSER ?? "/Applications/Google Chrome 2.app/Contents/MacOS/Google Chrome",
      headless: true
    });
const report = {
  origin,
  route: "/agentech-products/eais",
  browserMode: process.env.EAIS_STICKY_SEARCH_CDP ? "cdp" : "isolated",
  views: [],
  status: "running"
};

async function nextPaint(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function scrollToPosition(page, destination) {
  await page.evaluate(destination => window.scrollTo({ top: destination, behavior: "instant" }), destination);
  await page.waitForFunction(destination => Math.abs(window.scrollY - destination) < 2, destination);
  await nextPaint(page);
}

async function scrollTargetNearTop(page, selector) {
  const destination = await page.locator(selector).evaluate(element => {
    const target = window.scrollY + element.getBoundingClientRect().top - 240;
    return Math.max(0, Math.min(target, document.documentElement.scrollHeight - innerHeight));
  });
  await scrollToPosition(page, destination);
}

async function openPage(page, theme) {
  await page.context().addInitScript(theme => localStorage.setItem("agentech-theme", theme), theme);
  let response;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    response = await page.goto(`${origin}/agentech-products/eais`, { waitUntil: "domcontentloaded" });
    if (response?.status() === 200) break;
  }
  assert.equal(response?.status(), 200);
  await page.locator("[data-eais-search]").waitFor();
  await page.locator("[data-eais-pagination]").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(theme => {
    const mode = document.documentElement.dataset.themeMode;
    const selected = document.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute("aria-label")?.toLowerCase();
    return mode === theme && selected === theme;
  }, theme);
}

async function stickyGeometry(page, targetSelector) {
  return page.evaluate(targetSelector => {
    const siteHeader = document.querySelector("[data-site-header]");
    const search = document.querySelector("[data-eais-search]");
    const input = search?.querySelector("input");
    const searchShell = input?.closest("label");
    const target = document.querySelector(targetSelector);
    if (!siteHeader || !search || !input || !searchShell || !target) throw new Error("Sticky search geometry target is unavailable");
    const headerRect = siteHeader.getBoundingClientRect();
    const searchRect = search.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    const shellRect = searchShell.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const style = getComputedStyle(search);
    return {
      rootOverflow: {
        html: getComputedStyle(document.documentElement).overflowX,
        body: getComputedStyle(document.body).overflowX
      },
      header: { top: headerRect.top, bottom: headerRect.bottom, height: headerRect.height, zIndex: getComputedStyle(siteHeader).zIndex },
      search: {
        top: searchRect.top,
        bottom: searchRect.bottom,
        height: searchRect.height,
        position: style.position,
        zIndex: style.zIndex,
        backgroundColor: style.backgroundColor,
        edgeCoverage: {
          left: search.contains(document.elementFromPoint(1, searchRect.bottom - 2)),
          right: search.contains(document.elementFromPoint(innerWidth - 2, searchRect.bottom - 2))
        }
      },
      input: { top: inputRect.top, bottom: inputRect.bottom, width: inputRect.width, height: inputRect.height },
      searchShell: { top: shellRect.top, bottom: shellRect.bottom, width: shellRect.width, height: shellRect.height },
      target: { top: targetRect.top, bottom: targetRect.bottom },
      viewport: { width: innerWidth, height: innerHeight },
      overflow: document.documentElement.scrollWidth - innerWidth
    };
  }, targetSelector);
}

async function assertSearchDocked(page, targetSelector, context) {
  const geometry = await stickyGeometry(page, targetSelector);
  assert.equal(geometry.search.position, "sticky", `${context}: search region must use sticky positioning`);
  assert.ok(geometry.header.top >= -1 && geometry.header.top <= 1, `${context}: global header must remain docked at the viewport top (${JSON.stringify(geometry)})`);
  assert.ok(geometry.search.top >= geometry.header.bottom - 1, `${context}: search must not sit behind the global header (${JSON.stringify(geometry)})`);
  assert.ok(geometry.search.top <= geometry.header.bottom + 2, `${context}: search must dock directly below the global header (${JSON.stringify(geometry)})`);
  assert.ok(geometry.input.top >= geometry.search.top && geometry.input.bottom <= geometry.search.bottom, `${context}: input must remain inside the visible sticky region`);
  assert.ok(geometry.searchShell.height >= 44, `${context}: search control must remain touch friendly`);
  assert.notEqual(geometry.search.backgroundColor, "rgba(0, 0, 0, 0)", `${context}: scrolled content must not bleed through the sticky region`);
  if (geometry.viewport.width < 768) {
    assert.deepEqual(geometry.search.edgeCoverage, { left: true, right: true }, `${context}: phone sticky background must cover both viewport edges`);
  }
  assert.equal(geometry.overflow, 0, `${context}: page must not overflow horizontally`);
  return geometry;
}

async function navigateToAnchor(page, width, hash, linkName) {
  await scrollToPosition(page, 0);
  if (hash === "#all-works") {
    await page.getByRole("link", { name: "Explore the works", exact: true }).click();
  } else if (width >= 1024) {
    await page.getByRole("navigation", { name: "EAIS page navigation" }).getByRole("link", { name: linkName, exact: true }).click();
  } else {
    const details = page.locator('details:has(nav[aria-label="EAIS mobile navigation"])');
    if (!(await details.evaluate(element => element.open))) await details.locator("summary").click();
    await details.getByRole("navigation", { name: "EAIS mobile navigation" }).getByRole("link", { name: linkName, exact: true }).click();
  }
  await page.waitForFunction(hash => location.hash === hash, hash);
  await page.waitForFunction(hash => {
    const target = document.querySelector(hash);
    if (!target) return false;
    const margin = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    const maxScroll = document.documentElement.scrollHeight - innerHeight;
    return Math.abs(target.getBoundingClientRect().top - margin) < 2 || Math.abs(scrollY - maxScroll) < 2;
  }, hash);
  await nextPaint(page);
  const geometry = await assertSearchDocked(page, hash, `${width}px ${hash}`);
  assert.ok(geometry.target.top >= geometry.search.bottom + 12, `${width}px ${hash}: anchor target must clear the global header and sticky search`);
  return geometry;
}

async function assertSiteNavigationLayer(page, width) {
  const searchZ = Number(await page.locator("[data-eais-search]").evaluate(element => getComputedStyle(element).zIndex));
  const headerZ = Number(await page.locator("[data-site-header]").evaluate(element => getComputedStyle(element).zIndex));
  assert.ok(headerZ > searchZ, "Global header must remain above the sticky search");

  if (width < 1024) {
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    const drawer = page.locator("[data-site-mobile-drawer]");
    await drawer.waitFor({ state: "visible" });
    assert.equal(await drawer.getAttribute("aria-hidden"), "false");
    await page.waitForFunction(() => {
      const drawer = document.querySelector("[data-site-mobile-drawer]");
      return drawer && Math.abs(drawer.getBoundingClientRect().right - innerWidth) < 1;
    });
    assert.equal(await drawer.evaluate(element => {
      const search = document.querySelector("[data-eais-search]").getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const point = document.elementFromPoint(rect.left + 12, Math.max(rect.top + 12, search.top + 12));
      return element.contains(point);
    }), true, "Mobile drawer must paint above the sticky search");
    await page.getByRole("button", { name: "Close navigation", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("[data-site-mobile-drawer]")?.getAttribute("aria-hidden") === "true");
    return;
  }

  const menu = page.locator('[data-service-menu][data-menu-name="Platform"]:not([data-mobile="true"])');
  await menu.locator("[data-service-menu-trigger]").hover();
  await page.waitForFunction(() => document.querySelector('[data-service-menu][data-menu-name="Platform"]:not([data-mobile="true"])')?.getAttribute("data-open") === "true");
  const panel = menu.locator("[data-service-menu-panel]");
  assert.equal(await panel.isVisible(), true);
  assert.equal(await panel.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const point = document.elementFromPoint(rect.left + 18, rect.top + 18);
    return element.contains(point);
  }), true, "Desktop Platform menu must paint above the sticky search");
  await page.mouse.move(0, page.viewportSize().height - 1);
}

async function assertModalLayer(page) {
  const work = page.locator("[data-eais-work-card]").first();
  await work.scrollIntoViewIfNeeded();
  await work.click();
  const dialog = page.locator("[data-eais-work-dialog][open]");
  await dialog.waitFor();
  assert.equal(await dialog.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const point = document.elementFromPoint(rect.left + rect.width / 2, rect.top + Math.min(80, rect.height / 2));
    return element.contains(point);
  }), true, "Work dialog must remain in the top layer above the sticky search");
  await page.getByRole("button", { name: "Close work detail", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
}

try {
  for (const theme of ["light", "dark"]) {
    for (const width of [1440, 768, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 1440 ? 1000 : 844 },
        colorScheme: theme,
        hasTouch: width < 1024
      });
      const page = await context.newPage();
      const pageErrors = [];
      const consoleErrors = [];
      page.on("pageerror", error => pageErrors.push(error.message));
      page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });

      try {
        await openPage(page, theme);
        const initial = await stickyGeometry(page, "[data-eais-public-page]");

        await scrollTargetNearTop(page, "[data-eais-featured-work]");
        const works = await assertSearchDocked(page, "[data-eais-featured-work]", `${width}px ${theme} works`);

        await scrollTargetNearTop(page, "[data-eais-process]");
        const process = await assertSearchDocked(page, "[data-eais-process]", `${width}px ${theme} process`);

        await scrollToPosition(page, 0);
        const returned = await stickyGeometry(page, "[data-eais-public-page]");
        assert.ok(Math.abs(returned.search.top - initial.search.top) <= 1, "Returning to the top must not shift the search region");
        assert.ok(Math.abs(returned.search.height - initial.search.height) <= 1, "Sticky behavior must not change search-region height");

        const anchors = {
          featured: await navigateToAnchor(page, width, "#featured-work", "Featured"),
          allWorks: await navigateToAnchor(page, width, "#all-works", "Explore works"),
          process: await navigateToAnchor(page, width, "#how-it-works", "How ideas take shape")
        };

        await page.getByRole("button", { name: "Page 2", exact: true }).click();
        await page.waitForFunction(() => document.querySelector("[data-eais-pagination]")?.getAttribute("data-current-page") === "2");
        const input = page.getByPlaceholder("Search an idea, robot, or scene");
        await input.fill("rover");
        await page.waitForFunction(() => document.querySelector("[data-eais-pagination-summary]")?.textContent?.includes("Showing 1–2 of 2 works"));
        assert.equal(await page.locator("[data-eais-pagination]").getAttribute("data-current-page"), "1", "Searching from page two must reset pagination");
        assert.deepEqual(await page.locator("[data-eais-work-card] strong").allTextContents(), ["Night Run Rover", "Build a Rover Day"]);
        await input.fill("");
        await page.waitForFunction(() => document.querySelector("[data-eais-pagination-summary]")?.textContent?.includes("Showing 1–3 of 9 works"));

        await assertSiteNavigationLayer(page, width);
        await assertModalLayer(page);

        await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
        await nextPaint(page);
        const footerRelease = await page.evaluate(() => {
          const search = document.querySelector("[data-eais-search]").getBoundingClientRect();
          const footer = document.querySelector("[data-site-footer-inner]").closest("footer").getBoundingClientRect();
          return { searchBottom: search.bottom, footerTop: footer.top, overlap: search.bottom - footer.top };
        });
        assert.ok(footerRelease.overlap <= 1, "Sticky search must not cover the site footer");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
        assert.deepEqual(pageErrors, []);
        assert.deepEqual(consoleErrors, []);

        await scrollTargetNearTop(page, "[data-eais-process]");
        await page.screenshot({ path: `${artifacts}/${width}-${theme}-process.png` });
        report.views.push({ width, theme, initial, works, process, returned, anchors, footerRelease, pageErrors, consoleErrors });
      } finally {
        await context.close();
      }
    }
  }

  report.status = "passed";
  writeFileSync(`${artifacts}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, views: report.views.map(view => ({
    width: view.width,
    theme: view.theme,
    stickyTop: view.works.search.top,
    stickyHeight: view.works.search.height,
    footerOverlap: view.footerRelease.overlap,
    pageErrors: view.pageErrors.length,
    consoleErrors: view.consoleErrors.length
  })) }, null, 2));
} catch (error) {
  report.status = "failed";
  report.error = error instanceof Error ? error.stack : String(error);
  writeFileSync(`${artifacts}/failure.json`, `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
}
