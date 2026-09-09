import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { after, test } from "node:test";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const sharp = require(process.env.AGENTECH_SHARP_PATH ?? "sharp");
const baseUrl = process.env.ABOUT_JOURNEY_BASE_URL ?? "http://127.0.0.1:3005";
const evidenceDir = process.env.ABOUT_JOURNEY_EVIDENCE_DIR;
const approvedStatement = "At Agentech, we turn curiosity into creation with AI and robotics.";
const approvedExplanation =
  "Through software tools, robot applications, and hands-on learning, we help you explore ideas, build skills, and create projects of your own.";
const browserPath = process.env.AGENTECH_BROWSER_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({ executablePath: browserPath, headless: true });

async function capturePageAtViewportWidth(page, screenshotPath, viewportWidth) {
  const source = await page.screenshot({ fullPage: true });
  const metadata = await sharp(source).metadata();
  assert.ok(metadata.width >= viewportWidth && metadata.height);
  await sharp(source)
    .extract({ left: 0, top: 0, width: viewportWidth, height: metadata.height })
    .png()
    .toFile(screenshotPath);
}

after(async () => {
  await browser.close();
});

test("About journey supports manual, keyboard, mobile, and reduced-motion exploration", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

  const response = await page.goto(`${baseUrl}/about`, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200);
  assert.equal((await page.locator("[data-about-intro-statement]").textContent())?.trim(), approvedStatement);
  assert.equal((await page.locator("[data-about-intro-copy]").textContent())?.trim(), approvedExplanation);

  const idea = page.getByRole("tab", { name: "Idea", exact: true });
  const build = page.getByRole("tab", { name: "Build", exact: true });
  const share = page.getByRole("tab", { name: "Share", exact: true });
  assert.equal(await page.getByRole("tab").count(), 3);
  assert.equal(await idea.getAttribute("aria-selected"), "true");
  assert.equal(await page.locator('[role="tabpanel"]:visible').getAttribute("data-journey-step"), "idea");
  await page.waitForTimeout(320);
  assert.equal(await idea.getAttribute("aria-selected"), "true", "Idea should not auto-rotate");

  await build.click();
  assert.equal(await build.getAttribute("aria-selected"), "true");
  assert.equal(await page.locator('[role="tabpanel"]:visible').getAttribute("data-journey-step"), "build");
  await share.click();
  assert.equal(await share.getAttribute("aria-selected"), "true");
  assert.equal(await page.locator('[role="tabpanel"]:visible').getAttribute("data-journey-step"), "share");

  await idea.focus();
  await idea.press("ArrowRight");
  assert.equal(await build.getAttribute("aria-selected"), "true");
  assert.equal(await build.evaluate((element) => element === document.activeElement), true);
  await build.press("End");
  assert.equal(await share.getAttribute("aria-selected"), "true");
  await share.press("Home");
  assert.equal(await idea.getAttribute("aria-selected"), "true");
  await idea.press("ArrowLeft");
  assert.equal(await share.getAttribute("aria-selected"), "true");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await build.click();
  const reducedAnimation = await page.locator('[role="tabpanel"]:visible [data-journey-panel-inner]').evaluate(
    (element) => getComputedStyle(element).animationName
  );
  assert.equal(reducedAnimation, "none");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const mobileTabs = await page.getByRole("tab").all();
  for (const tab of mobileTabs) {
    const height = await tab.evaluate((element) => element.getBoundingClientRect().height);
    assert.ok(height >= 44, `tab height should be at least 44px, received ${height}`);
  }
  await idea.click();
  assert.equal(await page.locator('[role="tabpanel"]:visible').getAttribute("data-journey-step"), "idea");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.equal(errors.length, 0, errors.join("\n"));
  await context.close();
});

