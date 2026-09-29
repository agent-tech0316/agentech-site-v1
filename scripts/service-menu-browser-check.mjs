import assert from "node:assert/strict";

// Run with a Browser skill tab on /about, after the desktop viewport is ready:
// await (await import(absolutePath)).checkServiceMenu(tab)
// Browser setup/selection stays with the caller; this uses the real rendered UI.
export async function checkServiceMenu(tab) {
  await tab.playwright.getByRole("heading", { name: "Leadership and Technical Members", exact: true }).click();
  const trigger = tab.playwright.getByRole("link", { name: "Service", exact: true });
  const roboticsRent = tab.playwright.getByRole("link", { name: "ROBOTICS RENT", exact: true });
  const category = tab.playwright.getByRole("button", { name: "Show AI-DEVELOPMENT services", exact: true });
  const state = () => tab.playwright.evaluate(() => {
    const menu = document.querySelector('[data-menu-name="Service"][data-mobile="false"]');
    const trigger = menu.querySelector("[data-service-menu-trigger]");
    const panel = menu.querySelector("[data-service-menu-panel]");
    const submenu = menu.querySelector("[data-service-submenu-panel]");
    return {
      expanded: trigger.getAttribute("aria-expanded"),
      hidden: panel.hidden,
      focus: document.activeElement?.textContent,
      titles: Array.from(panel.children).map((item) => item.querySelector("[data-service-menu-title]")?.textContent),
      submenuExpanded: menu.querySelector("[data-service-submenu-trigger]")?.getAttribute("aria-expanded"),
      submenuHidden: submenu?.hidden,
      submenuTitles: Array.from(submenu?.querySelectorAll("[data-service-submenu-title]") ?? []).map((heading) => heading.textContent),
      font: getComputedStyle(panel).fontFamily,
      links: Array.from(panel.querySelectorAll("a")).map((link) => link.getAttribute("href"))
    };
  });

  const center = await tab.playwright.evaluate(() => {
    const rect = document.querySelector('[data-menu-name="Service"][data-mobile="false"] [data-service-menu-trigger]').getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await tab.cua.move(center);
  await category.waitFor({ state: "visible" });
  let result = await state();
  assert.equal(result.expanded, "true", "hover must expand Service");
  assert.equal(result.hidden, false);
  assert.deepEqual(Array.from(result.titles), ["ROBOTICS RENT", "ROBOTICS SALE", "AI-DEVELOPMENT", "DATA COLLECTION"]);
  assert.match(result.font, /Manrope/);
  assert.deepEqual(Array.from(result.links), [
    "/coming-soon?feature=robotics-rent",
    "/agentech-robotic",
    "/ai-service",
    "/ai-website",
    "/ai-app-dev",
    "/coming-soon?feature=data-collection"
  ]);

  await category.press("Enter");
  result = await state();
  assert.equal(result.submenuExpanded, "true");
  assert.equal(result.submenuHidden, false);
  assert.deepEqual(Array.from(result.submenuTitles), ["AI-WEBSITE", "AI-APP DEV"]);

  const insidePanel = await tab.playwright.evaluate(() => {
    const rect = document.querySelector('[data-menu-name="Service"][data-mobile="false"] [data-service-menu-panel]').getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + 64 };
  });
  await tab.cua.move(insidePanel);
  assert.equal((await state()).expanded, "true", "moving from trigger into panel must keep it open");

  await tab.cua.keypress({ keys: ["ESC"] });
  assert.equal((await state()).expanded, "false", "Escape must dismiss a hover-open menu even when focus is outside it");
  await trigger.press("ArrowDown");
  await trigger.press("Escape");
  result = await state();
  assert.equal(result.expanded, "false");
  assert.equal(result.hidden, true);
  assert.equal(result.focus, "SERVICE", "Escape must return focus to the trigger");

  await trigger.press("ArrowDown");
  result = await state();
  assert.equal(result.expanded, "true");
  assert.equal(result.focus, "ROBOTICS RENT", "ArrowDown must focus the first available destination");
  await roboticsRent.press("Tab");
  assert.equal((await state()).expanded, "false", "tabbing outside must dismiss the panel");

  await trigger.press("Enter");
  const deadline = Date.now() + 10_000;
  let destination = await tab.playwright.evaluate(() => window.location.pathname);
  while (destination !== "/agentech-robotic" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    destination = await tab.playwright.evaluate(() => window.location.pathname);
  }
  assert.equal(destination, "/agentech-robotic", "clicking the desktop Service trigger must enter Robotics");
  return "Service hover, panel continuity, typography, destinations, Escape, ArrowDown, Tab and direct navigation passed.";
}

// Run with the mobile drawer already open. A sibling control must receive its
// click before collapsing the accordion changes its position in the drawer.
export async function checkMobileServiceMenu(tab) {
  const trigger = tab.playwright.getByRole("button", { name: "Service", exact: true });
  const initial = await tab.playwright.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    expanded: document.querySelector('[data-menu-name="Service"][data-mobile="true"] button').getAttribute("aria-expanded")
  }));
  if (initial.expanded !== "true") await trigger.click();
  const theme = initial.theme === "light" ? "Dark" : "Light";
  await tab.playwright.getByRole("radio", { name: theme, exact: true }).check();
  const result = await tab.playwright.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth
  }));
  assert.equal(result.theme, theme.toLowerCase(), "the first click on a sibling theme control must work");
  assert.ok(result.width <= result.viewport, "mobile navigation must not cause horizontal overflow");
  return "Mobile Service expansion, sibling-control clicks and overflow passed.";
}
