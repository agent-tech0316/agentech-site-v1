import assert from "node:assert/strict";
import test from "node:test";
import { validateWorkCover, validateWorkDetails } from "./my-works.ts";

test("a supported, nonempty cover within the size limit can be previewed", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
    assert.equal(validateWorkCover({ type, size: 10 * 1024 * 1024 }), null);
  }
});
test("executable, SVG, and unrecognized files cannot become cover previews", () => {
  for (const type of ["image/svg+xml", "text/html", "application/javascript", "", "image/heic"]) {
    assert.match(validateWorkCover({ type, size: 100 }) ?? "", /JPG, PNG, WebP, or GIF/);
  }
});

test("empty, invalid, and oversized files are rejected before allocating a preview", () => {
  for (const size of [0, -1, NaN, Infinity, 10 * 1024 * 1024 + 1]) {
    assert.ok(validateWorkCover({ type: "image/png", size }));
  }
});

test("project details are trimmed before appearing on a local card", () => {
  assert.deepEqual(validateWorkDetails({ title: "  A robot that waves  ", category: "Humanoid", description: "  A finished motion study.  " }), {
    ok: true,
    details: { title: "A robot that waves", category: "Humanoid", description: "A finished motion study." }
  });
});

test("blank titles cannot create an unnamed project", () => {
  assert.equal(validateWorkDetails({ title: "  ", category: "Navi", description: "" }).ok, false);
});

test("unsupported categories cannot create a project", () => {
  assert.equal(validateWorkDetails({ title: "My robot", category: "Published", description: "" }).ok, false);
});

test("project text lengths are bounded while a description is optional", () => {
  assert.equal(validateWorkDetails({ title: "a".repeat(80), category: "Robot dog", description: "b".repeat(600) }).ok, true);
  assert.equal(validateWorkDetails({ title: "a".repeat(81), category: "Robot dog", description: "" }).ok, false);
  assert.equal(validateWorkDetails({ title: "My robot", category: "Robot dog", description: "b".repeat(601) }).ok, false);
  assert.equal(validateWorkDetails({ title: "My robot", category: "Other", description: "" }).ok, true);
});
