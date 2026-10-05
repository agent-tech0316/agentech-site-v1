import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const styleProperties = [
  "fontFamily", "fontSize", "fontWeight", "letterSpacing", "lineHeight",
  "backgroundColor", "color", "borderTopColor", "borderTopWidth", "borderRadius"
];

async function measure(tab, reference) {
  return tab.playwright.evaluate(({ reference, properties }) => {
    const style = (selector) => {
      const node = document.querySelector(selector);
      if (!node) throw new Error("Missing comparison element: " + selector);
      const computed = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        ...Object.fromEntries(properties.map(key => [key, computed[key]])),
        x: rect.x, width: rect.width, height: rect.height
      };
    };
    const card = reference ? "[data-eais-work-card]" : "[data-motion-card-variant=featured]";
    return {
      canvas: style(reference ? "[data-eais-public-page]" : "[data-motion-store]"),
      content: style(reference ? "#eais-home" : "[data-motion-content]"),
      heading: style(reference ? "[data-eais-featured-work] h2" : "#featured-motions-title"),
      introHeading: reference ? null : style("#motion-store-title"),
      search: style(reference ? "[data-eais-search] label" : "[data-motion-search] label"),
      searchInput: style(reference ? "[data-eais-search] input" : "[data-motion-search] input"),
      card: style(card),
      preview: style(card + " > :first-child"),
      title: style(card + (reference ? " strong" : " h3")),
      description: style(card + (reference ? " em" : " p")),
      action: style(card + (reference ? " b" : " button"))
    };
  }, { reference, properties: styleProperties });
}

