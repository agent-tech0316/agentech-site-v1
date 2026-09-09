import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { after, test } from "node:test";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const sharp = require(process.env.AGENTECH_SHARP_PATH ?? "sharp");
const baseUrl = process.env.ABOUT_TEAM_BASE_URL ?? "http://127.0.0.1:3005";
const evidenceDir = process.env.ABOUT_TEAM_EVIDENCE_DIR;
const browserPath = process.env.AGENTECH_BROWSER_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath: browserPath, headless: true });

const expectedNames = [
  "Bill Wang",
  "Meryl Li",
  "Connie Sun",
  "Xin Gao",
  "Wesley Fan",
  "Victoria Chen",
  "William Wang",
  "George Huang",
  "Shuangyi Lian"
];
const expectedCategories = [
  "leadership",
  "operations",
  "strategy",
  "hardware",
  "software",
  "robotics",
  "software",
  "software",
  "product"
];

after(async () => {
  await browser.close();
});

function channelToLinear(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(color) {
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  assert.equal(channels?.length, 3, `expected an RGB color, received ${color}`);
  const [red, green, blue] = channels.map(channelToLinear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

async function captureFullPageAtViewportWidth(page, screenshotPath, viewportWidth) {
  const source = await page.screenshot({ fullPage: true });
  const metadata = await sharp(source).metadata();
  assert.ok(metadata.width >= viewportWidth && metadata.height);
  await sharp(source)
    .extract({ left: 0, top: 0, width: viewportWidth, height: metadata.height })
    .png()
    .toFile(screenshotPath);
}

test("team categories remain distinct, readable, responsive, and journey-safe", async () => {
  if (evidenceDir) await mkdir(evidenceDir, { recursive: true });
  const viewports = [
    { name: "1440", width: 1440, height: 1000 },
    { name: "768", width: 768, height: 1024 },
    { name: "390", width: 390, height: 844 }
  ];
  const themes = ["light", "dark"];
  const report = { generatedAt: new Date().toISOString(), url: `${baseUrl}/about`, views: [] };

  for (const theme of themes) {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      await context.addInitScript((selectedTheme) => localStorage.setItem("agentech-theme", selectedTheme), theme);
      const page = await context.newPage();
      const errors = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
      });
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

      const response = await page.goto(`${baseUrl}/about`, { waitUntil: "networkidle" });
      assert.equal(response?.status(), 200);
      assert.equal(await page.locator("html").getAttribute("data-theme"), theme);

      const cards = page.locator("[data-team-card]");
      assert.equal(await cards.count(), 9);
      assert.deepEqual((await cards.locator("[data-about-heading]").allTextContents()).map((name) => name.trim()), expectedNames);
      assert.deepEqual(await cards.evaluateAll((elements) => elements.map((card) => card.dataset.teamCategory)), expectedCategories);

      const measurements = await cards.evaluateAll((elements) =>
        elements.map((card) => {
          const group = card.querySelector("[data-team-group]");
          const role = card.querySelector("[data-team-role]");
          const marker = card.querySelector("[data-team-role-marker]");
          const spark = card.querySelector("[data-team-spark]");
          const orbit = card.querySelector("[data-team-orbit]");
          const name = card.querySelector("[data-about-heading]");
          const cardStyle = getComputedStyle(card);
          const cardRect = card.getBoundingClientRect();
          const textClipped = [group, role, name].some((element) => {
            const rect = element.getBoundingClientRect();
            return rect.left < cardRect.left - 1 || rect.right > cardRect.right + 1 || rect.bottom > cardRect.bottom + 1;
          });
          return {
            category: card.dataset.teamCategory,
            backgroundColor: cardStyle.backgroundColor,
            backgroundImage: cardStyle.backgroundImage,
            borderColor: cardStyle.borderColor,
            groupColor: getComputedStyle(group).color,
            roleColor: getComputedStyle(role).color,
            markerColor: getComputedStyle(marker).color,
            sparkColor: getComputedStyle(spark).backgroundColor,
            orbitColor: getComputedStyle(orbit).borderColor,
            nameColor: getComputedStyle(name).color,
            textClipped
          };
        })
      );

      const categoryRepresentatives = new Map();
      for (const measurement of measurements) {
        if (!categoryRepresentatives.has(measurement.category)) {
          categoryRepresentatives.set(measurement.category, measurement);
        }
        assert.equal(measurement.groupColor, measurement.roleColor);
        assert.equal(measurement.markerColor, measurement.roleColor);
        assert.equal(measurement.sparkColor, measurement.roleColor);
        assert.notEqual(measurement.nameColor, measurement.roleColor);
        assert.equal(measurement.textClipped, false);
        const contrast = contrastRatio(measurement.roleColor, measurement.backgroundColor);
        assert.ok(
          contrast >= 4.5,
          `${theme} ${measurement.category} role contrast should be at least 4.5:1; ` +
            `received ${contrast.toFixed(2)} from ${measurement.roleColor} on ${measurement.backgroundColor}`
        );
      }

      assert.equal(categoryRepresentatives.size, 7);
      assert.equal(new Set([...categoryRepresentatives.values()].map((item) => item.roleColor)).size, 7);
      assert.equal(new Set([...categoryRepresentatives.values()].map((item) => item.backgroundImage)).size, 7);
      assert.equal(new Set([...categoryRepresentatives.values()].map((item) => item.orbitColor)).size, 7);
      assert.equal(new Set(measurements.map((item) => item.nameColor)).size, 1, "names should remain neutral");
      assert.equal(new Set(measurements.filter((item) => item.category === "software").map((item) => item.roleColor)).size, 1);

      const hoverColors = {};
      if (viewport.width === 1440) {
        for (const [category, measurement] of categoryRepresentatives) {
          const card = cards.filter({ has: page.locator(`[data-team-group]`, { hasText: new RegExp(`^${category}$`, "i") }) }).first();
          await card.hover();
          await page.waitForTimeout(420);
          const hoverBorder = await card.evaluate((element) => getComputedStyle(element).borderColor);
          assert.equal(hoverBorder, measurement.roleColor, `${theme} ${category} hover border should use its category color`);
          hoverColors[category] = hoverBorder;
        }
        assert.equal(new Set(Object.values(hoverColors)).size, 7);
      }

      const journeyTabs = page.getByRole("tab");
      assert.equal(await journeyTabs.count(), 3);
      assert.equal(await page.getByRole("tab", { name: "Idea", exact: true }).getAttribute("aria-selected"), "true");
      await page.getByRole("tab", { name: "Build", exact: true }).click();
      assert.equal(await page.locator('[role="tabpanel"]:visible').getAttribute("data-journey-step"), "build");
      await page.getByRole("tab", { name: "Share", exact: true }).click();
      assert.equal(await page.locator('[role="tabpanel"]:visible').getAttribute("data-journey-step"), "share");
      await page.getByRole("tab", { name: "Idea", exact: true }).click();

      const layout = await page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        gridColumns: getComputedStyle(document.querySelector("[data-team-grid]")).gridTemplateColumns
      }));
      assert.equal(layout.horizontalOverflow, false);
      assert.equal(layout.gridColumns.trim().split(/\s+/).length, viewport.width >= 1280 ? 3 : viewport.width >= 768 ? 2 : 1);
      assert.equal(errors.length, 0, errors.join("\n"));

      if (evidenceDir) {
        await page.waitForTimeout(320);
        await captureFullPageAtViewportWidth(
          page,
          path.join(evidenceDir, `about-team-colors-${viewport.name}-${theme}.png`),
          viewport.width
        );
      }
      report.views.push({ theme, viewport, measurements, hoverColors, layout, errors });
      await context.close();
    }
  }

  if (evidenceDir) {
    await writeFile(path.join(evidenceDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  }
});
