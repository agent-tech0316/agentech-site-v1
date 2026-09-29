import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postcss from "postcss";
import * as siteData from "./site-data.ts";

const { navigation } = siteData;

test("AI Development opens AI Services and has only website and app subpages", () => {
  const service = navigation.find((item) => item.label === "Service");
  assert.ok(service);
  assert.deepEqual(service.columns, [
    { label: "ROBOTICS RENT", href: "/coming-soon?feature=robotics-rent" },
    { label: "ROBOTICS SALE", href: "/agentech-robotic" },
    {
      label: "AI-DEVELOPMENT",
      href: "/ai-service",
      children: [
        { label: "AI-WEBSITE", href: "/ai-website" },
        { label: "AI-APP DEV", href: "/ai-app-dev" }
      ]
    },
    { label: "DATA COLLECTION", href: "/coming-soon?feature=data-collection" }
  ]);
  assert.equal(service.menuTriggerHref, "/agentech-robotic");
});

test("AI-Development third-level navigation is a desktop flyout and a mobile inline panel", async () => {
  const source = await readFile(new URL("../components/service-menu.css", import.meta.url), "utf8");
  const rules = postcss.parse(source);

  function value(selector: string, property: string) {
    let result: string | undefined;
    rules.walkRules((rule) => {
      if (!rule.selectors.includes(selector)) return;
      rule.walkDecls(property, (declaration) => { result = declaration.value; });
    });
    return result;
  }

  assert.equal(value("[data-service-menu-branch]", "position"), "relative");
  assert.equal(value("[data-service-submenu-positioner]", "position"), "absolute");
  assert.equal(value("[data-service-submenu-positioner]", "left"), "100%");
  assert.equal(value("[data-service-submenu-panel][hidden]", "display"), "none");
  assert.equal(
    value('[data-service-menu][data-mobile="true"] [data-service-submenu-positioner]', "position"),
    "static"
  );
  assert.equal(
    value('[data-service-menu][data-mobile="true"] [data-service-submenu-positioner]', "width"),
    "auto"
  );
});

test("Platform routes to the current EAIC, EAIS, and NAVI STORE destinations", () => {
  const platform = navigation.find((item) => item.label === "Platform");
  assert.ok(platform);
  assert.deepEqual(platform.columns, [
    { label: "EAIC", href: "/agentech-products/eaic" },
    { label: "EAIS", href: "/agentech-products/eais" },
    { label: "NAVI STORE", href: "/agentech-education/what-can-we-learn-from-navi" }
  ]);
  assert.equal(platform.children, undefined, "Platform categories must not have another menu level");
  assert.equal(platform.menuTriggerHref, "/agentech-products/eaic");
  assert.deepEqual(navigation.filter((item) => item.columns?.length).map((item) => item.label), ["Platform", "Service", "Education", "Talents"]);
});

test("coming-soon feature resolution accepts only the six unfinished navigation leaves", () => {
  const resolveComingSoonFeature = (siteData as typeof siteData & {
    resolveComingSoonFeature?: (feature?: string | string[]) => { title: string };
  }).resolveComingSoonFeature;

  assert.equal(typeof resolveComingSoonFeature, "function");
  for (const [feature, title] of [
    ["eais", "EAIS"],
    ["robotics-rent", "ROBOTICS RENT"],
    ["ai-website", "AI-WEBSITE"],
    ["ai-app-dev", "AI-APP DEV"],
    ["ai-service", "AI-SERVICE"],
    ["data-collection", "DATA COLLECTION"]
  ] as const) {
    assert.equal(resolveComingSoonFeature?.(feature).title, title);
  }
  assert.equal(resolveComingSoonFeature?.("unknown").title, "COMING SOON");
  assert.equal(resolveComingSoonFeature?.(["eais"]).title, "COMING SOON");
});

test("Education exposes the three requested learning stages", () => {
  const education = navigation.find((item) => item.label === "Education");
  assert.ok(education);
  assert.deepEqual(education.columns, [
    { label: "K-8", href: "/agentech-education?pathway=grade-k-8#program-pathways" },
    { label: "9-12 HIGH SCHOOL", href: "/agentech-education?pathway=high-school#program-pathways" },
    { label: "UNIVERSITY / COLLEGE", href: "/agentech-education?pathway=university-college#program-pathways" }
  ]);
  assert.equal(education.menuTriggerHref, "/agentech-education");
});

