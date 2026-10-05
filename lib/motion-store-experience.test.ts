import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspaceRoot = new URL("../", import.meta.url);

async function readWorkspaceFile(path: string) {
  return readFile(new URL(path, workspaceRoot), "utf8").catch(() => "");
}

test("existing skill-market route renders the complete Skills Market composition", async () => {
  const [page, store] = await Promise.all([
    readWorkspaceFile("app/skill-market/page.tsx"),
    readWorkspaceFile("components/motion-store/motion-store.tsx")
  ]);

  assert.match(page, /<MotionStore\s*\/>/);
  assert.doesNotMatch(page, /PlaceholderPage/);
  assert.match(page, /title:\s*"Skills Market"/);
  assert.match(page, /canonical:\s*"\/skill-market"/);
  for (const copy of [
    "SKILLS MARKET",
    "Motion, ready to move.",
    "A library of robot-ready movement.",
    "Browse, preview, and discover motion for your robot.",
    "Featured Motions",
    "Browse Motions",
    "Search motions"
  ]) {
    assert.match(store, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(store, />MOTION STORE(?:\s|<)/);
  assert.match(store, /const filterCategories:[^=]+= \["All", \.\.\.motionCategories\]/);
  assert.match(store, /filterCategories\.map\(\(value\) =>/);
  assert.match(store, /filterMotions\(motionCatalog, query, category\)/);
  assert.match(store, /No motions found/);
  assert.match(store, /Clear filters/);
});

test("motion detail overlay owns dismissal, scroll lock, metadata, and focus return", async () => {
  const [store, modal] = await Promise.all([
    readWorkspaceFile("components/motion-store/motion-store.tsx"),
    readWorkspaceFile("components/motion-store/motion-detail-modal.tsx")
  ]);

  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /aria-labelledby=/);
  assert.match(modal, /Motion Type/);
  assert.match(modal, /Duration/);
  assert.match(modal, /Robot Compatibility/);
  assert.match(modal, /Format/);
  assert.match(modal, /Version/);
  assert.match(modal, /disabled[\s\S]*Coming Soon/);
  assert.match(modal, /aria-label="Close motion details"/);
  assert.match(modal, /event\.key === "Escape"/);
  assert.match(modal, /event\.key === "Tab"/);
  assert.match(modal, /modalRef\.current\?\.querySelectorAll/);
  assert.match(modal, /event\.preventDefault\(\)/);
  assert.match(modal, /event\.target === event\.currentTarget/);
  assert.match(modal, /document\.body\.style\.overflow = "hidden"/);
  assert.match(modal, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(store, /triggerRef\.current = trigger/);
  assert.match(store, /triggerRef\.current\?\.focus\(\)/);
});
