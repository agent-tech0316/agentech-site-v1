import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const browser = await chromium.connectOverCDP(process.env.EAIC_STARTER_RULES_CDP ?? "http://127.0.0.1:9233");
const context = await browser.newContext();
const page = await context.newPage();
const origin = process.env.EAIC_STARTER_RULES_ORIGIN ?? "http://127.0.0.1:3019";
const route = "/agentech-products/eaic-hub/start-coding";
const artifacts = ".codex-artifacts/eaic-starter-rules";
const errors = [];
const writes = [];
const report = [];
mkdirSync(artifacts, { recursive: true });
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && /\/api\//.test(request.url())) writes.push(request.url());
});

try {
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${origin}${route}`);
    for (const theme of ["light", "dark"]) {
      await page.getByRole("radio", { name: theme === "light" ? "Light" : "Dark", exact: true }).click();
      await page.waitForFunction((expectedTheme) => document.documentElement.dataset.theme === expectedTheme, theme);
      const strip = page.locator("[data-eaic-starter-rules]");
      await strip.scrollIntoViewIfNeeded();
      const state = await strip.evaluate((element) => {
        const stripRect = element.getBoundingClientRect();
        const cells = [...element.querySelectorAll("[data-eaic-starter-rule]")].map((cell) => {
          const rect = cell.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(cell);
          const text = range.getBoundingClientRect();
          const style = getComputedStyle(cell);
          return {
            width: rect.width,
            height: rect.height,
            left: rect.left,
            top: rect.top,
            leftGap: text.left - rect.left,
            rightGap: rect.right - text.right,
            topGap: text.top - rect.top,
            bottomGap: rect.bottom - text.bottom,
            display: style.display,
            placeItems: style.placeItems,
            textAlign: style.textAlign,
            overflow: cell.scrollWidth - cell.clientWidth,
          };
        });
        return {
          stripWidth: stripRect.width,
          pageOverflow: document.documentElement.scrollWidth - innerWidth,
          cells,
        };
      });

      assert.equal(state.cells.length, 4, `${width}px ${theme}: four rules should render`);
      assert.equal(state.pageOverflow, 0, `${width}px ${theme}: the page must not overflow horizontally`);
      for (const cell of state.cells) {
        assert.equal(cell.display, "grid");
        assert.equal(cell.placeItems, "center");
        assert.equal(cell.textAlign, "center");
        assert.equal(cell.overflow, 0, `${width}px ${theme}: rule text must wrap without overflow`);
        assert.ok(Math.abs(cell.leftGap - cell.rightGap) <= 1.5, `${width}px ${theme}: rule text must be horizontally centered`);
        assert.ok(Math.abs(cell.topGap - cell.bottomGap) <= 1.5, `${width}px ${theme}: rule text must be vertically centered`);
      }
      const widths = state.cells.map(({ width: cellWidth }) => cellWidth);
      assert.ok(Math.max(...widths) - Math.min(...widths) <= 1, `${width}px ${theme}: all rule cells must have equal widths`);
      if (width >= 768) {
        assert.ok(state.cells.every(({ top }) => Math.abs(top - state.cells[0].top) <= 1), `${width}px ${theme}: rules should share one row`);
      } else {
        assert.ok(state.cells.every(({ width: cellWidth }) => Math.abs(cellWidth - state.stripWidth) <= 2.5), `${width}px ${theme}: mobile rules should stack at full width inside the strip border`);
      }
      await strip.screenshot({ path: `${artifacts}/${width}-${theme}.png` });
      report.push({ width, theme, stripWidth: state.stripWidth, cells: state.cells });
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, [], "layout verification must not call application write APIs");
  console.log(JSON.stringify({ status: "passed", route, report, errors, writes }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
