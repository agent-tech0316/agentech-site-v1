import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const origin = process.env.EAIS_ACTION_ORIGIN ?? "http://127.0.0.1:3005";
const artifactLabel = process.env.EAIS_ACTION_ARTIFACT_LABEL ?? "final";
const artifacts = `.codex-artifacts/eais-primary-action/${artifactLabel}`;
mkdirSync(artifacts, { recursive: true });

const browser = await chromium.connectOverCDP(process.env.EAIS_ACTION_CDP ?? "http://127.0.0.1:9233");
const context = await browser.newContext();
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });

const report = { origin, route: "/agentech-products/eais", views: [], pageErrors, consoleErrors };

function rgb(value) {
  return value.replaceAll(" ", "");
}

async function readStyles(action) {
  return action.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      borderRadius: style.borderRadius,
      minHeight: style.minHeight,
      height: element.getBoundingClientRect().height,
      boxShadow: style.boxShadow,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineOffset: style.outlineOffset,
    };
  });
}

try {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const response = await page.goto(`${origin}/agentech-products/eais`, { waitUntil: "domcontentloaded" });
    assert.equal(response?.status(), 200);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => {
      const mode = document.documentElement.dataset.themeMode;
      const selected = document.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute("aria-label")?.toLowerCase();
      return Boolean(mode && selected === mode);
    });

    for (const theme of ["light", "dark"]) {
      await page.getByRole("radio", { name: theme === "light" ? "Light" : "Dark", exact: true }).click();
      await page.waitForFunction(expected => {
        const selected = document.querySelector(`[role="radio"][aria-label="${expected === "light" ? "Light" : "Dark"}"]`);
        return document.documentElement.dataset.theme === expected
          && document.documentElement.dataset.themeMode === expected
          && selected?.getAttribute("aria-checked") === "true";
      }, theme);
      const action = page.getByRole("link", { name: /Explore the works/, exact: false });
      await action.scrollIntoViewIfNeeded();
      const expectedBackground = theme === "light" ? "rgb(24,24,24)" : "rgb(145,223,255)";
      const actionElement = await action.elementHandle();
      await page.waitForFunction(({ element, expected }) => getComputedStyle(element).backgroundColor.replaceAll(" ", "") === expected, { element: actionElement, expected: expectedBackground });

      const base = await readStyles(action);
      assert.ok(base.height >= 44, `${width}px ${theme}: primary action must remain at least 44px tall`);
      assert.equal(base.borderRadius, "12px", `${width}px ${theme}: radius must remain unchanged`);
      if (theme === "light") {
        assert.equal(rgb(base.backgroundColor), "rgb(24,24,24)", `${width}px Light: use the restrained #181818 action background`);
        assert.equal(rgb(base.color), "rgb(255,255,255)", `${width}px Light: keep white action text`);
      } else {
        assert.equal(rgb(base.backgroundColor), "rgb(145,223,255)", `${width}px Dark: preserve the existing blue action background`);
        assert.equal(rgb(base.color), "rgb(6,23,33)", `${width}px Dark: preserve the existing dark action text`);
      }

      await action.hover();
      if (theme === "light") {
        await page.waitForFunction(element => getComputedStyle(element).backgroundColor.replaceAll(" ", "") === "rgb(42,42,42)", actionElement);
      }
      const hovered = await readStyles(action);
      if (theme === "light") {
        assert.equal(rgb(hovered.backgroundColor), "rgb(42,42,42)", `${width}px Light: hover should soften to #2a2a2a`);
      } else {
        assert.equal(rgb(hovered.backgroundColor), rgb(base.backgroundColor), `${width}px Dark: hover background must remain unchanged`);
      }

      await page.mouse.move(0, 0);
      await page.getByPlaceholder("Search an idea, robot, or scene").focus();
      await page.keyboard.press("Tab");
      assert.equal(await action.evaluate(element => document.activeElement === element), true, `${width}px ${theme}: Tab must reach the primary action`);
      const focusedAction = await action.elementHandle();
      await page.waitForFunction(element => {
        const style = getComputedStyle(element);
        return style.boxShadow !== "none" || (style.outlineStyle !== "none" && style.outlineWidth !== "0px");
      }, focusedAction);
      const focused = await readStyles(action);
      assert.equal(focused.outlineStyle, "solid", `${width}px ${theme}: keyboard focus must use an explicit outline`);
      assert.equal(focused.outlineWidth, "3px", `${width}px ${theme}: keyboard focus outline must stay 3px wide`);
      assert.equal(focused.outlineOffset, "3px", `${width}px ${theme}: keyboard focus outline must stay separated from the action`);
      if (theme === "dark") assert.equal(rgb(focused.backgroundColor), rgb(base.backgroundColor), `${width}px Dark: focus background must remain unchanged`);
      if (width === 390) assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `${theme}: phone page must not overflow horizontally`);

      await page.locator("section").first().screenshot({ path: `${artifacts}/${width}-${theme}.png` });
      report.views.push({ width, theme, base, hovered, focused });
    }
  }

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
