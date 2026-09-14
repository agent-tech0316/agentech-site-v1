import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const browser = await chromium.connectOverCDP(process.env.EAIC_SDK_FONTS_CDP ?? "http://127.0.0.1:9233");
const context = await browser.newContext();
const page = await context.newPage();
const origin = process.env.EAIC_SDK_FONTS_ORIGIN ?? "http://127.0.0.1:3019";
const route = "/agentech-products/eaic-hub/view-sdk";
const artifacts = ".codex-artifacts/eaic-sdk-fonts";
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
        await categories.evaluateAll((elements) => elements.forEach((element) => { element.open = false; }));
        const category = categories.first();
        await category.locator(":scope > summary").click();
        const functionCard = category.locator("details[data-sdk-function-name]").first();
        await functionCard.locator(":scope > summary").click();
        await functionCard.scrollIntoViewIfNeeded();

        const state = await region.evaluate((element) => {
          const isVisible = (node) => {
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          };
          const directText = (node) => [...node.childNodes].some(
            (child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim(),
          );
          const styleState = (selector) => [...element.querySelectorAll(selector)].map((node) => ({
            text: node.textContent?.replace(/\s+/g, " ").trim().slice(0, 100) ?? "",
            family: getComputedStyle(node).fontFamily,
            weight: getComputedStyle(node).fontWeight,
          }));
          const visibleTextStyles = [...element.querySelectorAll("*")]
            .filter((node) => isVisible(node) && directText(node))
            .map((node) => ({
              tag: node.tagName.toLowerCase(),
              text: node.textContent?.replace(/\s+/g, " ").trim().slice(0, 100) ?? "",
              family: getComputedStyle(node).fontFamily,
              weight: getComputedStyle(node).fontWeight,
            }));
          const documentationClone = element.children[1]?.cloneNode(true);
          documentationClone?.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
          const documentation = documentationClone?.textContent ?? "";
          return {
            documentation,
            interfaceStyles: styleState('[data-sdk-typeface="interface"]'),
            codeStyles: styleState('[data-sdk-typeface="code"]'),
            visibleTextStyles,
            pageOverflow: document.documentElement.scrollWidth - innerWidth,
          };
        });

        const actualHash = hashDocumentation(state.documentation);
        assert.equal(actualHash, expectedDocumentationHashes[robot], `${width}px ${theme} ${robot}: command copy must remain byte-equivalent after whitespace normalization`);
        assert.ok(state.interfaceStyles.length >= 5, `${width}px ${theme} ${robot}: interface samples should be present`);
        assert.ok(state.codeStyles.length >= 2, `${width}px ${theme} ${robot}: code samples should be present`);
        for (const sample of state.interfaceStyles) {
          assert.match(sample.family, /Manrope/i, `${width}px ${theme} ${robot}: interface text ${sample.text} must use Manrope`);
        }
        for (const sample of state.codeStyles) {
          assert.match(sample.family, /IBM Plex Mono/i, `${width}px ${theme} ${robot}: code text ${sample.text} must use IBM Plex Mono`);
        }
        for (const sample of state.visibleTextStyles) {
          assert.match(sample.family, /(?:Manrope|IBM Plex Mono)/i, `${width}px ${theme} ${robot}: ${sample.tag} ${sample.text} uses an unapproved face`);
          assert.ok(["400", "500"].includes(sample.weight), `${width}px ${theme} ${robot}: ${sample.tag} ${sample.text} uses weight ${sample.weight}`);
        }
        assert.ok(state.pageOverflow <= 1, `${width}px ${theme} ${robot}: the page must not overflow horizontally`);

        const shouldCapture = width === 1440 || robot === "Master";
        if (shouldCapture) {
          await functionCard.screenshot({ path: `${artifacts}/${width}-${theme}-${robot.toLowerCase()}-expanded.png` });
        }
        report.push({
          width,
          theme,
          robot,
          documentationHash: actualHash,
          interfaceSamples: state.interfaceStyles.length,
          codeSamples: state.codeStyles.length,
          visibleTextSamples: state.visibleTextStyles.length,
          pageOverflow: state.pageOverflow,
        });
      }

      await page.getByRole("button", { name: "Master", exact: true }).click();
      const marker = page.locator('[data-master-motor-map-theme] button[aria-label="Left Wrist roll, J7"]').first();
      await marker.click();
      const tooltip = page.getByRole("tooltip");
      await tooltip.waitFor({ state: "visible" });
      const tooltipState = await tooltip.evaluate((element) => ({
        text: element.innerText,
        functionText: element.querySelector('[data-master-sdk-function-visible="true"]')?.textContent ?? "",
        exampleText: element.querySelector('[data-master-sdk-example-visible="true"]')?.textContent ?? "",
      }));
      assert.doesNotMatch(tooltipState.text, /\.teach\b/i, `${width}px ${theme}: no visible .teach suffix may remain`);
      assert.equal(tooltipState.functionText, "standing_actions");
      assert.match(tooltipState.exampleText, /^Agentech\.standing_actions\("left"/);
      assert.doesNotMatch(await page.locator("body").innerText(), /\.teach\b/i, `${width}px ${theme}: no visible View SDK text may retain .teach`);
      await tooltip.screenshot({ path: `${artifacts}/${width}-${theme}-master-tooltip.png` });
    }
  }

  assert.deepEqual(errors, [], "the browser run must not produce runtime or console errors");
  assert.deepEqual(writes, [], "visual verification must not call application write APIs");
  console.log(JSON.stringify({ status: "passed", route, expectedDocumentationHashes, report, errors, writes }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