test("About journey visual matrix remains ordered, stable, and unclipped", { skip: !evidenceDir }, async () => {
  await mkdir(evidenceDir, { recursive: true });
  const viewports = [
    { name: "1440", width: 1440, height: 1000 },
    { name: "768", width: 768, height: 1024 },
    { name: "390", width: 390, height: 844 }
  ];
  const themes = ["light", "dark"];
  const report = {
    generatedAt: new Date().toISOString(),
    url: `${baseUrl}/about`,
    functionalCoverage: [
      "default Idea with no auto-rotation",
      "click selection for Idea, Build, and Share",
      "ArrowLeft, ArrowRight, Home, and End roving focus",
      "reduced-motion panels with no animation",
      "mobile touch targets at least 44px"
    ],
    views: []
  };

  for (const theme of themes) {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport });
      await context.addInitScript((selectedTheme) => {
        localStorage.setItem("agentech-theme", selectedTheme);
      }, theme);
      const page = await context.newPage();
      const errors = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
      });
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

      const response = await page.goto(`${baseUrl}/about`, { waitUntil: "networkidle" });
      assert.equal(response?.status(), 200);
      assert.equal(await page.locator("html").getAttribute("data-theme"), theme);

      const approvedCopy = await page.evaluate(() => {
        const statement = document.querySelector("[data-about-intro-statement]");
        const explanation = document.querySelector("[data-about-intro-copy]");
        const statementStyle = getComputedStyle(statement);
        const explanationStyle = getComputedStyle(explanation);
        return {
          statement: statement?.textContent?.trim(),
          explanation: explanation?.textContent?.trim(),
          statementClipped:
            statement.scrollWidth > statement.clientWidth + 1 ||
            (["hidden", "clip"].includes(statementStyle.overflowY) &&
              statement.scrollHeight > statement.clientHeight + 1),
          explanationClipped:
            explanation.scrollWidth > explanation.clientWidth + 1 ||
            (["hidden", "clip"].includes(explanationStyle.overflowY) &&
              explanation.scrollHeight > explanation.clientHeight + 1)
        };
      });
      assert.equal(approvedCopy.statement, approvedStatement);
      assert.equal(approvedCopy.explanation, approvedExplanation);
      assert.equal(approvedCopy.statementClipped, false);
      assert.equal(approvedCopy.explanationClipped, false);

      const heading = page.getByRole("heading", { level: 1 });
      const journey = page.locator("[data-about-intro]");
      const teamGrid = page.locator("[data-team-grid]");
      const order = await Promise.all([heading.boundingBox(), journey.boundingBox(), teamGrid.boundingBox()]);
      assert.ok(order.every(Boolean));
      assert.ok(order[0].y + order[0].height <= order[1].y, "H1 should precede the journey");
      assert.ok(order[1].y + order[1].height <= order[2].y, "journey should precede the team grid");

      const names = await page.locator("[data-team-card] [data-about-heading]").allTextContents();
      assert.deepEqual(names.map((name) => name.trim()), [
        "Bill Wang",
        "Meryl Li",
        "Connie Sun",
        "Xin Gao",
        "Wesley Fan",
        "Victoria Chen",
        "William Wang",
        "George Huang",
        "Shuangyi Lian"
      ]);

      const states = [];
      for (const label of ["Idea", "Build", "Share"]) {
        const tab = page.getByRole("tab", { name: label, exact: true });
        await tab.click();
        const panel = page.locator('[role="tabpanel"]:visible');
        await panel.waitFor();
        states.push({
          label,
          selected: await tab.getAttribute("aria-selected"),
          panel: await panel.getAttribute("data-journey-step"),
          title: (await panel.getByRole("heading", { level: 2 }).textContent())?.trim(),
          description: (await panel.locator("p").last().textContent())?.trim(),
          panelHeight: Math.round((await panel.boundingBox()).height),
          sceneHeight: Math.round((await panel.locator("[data-journey-scene]").boundingBox()).height)
        });

        if (viewport.width === 1440) {
          await page.waitForTimeout(320);
          await capturePageAtViewportWidth(
            page,
            path.join(evidenceDir, `about-journey-${viewport.name}-${theme}-${label.toLowerCase()}.png`),
            viewport.width
          );
        }
      }

      const panelHeights = states.map((state) => state.panelHeight);
      assert.ok(
        Math.max(...panelHeights) - Math.min(...panelHeights) <= 1,
        `${theme} ${viewport.name}px team position should not jump between steps: ${panelHeights.join(", ")}`
      );
      assert.ok(states.every((state) => state.selected === "true"));

      await page.getByRole("tab", { name: "Idea", exact: true }).click();
      if (viewport.width !== 1440) {
        await page.waitForTimeout(320);
        await capturePageAtViewportWidth(
          page,
          path.join(evidenceDir, `about-journey-${viewport.name}-${theme}-idea.png`),
          viewport.width
        );
      }

      const layout = await page.evaluate(() => {
        const cards = [...document.querySelectorAll("[data-team-card]")];
        const cardTextClipped = cards.some((card) => {
          const cardRect = card.getBoundingClientRect();
          return [...card.querySelectorAll("[data-about-heading], [data-team-role]")].some((element) => {
            const rect = element.getBoundingClientRect();
            return rect.left < cardRect.left - 1 || rect.right > cardRect.right + 1 || rect.bottom > cardRect.bottom + 1;
          });
        });

        return {
          viewportWidth: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          cardTextClipped,
          teamCardCount: cards.length,
          computedCanvas: getComputedStyle(document.querySelector(".about-theme-page")).backgroundColor
        };
      });

      assert.equal(layout.horizontalOverflow, false);
      assert.equal(layout.cardTextClipped, false);
      assert.equal(layout.teamCardCount, 9);
      assert.equal(errors.length, 0, errors.join("\n"));
      report.views.push({ theme, viewport, approvedCopy, states, layout, errors });
      await context.close();
    }
  }

  await writeFile(path.join(evidenceDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
});
