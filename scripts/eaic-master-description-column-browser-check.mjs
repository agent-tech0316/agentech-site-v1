import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const browser = await chromium.connectOverCDP(process.env.EAIC_MASTER_DESCRIPTION_CDP ?? "http://127.0.0.1:9233");
const context = await browser.newContext();
const page = await context.newPage();
const origin = process.env.EAIC_MASTER_DESCRIPTION_ORIGIN ?? "http://127.0.0.1:3019";
const route = "/agentech-products/eaic-hub/view-sdk";
const artifacts = ".codex-artifacts/eaic-all-sdk-trailing-column";
const expectedCategoryCounts = {
  Master: {
    "Joint Adjustments": 13,
    Sensing: 4,
    Actions: 22,
  },
  Aegis: {
    Movement: 12,
    Posture: 7,
    Safety: 2,
    Sensing: 3,
  },
  Navi: {
    Movement: 6,
    Athletics: 6,
    Actions: 92,
    Posture: 13,
    Safety: 2,
    Sensing: 5,
    Configuration: 6,
  },
};
const expectedDocumentationHashes = {
  Master: "327e56e0b327bd69fe740f1773f7650965a9277c27619d90ad9f94f05e49f715",
  Aegis: "eb914026d2891bc08b73aed84fe6fe0c4be1707d74318ffd1944ae7cfa0aa89e",
  Navi: "9ebdf45e92279a907878b3565a871de3bb63112e216f00d19d0572c744696ca6",
};
const errors = [];
const writes = [];
const report = [];

mkdirSync(artifacts, { recursive: true });
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error" && !/Failed to load resource: the server responded with a status of 401 \(Unauthorized\)/.test(message.text())) {
    errors.push(`console: ${message.text()}`);
  }
});
page.on("requestfailed", (request) => {
  if (["document", "script", "stylesheet"].includes(request.resourceType())) {
    errors.push(`requestfailed: ${request.method()} ${request.url()}`);
  }
});
page.on("request", (request) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && /\/api\//.test(request.url())) {
    writes.push(`${request.method()} ${request.url()}`);
  }
});

function hashDocumentation(text) {
  return createHash("sha256").update(text.replace(/\s+/g, " ").trim()).digest("hex");
}

function assertTrailingRows(rows, { width, theme, robot }) {
  assert.ok(rows.every((row) => row.compact && row.hasArrow && row.trailing), `${width}px ${theme} ${robot}: every targeted row must use the trailing compact layout`);
  if (width === 1440) {
    const descriptionStarts = rows.map((row) => row.descriptionLeft);
    const startSpread = Math.max(...descriptionStarts) - Math.min(...descriptionStarts);
    const minimumGap = Math.min(...rows.map((row) => row.descriptionLeft - row.controlsRight));
    const maximumTrailingInset = Math.max(...rows.map((row) => row.summaryRight - row.descriptionRight));
    assert.ok(startSpread <= 1.5, `1440px ${theme} ${robot}: descriptions must share one trailing-column start (spread ${startSpread.toFixed(2)}px)`);
    assert.ok(minimumGap >= 32, `1440px ${theme} ${robot}: descriptions need at least 32px after details (minimum ${minimumGap.toFixed(2)}px)`);
    assert.ok(maximumTrailingInset <= 17, `1440px ${theme} ${robot}: descriptions must finish at the row's trailing padding (maximum inset ${maximumTrailingInset.toFixed(2)}px)`);
  } else {
    assert.ok(
      rows.every((row) => row.descriptionTop >= row.controlsBottom - 1),
      `${width}px ${theme} ${robot}: descriptions must stack below the compact command controls`,
    );
  }
}

