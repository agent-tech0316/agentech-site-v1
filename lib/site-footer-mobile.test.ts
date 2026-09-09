import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postcss, { type AtRule, type Rule } from "postcss";

const workspaceRoot = new URL("../", import.meta.url);

async function readWorkspaceFile(path: string) {
  return readFile(new URL(path, workspaceRoot), "utf8");
}

async function readOptionalWorkspaceFile(path: string) {
  try {
    return await readWorkspaceFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function declarationMap(css: string, selector: string, media?: string) {
  const values: Record<string, string> = {};
  const sheet = postcss.parse(css);

  sheet.walkRules((rule: Rule) => {
    const parentMedia = rule.parent?.type === "atrule" && (rule.parent as AtRule).name === "media"
      ? (rule.parent as AtRule).params
      : undefined;

    if (rule.selectors.includes(selector) && parentMedia === media) {
      rule.walkDecls((declaration) => {
        values[declaration.prop] = declaration.value;
      });
    }
  });

  return values;
}

test("site footer keeps its company links in the phone right-bottom safe area", async () => {
  const [footer, css] = await Promise.all([
    readWorkspaceFile("components/site-footer.tsx"),
    readOptionalWorkspaceFile("components/site-footer.css"),
  ]);

  assert.match(footer, /import "\.\/site-footer\.css";/);
  assert.match(footer, /data-site-footer-inner/);
  assert.match(footer, /data-site-footer-links/);
  assert.equal((footer.match(/data-site-footer-link\b/g) ?? []).length, 2);

  const phoneMedia = "(max-width: 639px)";
  const inner = declarationMap(css, "[data-site-footer-inner]", phoneMedia);
  const links = declarationMap(css, "[data-site-footer-links]", phoneMedia);
  const link = declarationMap(css, "[data-site-footer-link]", phoneMedia);
  const focus = declarationMap(css, "[data-site-footer-link]:focus-visible", phoneMedia);

  assert.equal(inner["align-items"], "flex-end");
  assert.equal(inner["text-align"], "right");
  assert.equal(inner["padding-bottom"], "calc(1.25rem + env(safe-area-inset-bottom))");
  assert.equal(links["flex-direction"], "row");
  assert.equal(links["justify-content"], "flex-end");
  assert.equal(link.display, "inline-flex");
  assert.equal(link["align-items"], "center");
  assert.equal(link["min-height"], "44px");
  assert.equal(focus.outline, "2px solid currentColor");
  assert.equal(focus["outline-offset"], "4px");

  assert.deepEqual(declarationMap(css, "[data-site-footer-inner]"), {});
  assert.deepEqual(declarationMap(css, "[data-site-footer-links]"), {});
  const baseLink = declarationMap(css, "[data-site-footer-link]");
  assert.equal(baseLink.display, undefined);
  assert.equal(baseLink["min-height"], undefined);
});

test("site footer company links match the complete static primary-navigation type state without button chrome", async () => {
  const css = await readOptionalWorkspaceFile("components/site-footer.css");
  const link = declarationMap(css, "[data-site-footer-link]");

  assert.equal(link.color, "#fff");
  assert.equal(link["font-family"], "var(--font-sans)");
  assert.equal(link["font-size"], "0.75rem");
  assert.equal(link["font-weight"], "600");
  assert.equal(link["line-height"], "1");
  assert.equal(link["letter-spacing"], "0.34em");
  assert.equal(link.border, undefined);
  assert.equal(link["border-radius"], undefined);
  assert.equal(link.background, undefined);
});
