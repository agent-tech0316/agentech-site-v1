import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const origin = process.env.EAIS_NAVIGATION_ORIGIN ?? "http://127.0.0.1:3005";
const artifacts = ".codex-artifacts/eais-feature-navigation";
let browser;

before(async () => {
  browser = await chromium.connectOverCDP(process.env.EAIS_NAVIGATION_CDP ?? "http://127.0.0.1:9233");
  mkdirSync(artifacts, { recursive: true });
});
after(async () => { await browser?.close(); });

async function withPage(width, theme, reducedMotion, run) {
  const context = await browser.newContext({
    viewport: { width, height: width < 768 ? 844 : 1000 },
    hasTouch: true,
    reducedMotion,
    colorScheme: theme
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await context.addInitScript(theme => localStorage.setItem("agentech-theme", theme), theme);
  try {
    const response = await page.goto(`${origin}/agentech-products/eais`, { waitUntil: "domcontentloaded" });
    assert.equal(response?.status(), 200);
    await page.locator("[data-eais-work-list]").waitFor();
    await page.locator("[data-eais-pagination]").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(theme => {
      const mode = document.documentElement.dataset.themeMode;
      const selected = document.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute("aria-label")?.toLowerCase();
      return mode === theme && selected === theme;
    }, theme);
    await run(page);
    assert.deepEqual(errors, [], "No browser errors");
  } finally {
    await context.close();
  }
}

async function waitForPage(page, currentPage) {
  await page.waitForFunction(currentPage => (
    document.querySelector("[data-eais-pagination]")?.getAttribute("data-current-page") === String(currentPage)
  ), currentPage);
}

async function assertNoOverflow(page, message) {
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - innerWidth,
    pagination: (() => {
      const pagination = document.querySelector("[data-eais-pagination]");
      return pagination.scrollWidth - pagination.clientWidth;
    })()
  }));
  assert.ok(overflow.document <= 1, `${message}: no page-level horizontal overflow`);
  assert.ok(overflow.pagination <= 1, `${message}: pagination stays within its container`);
}

for (const theme of ["light", "dark"]) {
  for (const width of [390, 768, 1440]) {
    test(`${width}px ${theme}: unified work pagination remains usable`, async () => {
      await withPage(width, theme, "no-preference", async page => {
        const workList = page.locator("[data-eais-work-list]");
        const pagination = page.locator("[data-eais-pagination]");
        const previous = pagination.getByRole("button", { name: "Previous page", exact: true });
        const next = pagination.getByRole("button", { name: "Next page", exact: true });

        assert.equal(await workList.count(), 1, "There is one unambiguous work list");
        assert.equal(await workList.locator("[data-eais-work-card]").count(), 3, "Page one has three featured-first works");
        assert.equal(await pagination.getAttribute("data-current-page"), "1");
        assert.equal(await pagination.getAttribute("data-total-pages"), "3");
        assert.equal(await previous.isDisabled(), true);
        assert.equal(await next.isDisabled(), false);

        const targets = await pagination.locator("button").evaluateAll(buttons => buttons.map(button => ({
          width: button.getBoundingClientRect().width,
          height: button.getBoundingClientRect().height
        })));
        assert.ok(targets.every(target => target.width >= 44 && target.height >= 44), "Pagination targets are at least 44px");

        await next.scrollIntoViewIfNeeded();
        await next.focus();
        await page.keyboard.press("Tab");
        await page.keyboard.press("Shift+Tab");
        const focusStyle = await next.evaluate(button => {
          const style = getComputedStyle(button);
          return {
            active: document.activeElement === button,
            focusVisible: button.matches(":focus-visible"),
            outlineStyle: style.outlineStyle,
            outlineWidth: parseFloat(style.outlineWidth),
            outlineOffset: parseFloat(style.outlineOffset)
          };
        });
        assert.deepEqual(focusStyle, { active: true, focusVisible: true, outlineStyle: "solid", outlineWidth: 3, outlineOffset: 3 }, "Keyboard focus is explicit and visible");
        await page.keyboard.press("Enter");
        await waitForPage(page, 2);
        assert.match(await page.locator("[data-eais-pagination-summary]").innerText(), /Showing 4–6 of 9 works/i);
        assert.equal(await next.evaluate(button => document.activeElement === button), true, "Paging does not steal control focus");

        const work = workList.locator("[data-eais-work-card]").first();
        const cta = work.locator("b");
        await work.scrollIntoViewIfNeeded();
        const ctaStyle = await cta.evaluate(element => {
          const style = getComputedStyle(element);
          return {
            border: parseFloat(style.borderTopWidth),
            radius: parseFloat(style.borderTopLeftRadius),
            width: element.getBoundingClientRect().width,
            parentWidth: element.parentElement.getBoundingClientRect().width
          };
        });
        assert.ok(ctaStyle.border >= 1 && ctaStyle.radius >= 10, "Discovery CTA has a rounded outline");
        assert.ok(ctaStyle.width < ctaStyle.parentWidth - 20, "Outline hugs the CTA rather than the card");
        assert.equal(await work.locator("button, a").count(), 0, "CTA does not nest another interactive element inside the card button");

        await cta.click();
        await page.locator("[data-eais-work-dialog][open]").waitFor();
        await page.getByRole("button", { name: "Close work detail", exact: true }).click();
        await page.locator("[data-eais-work-dialog][open]").waitFor({ state: "detached" });
        await page.waitForFunction(() => document.activeElement?.hasAttribute("data-eais-work-card"));
        assert.equal(await work.evaluate(button => document.activeElement === button), true, "Closing the dialog restores focus to its work card");

        await assertNoOverflow(page, `${width}px ${theme}`);
        await page.locator("[data-eais-featured-work]").screenshot({ path: `${artifacts}/${width}-${theme}-unified-works.png` });
        await work.screenshot({ path: `${artifacts}/${width}-${theme}-discovery-card.png` });
      });
    });
  }
}

test("Reduced motion and viewport resizing preserve pagination behavior", async () => {
  await withPage(390, "light", "reduce", async page => {
    const workList = page.locator("[data-eais-work-list]");
    const pagination = page.locator("[data-eais-pagination]");
    const next = pagination.getByRole("button", { name: "Next page", exact: true });
    const card = workList.locator("[data-eais-work-card]").first();

    await card.hover();
    assert.equal(await card.evaluate(element => getComputedStyle(element).transitionDuration), "0s", "Reduced motion removes card transitions");
    assert.equal(await card.evaluate(element => getComputedStyle(element).transform), "none", "Reduced motion removes hover movement");

    await workList.evaluate(element => element.scrollTo({ left: element.scrollWidth, behavior: "instant" }));
    await next.click();
    await waitForPage(page, 2);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.ok(Math.abs(await workList.evaluate(element => element.scrollLeft)) < 2, "Paging resets the horizontal work strip immediately");

    await page.setViewportSize({ width: 768, height: 1000 });
    assert.ok(await workList.evaluate(element => element.scrollWidth <= element.clientWidth + 1), "Tablet resize restores the three-column grid");
    await assertNoOverflow(page, "768px resize");

    await page.setViewportSize({ width: 390, height: 844 });
    const targets = await pagination.locator("button").evaluateAll(buttons => buttons.map(button => ({
      width: button.getBoundingClientRect().width,
      height: button.getBoundingClientRect().height
    })));
    assert.ok(targets.every(target => target.width >= 44 && target.height >= 44), "Phone targets remain at least 44px after resizing");
    assert.equal(await pagination.getAttribute("data-current-page"), "2", "Resizing preserves the selected page");
    await assertNoOverflow(page, "390px resize");
  });
});