test("Talents exposes Club, Intern, and Workshop as real pathway links", () => {
  const talents = navigation.find((item) => item.label === "Talents");
  assert.ok(talents);
  assert.deepEqual(talents.columns, [
    { label: "CLUB", href: "/ai-robotics-club" },
    { label: "INTERN", href: "/career-intern" },
    { label: "WORKSHOP", href: "/tech-education" }
  ]);
  assert.equal(talents.menuTriggerHref, "/talents");
});

test("Education keeps both long learning-stage labels on one line", async () => {
  const source = await readFile(new URL("../components/service-menu.css", import.meta.url), "utf8");
  const rules = postcss.parse(source);
  const titleDeclarations: Record<string, string> = {};
  const positionerDeclarations: Record<string, string> = {};
  const mobileTitleDeclarations: Record<string, string> = {};

  rules.walkRules('[data-menu-name="Education"] [data-service-menu-title]', (rule) => {
    rule.walkDecls((declaration) => { titleDeclarations[declaration.prop] = declaration.value; });
  });
  rules.walkRules('[data-service-menu][data-menu-name="Education"]:not([data-mobile="true"]) [data-service-menu-positioner]', (rule) => {
    rule.walkDecls((declaration) => { positionerDeclarations[declaration.prop] = declaration.value; });
  });
  rules.walkRules('[data-service-menu][data-menu-name="Education"][data-mobile="true"] [data-service-menu-title]', (rule) => {
    rule.walkDecls((declaration) => { mobileTitleDeclarations[declaration.prop] = declaration.value; });
  });

  assert.equal(titleDeclarations["white-space"], "nowrap");
  assert.equal(positionerDeclarations.width, "min(292px, calc(100vw - 32px))");
  assert.equal(mobileTitleDeclarations["letter-spacing"], "0.22em");
});

test("Education resolves every menu destination to its matching pathway", async () => {
  const pathwayModule = await import("./education-grade-pages.ts");
  const resolveEducationPathway = (pathwayModule as typeof pathwayModule & {
    resolveEducationPathway?: (value?: string) => string;
  }).resolveEducationPathway;

  assert.equal(typeof resolveEducationPathway, "function");
  assert.equal(resolveEducationPathway?.("grade-k-8"), "grade-k-8");
  assert.equal(resolveEducationPathway?.("high-school"), "high-school");
  assert.equal(resolveEducationPathway?.("university-college"), "university-college");
  assert.equal(resolveEducationPathway?.("not-a-pathway"), "high-school");
});

test("Platform browser check stays aligned with the live category links", async () => {
  const [source, serviceSource] = await Promise.all([
    readFile(new URL("../scripts/platform-menu-browser-check.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/service-menu-browser-check.mjs", import.meta.url), "utf8")
  ]);
  assert.match(
    source,
    /\[data-menu-name=\\?"Platform\\?"\]\[data-mobile=\\?"false\\?"\] \[data-service-menu-trigger\]/,
    "desktop hover must locate the shared trigger instead of assuming it is a button"
  );
  assert.doesNotMatch(source, /\[data-mobile=\\?"false\\?"\] button/);
  assert.match(source, /clicking the desktop Platform trigger must enter EAIC/);
  assert.match(source, /"\/agentech-products\/eaic",\s*"\/agentech-products\/eais",\s*"\/agentech-education\/what-can-we-learn-from-navi"/);
  assert.match(source, /name: "ROBOTICS SALE"/);
  for (const href of [
    "/coming-soon?feature=robotics-rent",
    "/ai-website",
    "/ai-app-dev",
    "/ai-service",
    "/coming-soon?feature=data-collection"
  ]) {
    assert.match(serviceSource, new RegExp(href.replace(/[?]/g, "\\?")));
  }
});

