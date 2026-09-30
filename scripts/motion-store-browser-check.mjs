import assert from "node:assert/strict";

export async function checkMotionStore(tab, viewport) {
  const pageErrors = [];
  const consoleErrors = [];
  tab.playwright.on?.("pageerror", (error) => pageErrors.push(String(error)));
  tab.playwright.on?.("console", (message) => {
    if (message.type?.() === "error") consoleErrors.push(message.text?.() ?? String(message));
  });

  await tab.playwright.setViewportSize(viewport);
  await tab.playwright.goto("/skill-market");
  await tab.playwright.getByRole("heading", { name: "Motion, ready to move." }).waitFor({ state: "visible" });

  assert.equal(await tab.playwright.getByText("MOTION STORE", { exact: true }).count() > 0, true);
  assert.equal(await tab.playwright.locator("[data-motion-card-variant=catalog]").count(), 9);

  const search = tab.playwright.getByRole("searchbox", { name: "Search motions" });
  await search.fill("  GOLF  ");
  assert.equal(await tab.playwright.locator("[data-motion-card-variant=catalog]").count(), 1);
  await search.fill("");
  await tab.playwright.getByRole("button", { name: "Utility", exact: true }).click();
  assert.equal(await tab.playwright.locator("[data-motion-card-variant=catalog]").count(), 3);
  await search.fill("golf");
  await tab.playwright.getByText("No motions found", { exact: true }).waitFor({ state: "visible" });
  await tab.playwright.getByRole("button", { name: "Clear filters" }).click();
  assert.equal(await tab.playwright.locator("[data-motion-card-variant=catalog]").count(), 9);

  const trigger = tab.playwright.getByRole("button", { name: "View Golf Swing" }).last();
  await trigger.click();
  const dialog = tab.playwright.getByRole("dialog", { name: "Golf Swing" });
  await dialog.waitFor({ state: "visible" });
  assert.equal(await dialog.getByRole("button", { name: "Coming Soon" }).isDisabled(), true);
  await tab.playwright.getByRole("button", { name: "Close motion details" }).click();
  assert.equal(await trigger.evaluate((node) => node === document.activeElement), true);

  await trigger.click();
  await dialog.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await tab.playwright.evaluate(() => document.body.style.overflow), "");

  await trigger.click();
  await tab.playwright.locator("[data-motion-modal-backdrop]").click({ position: { x: 2, y: 2 } });
  await dialog.waitFor({ state: "hidden" });

  const layout = await tab.playwright.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    featuredScrollable: document.querySelector("[data-motion-featured-rail]").scrollWidth > document.querySelector("[data-motion-featured-rail]").clientWidth,
    categoriesScrollable: document.querySelector("[data-motion-category-rail]").scrollWidth > document.querySelector("[data-motion-category-rail]").clientWidth
  }));
  assert.equal(layout.overflow, false);
  assert.equal(layout.featuredScrollable, true);
  if (viewport.width <= 639) assert.equal(layout.categoriesScrollable, true);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);

  return `Motion Store ${viewport.width}x${viewport.height}: browsing, filtering, modal, focus, scroll, overflow, and console checks passed.`;
}
