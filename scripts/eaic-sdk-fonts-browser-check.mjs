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
  Master: "7c299dfd2ffed6504ccf1822cc11bfbcf3dd9813285c2cce0734743a3deb9530",
  Aegis: "6d58664abd51a2aedd905249678f66c351d22cf6ac90d607e148a5f227a5c92a",
  Navi: "8eab7190296d51be6c1972732d228e9556f273237ceb4d1f1e6d3105895c1a5e",
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
    await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded" });
    assert.equal(new URL(page.url()).pathname, route, `${width}px must stay on the exact View SDK route`);
    await page.evaluate(() => document.fonts.ready);

    for (const theme of ["light", "dark"]) {
      await page.evaluate((mode) => localStorage.setItem("agentech-theme", mode), theme);

      for (const robot of ["Master", "Aegis", "Navi"]) {
        await page.goto(`${origin}${route}?robot=${robot.toLowerCase()}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction((expectedTheme) => document.documentElement.dataset.theme === expectedTheme, theme);
        await page.waitForFunction((expected) => [...document.querySelectorAll('button[aria-pressed="true"]')].some((button) => button.textContent?.trim() === expected), robot);

        const isNavi = robot === "Navi";
        const region = isNavi
          ? page.locator('[data-navi-sdk-explorer][data-navi-hydrated="true"]')
          : page.locator("[data-sdk-documentation-region]");
        await region.waitFor();
        let functionCard;
        let naviDocumentation = "";
        if (isNavi) {
          const rows = region.locator("[data-navi-reference-row]");
          assert.equal(await rows.count(), 130, `${width}px ${theme} Navi: Explorer must retain all 130 canonical rows`);
          assert.equal(new Set(await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-navi-reference-name")))).size, 130);
          naviDocumentation = await region.locator("[data-navi-reference-index]").innerText();
          functionCard = region.locator('[data-navi-reference-row][data-navi-reference-name="lateral"]');
          await functionCard.locator("[data-navi-reference-toggle]").click();
          await functionCard.locator('[data-navi-reference-detail][data-navi-reference-name="lateral"]').waitFor();
        } else {
          const categories = region.locator("details[data-sdk-category]");
          await categories.evaluateAll((elements) => elements.forEach((element) => { element.open = false; }));
          const category = categories.first();
          await category.locator(":scope > summary").click();
          functionCard = category.locator("details[data-sdk-function-name]").first();
          await functionCard.locator(":scope > summary").click();
        }
        await functionCard.scrollIntoViewIfNeeded();

        const state = await region.evaluate((element, explorerDocumentation) => {
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
          const documentationClone = explorerDocumentation ? null : element.children[1]?.cloneNode(true);
          documentationClone?.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
          const documentation = explorerDocumentation || documentationClone?.textContent || "";
          return {
            documentation,
            interfaceStyles: styleState('[data-sdk-typeface="interface"]'),
            codeStyles: styleState('[data-sdk-typeface="code"]'),
            visibleTextStyles,
            pageOverflow: document.documentElement.scrollWidth - innerWidth,
          };
        }, naviDocumentation);

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
          const approvedWeights = ["400", "500", "600"];
          assert.ok(approvedWeights.includes(sample.weight), `${width}px ${theme} ${robot}: ${sample.tag} ${sample.text} uses weight ${sample.weight}`);
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

      await page.goto(`${origin}${route}?robot=master`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction((expectedTheme) => document.documentElement.dataset.theme === expectedTheme, theme);
      const marker = page.locator('[data-master-motor-map-theme] button[aria-label="Left Wrist roll, J7"]').first();
      await marker.click();
      const tooltip = page.getByRole("tooltip");
      await tooltip.waitFor({ state: "visible" });
      const tooltipState = await tooltip.evaluate((element) => ({
        text: element.innerText,
        functionText: element.querySelector('[data-master-sdk-function-visible="true"]')?.textContent ?? "",
        exampleText: element.querySelector('[data-master-sdk-example-visible="true"]')?.textContent ?? "",
      }));
      assert.doesNotMatch(tooltipState.text, /\.tech\b/i, `${width}px ${theme}: no visible .tech suffix may remain`);
      assert.doesNotMatch(tooltipState.text, /\.teach\b/i, `${width}px ${theme}: no visible .teach suffix may remain`);
      assert.equal(tooltipState.functionText, "standing_actions");
      assert.match(tooltipState.exampleText, /^Agentech\.standing_actions\("left"/);
      const visibleBodyText = await page.locator("body").innerText();
      assert.doesNotMatch(visibleBodyText, /\.tech\b/i, `${width}px ${theme}: no visible View SDK text may retain .tech`);
      assert.doesNotMatch(visibleBodyText, /\.teach\b/i, `${width}px ${theme}: no visible View SDK text may retain .teach`);
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