test("Service and Platform use a lightweight floating rail with Interface typography", async () => {
  const source = await readFile(new URL("../components/service-menu.css", import.meta.url), "utf8").catch(() => "");
  const rules = postcss.parse(source);
  function value(selector: string, property: string) {
    let result: string | undefined;
    rules.walkRules((rule) => {
      if (!rule.selectors.includes(selector)) return;
      rule.walkDecls(property, (declaration) => { result = declaration.value; });
    });
    return result;
  }
  assert.equal(value("[data-service-menu]", "position"), "relative");
  assert.equal(value("[data-service-menu-positioner]", "width"), "min(264px, calc(100vw - 32px))");
  assert.equal(value("[data-service-menu-positioner]", "transform"), "translateX(-50%)");
  assert.equal(value("[data-service-menu-panel]", "grid-template-columns"), "minmax(0, 1fr)");
  assert.equal(value("[data-service-menu-panel]", "border-radius"), "12px");
  assert.equal(value("[data-service-menu-panel]", "background"), "#080b0f");
  assert.equal(value("[data-service-menu-panel]", "backdrop-filter"), "none");
  assert.equal(value("[data-service-menu-panel]", "font-family"), "var(--font-sans)");
  assert.equal(value("[data-service-menu-column]", "min-height"), "50px");
  assert.equal(value("[data-service-menu-column]", "padding"), "0 18px");
  assert.equal(value("[data-service-menu-column] + [data-service-menu-column]", "border-top"), undefined);
  assert.equal(value("[data-service-menu-column] + [data-service-menu-column]::before", "left"), "18px");
  assert.equal(value("[data-service-menu-column] + [data-service-menu-column]::before", "right"), "18px");
  assert.equal(value("[data-service-menu-link]:hover", "box-shadow"), "inset 2px 0 #91dfff");
  assert.equal(value("[data-service-menu-title]", "font-weight"), "600");
  assert.equal(value("[data-service-menu-title]", "text-transform"), "uppercase");
  assert.equal(value("[data-service-menu-panel][hidden]", "display"), "none");
  assert.equal(value("[data-service-menu][data-mobile=\"true\"] [data-service-menu-positioner]", "transform"), "none");
  assert.equal(value("[data-service-menu][data-mobile=\"true\"] [data-service-menu-positioner]", "width"), "100%");
  assert.equal(value("[data-service-menu][data-mobile=\"true\"] [data-service-menu-column]", "min-height"), "56px");
});

test("reduced motion disables both the menu link and expand-chevron transitions", async () => {
  const source = await readFile(new URL("../components/service-menu.css", import.meta.url), "utf8");
  const rules = postcss.parse(source);
  const reducedMotionRules = new Map<string, postcss.Rule>();

  rules.walkAtRules("media", (atRule) => {
    if (atRule.params !== "(prefers-reduced-motion: reduce)") return;
    atRule.walkRules((rule) => {
      for (const selector of ["[data-service-menu-chevron]", "[data-service-menu-link]"]) {
        if (rule.selectors.includes(selector)) reducedMotionRules.set(selector, rule);
      }
    });
  });

  for (const selector of ["[data-service-menu-chevron]", "[data-service-menu-link]"]) {
    const rule = reducedMotionRules.get(selector);
    assert.ok(rule, `${selector} must opt out of motion`);
    const transition = rule.nodes.find(
      (node): node is postcss.Declaration => node.type === "decl" && node.prop === "transition"
    );
    assert.equal(transition?.value, "none");
  }
});

test("mobile category panels are fully opaque in both themes", async () => {
  const source = await readFile(new URL("../components/service-menu.css", import.meta.url), "utf8");
  const rules = postcss.parse(source);

  function declarations(selector: string) {
    const values: Record<string, string> = {};
    rules.walkRules((rule) => {
      if (!rule.selectors.includes(selector)) return;
      rule.walkDecls((declaration) => { values[declaration.prop] = declaration.value; });
    });
    return values;
  }

  const darkPanel = declarations('[data-service-menu][data-mobile="true"] [data-service-menu-panel]');
  assert.equal(darkPanel.background, "#080b0f");
  assert.equal(darkPanel["backdrop-filter"], "none");
  assert.equal(darkPanel["-webkit-backdrop-filter"], "none");

  const lightPanel = declarations(':root[data-theme="light"] [data-site-header] [data-service-menu][data-mobile="true"] [data-service-menu-panel]');
  assert.equal(lightPanel.background, "#f5f4f1");
  assert.equal(lightPanel["backdrop-filter"], "none");
  assert.equal(lightPanel["-webkit-backdrop-filter"], "none");
});

