import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadComponent(relativePath) {
  const filename = fileURLToPath(new URL(relativePath, import.meta.url));
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename
  });
  const module = { exports: {} };
  const resolve = id => id.startsWith("@/")
    ? require(fileURLToPath(new URL(`../${id.slice(2)}.ts`, import.meta.url)))
    : require(id);
  new Function("require", "module", "exports", outputText)(resolve, module, module.exports);
  return module.exports;
}

const { WebsiteInquiryForm } = loadComponent("../components/website-inquiry-form.tsx");
const { ConceptInquiry } = loadComponent("../components/website-concept-interactions.tsx");

for (const [name, component] of [["website inquiry", WebsiteInquiryForm], ["concept inquiry", ConceptInquiry]]) {
  test(`${name} cannot submit browser-native data before JavaScript is ready`, () => {
    const html = renderToStaticMarkup(createElement(component));
    const submitButtons = html.match(/<button\b[^>]*type="submit"[^>]*>/g) || [];
    assert.ok(submitButtons.length > 0);
    for (const button of submitButtons) assert.match(button, /\bdisabled=""/);
    assert.match(html, /<noscript>[\s\S]*JavaScript[\s\S]*<\/noscript>/);
  });
}