try {
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });
    assert.equal(new URL(page.url()).pathname, route, `${width}px must stay on the exact View SDK route`);
    await page.evaluate(() => document.fonts.ready);

    for (const theme of ["light", "dark"]) {
      await page.getByRole("radio", { name: theme === "light" ? "Light" : "Dark", exact: true }).click();
      await page.waitForFunction((expectedTheme) => document.documentElement.dataset.theme === expectedTheme, theme);

      for (const robot of ["Master", "Aegis", "Navi"]) {
        await page.getByRole("button", { name: robot, exact: true }).click();
        await page.waitForTimeout(80);

        const region = page.locator("[data-sdk-documentation-region]");
        const categories = region.locator("details[data-sdk-category]");
        await categories.evaluateAll((elements) => elements.forEach((element) => { element.open = true; }));
        const documentation = await region.evaluate((element) => {
          const clone = element.children[1]?.cloneNode(true);
          clone?.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
          return clone?.textContent ?? "";
        });
        assert.equal(
          hashDocumentation(documentation),
          expectedDocumentationHashes[robot],
          `${width}px ${theme} ${robot}: command copy must remain unchanged`,
        );

        const summaries = region.locator("details[data-sdk-function-name] > summary");
        const layout = await summaries.evaluateAll((elements) => elements.map((summary) => {
          const signature = summary.querySelector('[data-sdk-function-signature="true"]');
          const controls = summary.querySelector('[data-sdk-function-controls="true"]');
          const description = summary.querySelector('[data-sdk-function-description="true"]');
          const arrow = summary.querySelector('[data-sdk-function-arrow="true"]');
          const rect = summary.getBoundingClientRect();
          const signatureRect = signature?.getBoundingClientRect();
          const controlsRect = controls?.getBoundingClientRect();
          const descriptionRect = description?.getBoundingClientRect();
          return {
            name: summary.parentElement?.getAttribute("data-sdk-function-name") ?? "",
            category: summary.closest("details[data-sdk-category]")?.getAttribute("data-sdk-category") ?? "",
            compact: summary.getAttribute("data-sdk-function-summary-layout") === "compact-leading",
            trailing: summary.getAttribute("data-sdk-description-layout") === "trailing-column"
              || summary.getAttribute("data-sdk-master-description-layout") === "trailing-column"
              || summary.getAttribute("data-sdk-movement-description-layout") === "trailing-column",
            hasArrow: Boolean(arrow),
            hasDescription: Boolean(description),
            summaryLeft: rect.left,
            summaryRight: rect.right,
            signatureLeft: signatureRect?.left ?? 0,
            signatureRight: signatureRect?.right ?? 0,
            signatureTop: signatureRect?.top ?? 0,
            controlsLeft: controlsRect?.left ?? 0,
            controlsRight: controlsRect?.right ?? 0,
            controlsTop: controlsRect?.top ?? 0,
            controlsBottom: controlsRect?.bottom ?? 0,
            descriptionLeft: descriptionRect?.left ?? 0,
            descriptionRight: descriptionRect?.right ?? 0,
            descriptionTop: descriptionRect?.top ?? 0,
            descriptionBottom: descriptionRect?.bottom ?? 0,
            scrollOverflow: summary.scrollWidth - summary.clientWidth,
          };
        }));

        assert.ok(layout.every((row) => row.scrollOverflow <= 1), `${width}px ${theme} ${robot}: no function row may overflow`);
        const actualCategoryCounts = Object.fromEntries(
          [...new Set(layout.map((row) => row.category))].map((category) => [
            category,
            layout.filter((row) => row.category === category).length,
          ]),
        );
        assert.deepEqual(
          actualCategoryCounts,
          expectedCategoryCounts[robot],
          `${width}px ${theme} ${robot}: every documented category and function must be covered`,
        );
        assert.ok(layout.every((row) => row.hasDescription), `${width}px ${theme} ${robot}: every row must retain its description slot`);
        assertTrailingRows(layout, { width, theme, robot });

        if (width === 1440 && theme === "dark" && robot !== "Master") {
          for (const category of Object.keys(expectedCategoryCounts[robot])) {
            if (category === "Movement") continue;
            await region.locator(`details[data-sdk-category="${category}"]`).screenshot({
              path: `${artifacts}/1440-dark-${robot.toLowerCase()}-${category.toLowerCase().replaceAll(" ", "-")}.png`,
              animations: "disabled",
            });
          }
        }

        if (robot !== "Master") {
          await region.locator('details[data-sdk-category="Movement"]').screenshot({
            path: `${artifacts}/${width}-${theme}-${robot.toLowerCase()}-movement.png`,
            animations: "disabled",
          });
        }
        report.push({ width, theme, robot, rows: layout.length });
      }

      await page.getByRole("button", { name: "Master", exact: true }).click();
      await page.locator("details[data-sdk-category]").evaluateAll((elements) => elements.forEach((element) => { element.open = true; }));
      await page.locator("[data-sdk-documentation-region]").screenshot({
        path: `${artifacts}/${width}-${theme}-master.png`,
        animations: "disabled",
      });
    }
  }

  assert.deepEqual(errors, [], "the browser run must not produce runtime or console errors");
  assert.deepEqual(writes, [], "layout verification must not call application write APIs");
  console.log(JSON.stringify({ status: "passed", route, expectedDocumentationHashes, report, errors, writes }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