test("desktop category panels never let page content show through in either theme", async () => {
  const source = await readFile(new URL("../components/service-menu.css", import.meta.url), "utf8");
  const rules = postcss.parse(source);

  function declarations(selector: string) {
    const values: Record<string, string> = {};
    rules.walkRules((rule) => {
      if (!rule.selectors.includes(selector)) return;
      rule.walkDecls((declaration) => { values[declaration.prop] = declaration.value; });
    });
    return values;
  }

  for (const selector of ["[data-service-menu-panel]", "[data-service-submenu-panel]"]) {
    const panel = declarations(selector);
    assert.equal(panel.background, "#080b0f");
    assert.equal(panel["backdrop-filter"], "none");
    assert.equal(panel["-webkit-backdrop-filter"], "none");
  }

  for (const selector of [
    ':root[data-theme="light"] [data-site-header] [data-service-menu-panel]',
    ':root[data-theme="light"] [data-site-header] [data-service-submenu-panel]'
  ]) {
    const panel = declarations(selector);
    assert.equal(panel.background, "#f5f4f1");
    assert.equal(panel["backdrop-filter"], "none");
    assert.equal(panel["-webkit-backdrop-filter"], "none");
  }
});

test("direct second-level links do not imply a third navigation level on any viewport", async () => {
  const source = await readFile(new URL("../components/service-menu.css", import.meta.url), "utf8");
  const rules = postcss.parse(source);
  let content: string | undefined;

  rules.walkRules("[data-service-menu-link]::after", (rule) => {
    rule.walkDecls("content", (declaration) => { content = declaration.value; });
  });

  assert.equal(content, "none");
});

test("desktop menu category titles match the navigation label typography", async () => {
  const [menuSource, globalSource] = await Promise.all([
    readFile(new URL("../components/service-menu.css", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8")
  ]);
  const menuRules = postcss.parse(menuSource);
  const globalRules = postcss.parse(globalSource);
  const properties = ["font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-transform"];

  function typography(rules: ReturnType<typeof postcss.parse>, selector: string) {
    const values: Record<string, string> = {};
    rules.walkRules((rule) => {
      if (!rule.selectors.includes(selector)) return;
      rule.walkDecls((declaration) => {
        if (properties.includes(declaration.prop)) values[declaration.prop] = declaration.value;
      });
    });
    return values;
  }

  assert.deepEqual(
    typography(menuRules, "[data-service-menu-title]"),
    typography(globalRules, ".agent-nav-wordmark")
  );
});

test("Service and Platform panels use a distinct warm light-theme palette", async () => {
  const source = await readFile(new URL("../components/service-menu.css", import.meta.url), "utf8").catch(() => "");
  const rules = postcss.parse(source);

  function declarations(selector: string) {
    const values: Record<string, string> = {};
    rules.walkRules((rule) => {
      if (!rule.selectors.includes(selector)) return;
      rule.walkDecls((declaration) => { values[declaration.prop] = declaration.value; });
    });
    return values;
  }

  const lightPanel = declarations(':root[data-theme="light"] [data-site-header] [data-service-menu-panel]');
  assert.equal(lightPanel.background, "#f5f4f1");
  assert.equal(lightPanel.color, "#475569");
  assert.equal(lightPanel["border-color"], "#d8d3ca");
  assert.match(lightPanel["box-shadow"] ?? "", /rgba\(15, 23, 42, 0\.14\)/);

  assert.equal(
    declarations(':root[data-theme="light"] [data-site-header] [data-service-menu-link]').color,
    "#111111"
  );
  const lightHover = declarations(':root[data-theme="light"] [data-site-header] [data-service-menu-link]:hover');
  assert.equal(lightHover.background, "rgba(26, 115, 232, 0.06)");
  assert.equal(lightHover["box-shadow"], "inset 2px 0 #1a73e8");
  assert.equal(
    declarations(':root[data-theme="light"] [data-site-header] [data-service-menu-column] + [data-service-menu-column]::before').background,
    "#d8d3ca"
  );
});