export async function checkMotionStoreAlignment(tab, referenceTab, viewport, artifactDirectory) {
  await mkdir(artifactDirectory, { recursive: true });
  await viewport.set({ width: 1440, height: 1000 });
  const reference = await measure(referenceTab, true);
  const motion = await measure(tab, false);
  for (const key of ["backgroundColor", "color"]) assert.equal(motion.canvas[key], reference.canvas[key], "Canvas " + key);
  for (const key of ["fontFamily", "fontSize", "fontWeight", "letterSpacing", "lineHeight"]) {
    assert.equal(motion.heading[key], reference.heading[key], "Heading " + key);
    assert.equal(motion.introHeading[key], reference.heading[key], "Intro heading " + key);
  }
  for (const region of ["search", "searchInput", "card", "title", "description", "action"]) {
    for (const key of styleProperties) assert.equal(motion[region][key], reference[region][key], region + " " + key);
  }
  assert.ok(motion.content.x < 100, "Skills Market content starts at the desktop page gutter");
  assert.ok(motion.content.width > 1240, "Skills Market content uses the full desktop page width");
  assert.equal(motion.search.height, reference.search.height, "Search height matches EAIS");
  await writeFile(artifactDirectory + "/reference-desktop.jpg", await referenceTab.screenshot({ fullPage: false }));
  await writeFile(artifactDirectory + "/motion-desktop.jpg", await tab.screenshot({ fullPage: false }));

  const responsive = [];
  for (const width of [1440, 834, 390]) {
    await viewport.set({ width, height: width === 390 ? 844 : 1000 });
    const layout = await tab.playwright.evaluate(() => {
      const grid = document.querySelector("[data-motion-catalog-grid]");
      const rail = document.querySelector("[data-motion-featured-rail]");
      const categories = document.querySelector("[data-motion-category-rail]");
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        marketIndex: document.querySelectorAll("[data-motion-market-index]").length,
        legacyCopy: [...document.querySelectorAll("[data-motion-store] *")]
          .filter(node => node.children.length === 0)
          .some(node => ["MARKET INDEX", "SEARCH THE LIBRARY"].includes(node.textContent?.trim())),
        storeDisplay: getComputedStyle(document.querySelector("[data-motion-store]")).display,
        storeColumns: getComputedStyle(document.querySelector("[data-motion-store]")).gridTemplateColumns,
        content: (() => {
          const rect = document.querySelector("[data-motion-content]").getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width };
        })(),
        columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
        featuredScrollable: rail.scrollWidth > rail.clientWidth,
        categoriesScrollable: categories.scrollWidth > categories.clientWidth,
        targets: [...document.querySelectorAll("[data-motion-store] button")]
          .filter(node => node.getClientRects().length > 0)
          .map(node => node.getBoundingClientRect().height)
      };
    });
    assert.equal(layout.overflow, false, width + " page overflow");
    assert.equal(layout.marketIndex, 0, width + " has no market index");
    assert.equal(layout.legacyCopy, false, width + " has no retired sidebar copy");
    assert.equal(layout.storeDisplay, "block", width + " store is no longer a sidebar grid");
    assert.equal(layout.storeColumns, "none", width + " has no reserved sidebar column");
    const maximumPageInset = width >= 1024 ? 100 : width >= 768 ? 60 : 20;
    assert.ok(layout.content.left < maximumPageInset, width + " content starts at the page gutter");
    assert.ok(layout.content.right > width - maximumPageInset, width + " content reaches the right gutter");
    assert.ok(layout.content.width > width - maximumPageInset * 2, width + " content uses the available width");
    assert.equal(layout.columns, width >= 1024 ? 3 : width >= 768 ? 2 : 1);
    assert.equal(layout.featuredScrollable, true);
    if (width === 390) {
      assert.equal(layout.categoriesScrollable, true);
      assert.ok(layout.targets.every(height => height >= 44), "Phone targets are at least 44px");
      await writeFile(artifactDirectory + "/motion-mobile.jpg", await tab.screenshot({ fullPage: false }));
    }

    const catalog = tab.playwright.locator("[data-motion-card-variant=catalog]");
    const search = tab.playwright.getByRole("searchbox", { name: "Search motions" });
    await search.fill("  GOLF  ");
    assert.equal(await catalog.count(), 1);
    await search.fill("");
    await tab.playwright.getByRole("button", { name: "Utility", exact: true }).click();
    assert.equal(await catalog.count(), 3);
    await search.fill("golf");
    assert.equal(await tab.playwright.getByRole("heading", { name: "No motions found" }).count(), 1);
    await tab.playwright.getByRole("button", { name: "Clear filters" }).click();
    assert.equal(await catalog.count(), 9);

    const trigger = tab.playwright.getByRole("button", { name: "View Golf Swing" }).last();
    await trigger.click();
    const dialog = tab.playwright.getByRole("dialog", { name: "Golf Swing" });
    await dialog.waitFor({ state: "visible" });
    assert.equal(await dialog.getByRole("button", { name: "Coming Soon" }).isEnabled(), false);
    const modalLayout = await dialog.evaluate(node => ({
      width: node.getBoundingClientRect().width,
      height: node.getBoundingClientRect().height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      background: getComputedStyle(node).backgroundColor
    }));
    assert.ok(modalLayout.width <= modalLayout.viewportWidth);
    assert.ok(modalLayout.height <= modalLayout.viewportHeight);
    assert.equal(modalLayout.background, reference.canvas.backgroundColor);
    const close = tab.playwright.getByRole("button", { name: "Close motion details" });
    await close.press("Tab");
    assert.equal(await close.evaluate(node => node === document.activeElement), true, "Focus stays inside the dialog");
    await close.press("Shift+Tab");
    assert.equal(await close.evaluate(node => node === document.activeElement), true);
    await writeFile(artifactDirectory + "/motion-modal-" + width + ".jpg", await tab.screenshot({ fullPage: false }));
    await close.click();
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true, "Focus returns to its trigger");
    await trigger.click();
    await close.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await tab.playwright.evaluate(() => document.body.style.overflow), "");
    responsive.push({ width, ...layout, modalLayout });
  }

  await viewport.set({ width: 1440, height: 1000 });
  await tab.reload();
  await tab.playwright.getByRole("radio", { name: "Light", exact: true }).click();
  assert.equal(await tab.playwright.locator("[data-motion-store]").evaluate(node => getComputedStyle(node).backgroundColor), "rgb(245, 244, 241)", "Skills Market uses the warm Light canvas");
  await tab.playwright.getByRole("radio", { name: "Dark", exact: true }).click();
  assert.equal(await tab.playwright.locator("[data-motion-store]").evaluate(node => getComputedStyle(node).backgroundColor), reference.canvas.backgroundColor, "Skills Market preserves the approved Dark canvas");
  const consoleErrors = await tab.dev.logs({ levels: ["error"], limit: 50 });
  assert.deepEqual(consoleErrors, []);
  const report = { status: "passed", desktop: { reference, motion }, responsive, consoleErrors };
  await writeFile(artifactDirectory + "/report.json", JSON.stringify(report, null, 2));
  return report;
}
