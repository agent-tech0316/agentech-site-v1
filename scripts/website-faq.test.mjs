import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/ai-website/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/ai-website/website-launch.css", import.meta.url), "utf8");

test("FAQ preserves the reference heading and native accordion format", () => {
  assert.match(page, /id="faq"[^>]*aria-labelledby="website-faq-heading"/);
  assert.match(page, /id="website-faq-heading">A few things,<br\s*\/>made clear\.<\/h2>/);
  assert.match(page, /faqs\.map\(\(\[question, answer\]\)/);
  assert.match(page, /<details key=\{question\}>/);
  assert.match(page, /<summary>[\s\S]*aria-hidden="true"/);
  assert.doesNotMatch(page, /faqGroups|wl-faq-group|WebsiteServiceIllustration/);
});

test("FAQ keeps the title beside the accordion on desktop and stacks on mobile", () => {
  assert.match(css, /\.wl-faq\s*\{[^}]*grid-template-columns:\.85fr 1\.3fr/);
  assert.match(css, /@media\s*\(max-width:800px\)[\s\S]*\.wl-faq,\.wl-contact\s*\{[^}]*grid-template-columns:1fr/);
  assert.match(css, /\.wl-faq summary\s*\{[^}]*min-height:64px/);
  assert.match(css, /\.wl-faq summary:focus-visible\s*\{[^}]*outline:/);
  assert.match(css, /\.wl-faq details\[open\] \.wl-faq-icon/);
});

test("the FAQ starts collapsed without adding visual content to its answers", () => {
  assert.doesNotMatch(page, /<details[^>]*\bopen=/, "Answers should not dominate the initial view");
  assert.match(page, /<p>\{answer\}<\/p>/);
});
