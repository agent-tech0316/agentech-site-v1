import assert from "node:assert/strict";

// Use a Browser skill tab on /about at the requested desktop/mobile viewport.
export async function checkPlatformMenu(tab, mobile = false) {
  const platform = tab.playwright.getByRole(mobile ? "button" : "link", { name: "Platform", exact: true });
  const eaic = tab.playwright.getByRole("link", { name: "EAIC", exact: true });
  await platform.waitFor({ state: "visible" });
  const initialPath = await tab.playwright.evaluate(() => window.location.pathname);

  if (mobile) {
    await platform.click();
    assert.equal(
      await tab.playwright.evaluate(() => window.location.pathname),
      initialPath,
      "clicking the mobile Platform trigger must expand without navigating"
    );
  } else {
    const center = await tab.playwright.evaluate(() => {
      const rect = document.querySelector('[data-menu-name="Platform"][data-mobile="false"] [data-service-menu-trigger]').getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await tab.cua.move(center);
  }
  await eaic.waitFor({ state: "visible" });
  const readPanel = () => tab.playwright.evaluate(() => {
    const panel = document.querySelector('[aria-label="Platform categories"]:not([hidden])');
    return {
      titles: Array.from(panel.querySelectorAll("h2")).map((heading) => heading.textContent),
      links: Array.from(panel.querySelectorAll("a")).map((link) => link.getAttribute("href")),
      nestedMenus: panel.querySelectorAll("button, [aria-haspopup]").length,
      openPanels: document.querySelectorAll('[data-service-menu-panel]:not([hidden])').length,
      overflow: document.documentElement.scrollWidth > window.innerWidth
    };
  });
  let panel = await readPanel();
  assert.deepEqual(Array.from(panel.titles), ["EAIC", "EAIS", "MOTION STORE", "NAVI STORE"]);
  assert.deepEqual(Array.from(panel.links), [
    "/agentech-products/eaic",
    "/agentech-products/eais",
    "/skill-market",
    "/agentech-education/what-can-we-learn-from-navi"
  ]);
  assert.equal(panel.nestedMenus, 0, "categories must not have submenu triggers");
  assert.equal(panel.openPanels, 1);
  assert.equal(panel.overflow, false);

  if (!mobile) {
    const inside = await tab.playwright.evaluate(() => {
      const rect = document.querySelector('[aria-label="Platform categories"]:not([hidden]) a').getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await tab.cua.move(inside);
    await eaic.waitFor({ state: "visible" });
    await platform.press("ArrowDown");
    assert.equal(await tab.playwright.evaluate(() => document.activeElement?.textContent), "EAIC");
    await eaic.press("Escape");
    await eaic.waitFor({ state: "hidden" });
    await platform.press("ArrowDown");
    await eaic.waitFor({ state: "visible" });
  }

  const service = tab.playwright.getByRole(mobile ? "button" : "link", { name: "Service", exact: true });
  if (mobile) await service.press("Enter");
  else await service.press("ArrowDown");
  await tab.playwright.getByRole("link", { name: "AIGC", exact: true }).waitFor({ state: "visible" });
  await eaic.waitFor({ state: "hidden" });
  if (mobile) await platform.press("Enter");
  else await platform.press("ArrowDown");
  await eaic.waitFor({ state: "visible" });
  panel = await readPanel();
  assert.equal(panel.openPanels, 1, "switching menus must leave only the current panel expanded");
  if (mobile) await eaic.click();
  else await platform.click();
  await eaic.waitFor({ state: "hidden" });
  const deadline = Date.now() + 10_000;
  let destination = await tab.playwright.evaluate(() => window.location.pathname);
  while (destination !== "/agentech-products/eaic" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    destination = await tab.playwright.evaluate(() => window.location.pathname);
  }
  assert.equal(
    destination,
    "/agentech-products/eaic",
    mobile ? "EAIC must navigate to the existing Hub" : "clicking the desktop Platform trigger must enter EAIC"
  );
  if (mobile) {
    await tab.playwright.getByRole("button", { name: "Open navigation", exact: true }).waitFor({ state: "visible" });
  }
  return `Platform ${mobile ? "mobile" : "desktop"}: categories, single level, exclusive panels, EAIC navigation and dismissal passed.`;
}
