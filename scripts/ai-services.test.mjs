import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { navigation } from "../lib/site-data.ts";

const require = createRequire(import.meta.url);
function loadComponent(relativePath) {
  const filename = fileURLToPath(new URL(relativePath, import.meta.url));
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename
  });
  const module = { exports: {} };
  const resolve = id => id === "@/lib/service-profiles-server"
    ? { serviceProfilesEnabled: () => process.env.NODE_ENV === "development" || process.env.AGENTECH_SERVICE_PROFILES_ENABLED === "1" }
    : id.endsWith(".module.css")
    ? { default: new Proxy({}, { get: (_target, key) => String(key) }) }
    : id.endsWith(".css") ? {} : id.startsWith("@/")
    ? loadComponent(`../${id.slice(2)}.tsx`) : require(id);
  new Function("require", "module", "exports", outputText)(resolve, module, module.exports);
  return module.exports;
}

for (const mobile of [false, true]) {
  test(`AI Development has a direct overview link and separate submenu control (${mobile ? "mobile" : "desktop"})`, () => {
    const { ServiceMenu } = loadComponent("../components/service-menu.tsx");
    const service = navigation.find(item => item.label === "Service");
    const html = renderToStaticMarkup(createElement(ServiceMenu, {
      columns: service.columns, name: "Service", children: "Service", open: true,
      active: false, mobile, onOpenChange: () => {}
    }));
    const anchors = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    const overview = anchors.find(([, , body]) => body.includes(">AI-DEVELOPMENT<"));
    assert.equal(overview?.[1], "/ai-service");
    assert.doesNotMatch(overview[2], /<button/);
    assert.match(html, /<button\b[^>]*aria-label="Show AI-DEVELOPMENT services"[^>]*aria-expanded="false"/);
    assert.deepEqual(anchors.filter(([, , body]) => /data-service-submenu-title/.test(body)).map(([, href]) => href), [
      "/ai-website", "/ai-app-dev"
    ]);
  });
}

test("AI Services introduces both subpages in the requested order", () => {
  const { default: Page } = loadComponent("../app/ai-service/page.tsx");
  const html = renderToStaticMarkup(createElement(Page));
  assert.match(html, /<h1[^>]*>AI Services/);
  const cards = [...html.matchAll(/<article\b[^>]*data-ai-offering="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)];
  assert.deepEqual(cards.map(([, name]) => name), ["website", "app"]);
  assert.match(cards[0][2], /href="\/ai-website"/);
  assert.match(cards[1][2], /href="\/ai-app-dev"/);
  assert.match(cards[1][2], /Coming soon/);
});

test("AI Services keeps its public conversion path usable when client profiles are unavailable", () => {
  const previousFlag = process.env.AGENTECH_SERVICE_PROFILES_ENABLED;
  delete process.env.AGENTECH_SERVICE_PROFILES_ENABLED;
  try {
    const { default: Page } = loadComponent("../app/ai-service/page.tsx");
    const html = renderToStaticMarkup(createElement(Page));
    assert.match(html, /href="\/ai-website#inquiry"[^>]*>Start a website inquiry/);
    assert.match(html, /href="\/ai-website#inquiry"[^>]*>Website inquiry/);
    assert.doesNotMatch(html, /href="\/account\/service-profiles\?type=development-client"/);
  } finally {
    if (previousFlag === undefined) delete process.env.AGENTECH_SERVICE_PROFILES_ENABLED;
    else process.env.AGENTECH_SERVICE_PROFILES_ENABLED = previousFlag;
  }
});

test("AI Services preserves the client profile journey when the feature is enabled", () => {
  const previousFlag = process.env.AGENTECH_SERVICE_PROFILES_ENABLED;
  process.env.AGENTECH_SERVICE_PROFILES_ENABLED = "1";
  try {
    const { default: Page } = loadComponent("../app/ai-service/page.tsx");
    const html = renderToStaticMarkup(createElement(Page));
    assert.match(html, /href="\/account\/service-profiles\?type=development-client"[^>]*>Your app \/ website client profile/);
    assert.match(html, /href="\/account\/service-profiles\?type=development-client"[^>]*>Client profile/);
  } finally {
    if (previousFlag === undefined) delete process.env.AGENTECH_SERVICE_PROFILES_ENABLED;
    else process.env.AGENTECH_SERVICE_PROFILES_ENABLED = previousFlag;
  }
});

test("AI Services relies on the root layout main landmark and self-identifies in social metadata", () => {
  const { default: Page, metadata } = loadComponent("../app/ai-service/page.tsx");
  const html = renderToStaticMarkup(createElement(Page));
  assert.doesNotMatch(html, /<main\b/);
  assert.equal(metadata.alternates.canonical, "/ai-service");
  assert.equal(metadata.openGraph.url, "/ai-service");
  assert.equal(metadata.openGraph.title, metadata.title);
  assert.equal(metadata.twitter.title, metadata.title);
});

test("AI Services reuses the EAIS product-system primitives", () => {
  const page = readFileSync(fileURLToPath(new URL("../app/ai-service/page.tsx", import.meta.url)), "utf8");
  const styles = readFileSync(fileURLToPath(new URL("../app/ai-service/ai-services.css", import.meta.url)), "utf8");

  assert.match(page, /import referenceStyles from "\.\.\/agentech-products\/eais\/eais-showcase\.module\.css"/);
  for (const primitive of ["page", "sidebar", "content", "topBar", "eyebrow", "sectionHeader", "featureCard", "featureImage", "featureCardCopy", "processGrid"]) {
    assert.match(page, new RegExp(`referenceStyles\\.${primitive}`), `missing EAIS ${primitive} primitive`);
  }
  assert.match(styles, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /height:\s*224px/);
  assert.match(styles, /@media\s*\(max-width:\s*767px\)[\s\S]*grid-template-columns:\s*1fr/);
});

test("the app subpage states its availability and returns to AI Services", () => {
  const { default: Page, metadata } = loadComponent("../app/ai-app-dev/page.tsx");
  const html = renderToStaticMarkup(createElement(Page));
  assert.equal(metadata.alternates.canonical, "/ai-app-dev");
  assert.match(html, /Coming soon/);
  assert.match(html, /href="\/ai-service"/);
  assert.match(html, /href="\/ai-website"/);
  assert.doesNotMatch(html, /\$2,000|5–7|Book now|Start your app/);
});
