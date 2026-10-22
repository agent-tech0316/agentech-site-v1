import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const explorerSource = fs.readFileSync(
  path.join(repoRoot, "features/eaic/01-clients/eaic-hub/components/navi-sdk-explorer.tsx"),
  "utf8",
);
const detailSource = fs.readFileSync(
  path.join(repoRoot, "features/eaic/01-clients/eaic-hub/components/navi-reference-detail.tsx"),
  "utf8",
);

function sourceIndex(source, token, message) {
  const index = source.indexOf(token);
  assert.notEqual(index, -1, message);
  return index;
}

test("renders search before filters and a dynamic result count", () => {
  const title = sourceIndex(explorerSource, 'data-navi-explorer-title="true"', "task-first title hook is present");
  const search = sourceIndex(explorerSource, 'data-navi-search-controls="true"', "search controls hook is present");
  const input = sourceIndex(explorerSource, 'data-navi-search-input="true"', "search input hook is present");
  const filters = sourceIndex(explorerSource, 'data-navi-category-filters="true"', "filter group hook is present");
  const count = sourceIndex(explorerSource, 'data-navi-result-count="true"', "dynamic result-count hook is present");
  const quickStart = sourceIndex(explorerSource, 'data-navi-quick-start="true"', "Quick Start follows search controls");

  assert.ok(title < search && search < input && input < filters && filters < count && count < quickStart);
  assert.match(explorerSource, /aria-live="polite"/);
  assert.match(explorerSource, /maxLength=\{120\}/);
  assert.match(explorerSource, /\{announcedCount\} Navi references/);
});

test("derives three primary and remaining reviewed tasks without a second function manifest", () => {
  assert.match(explorerSource, /const primaryTasks = commonTasks\.slice\(0, 3\)/);
  assert.match(explorerSource, /const secondaryTasks = commonTasks\.slice\(3\)/);
  assert.match(explorerSource, /data-navi-quick-start-primary="true"/);
  assert.match(explorerSource, /data-navi-quick-start-secondary="true"/);
  assert.match(explorerSource, /data-navi-more-tasks-toggle="true"/);
  assert.match(explorerSource, /aria-expanded=\{moreTasksOpen\}/);
  assert.match(explorerSource, /aria-controls="navi-more-tasks"/);
  assert.match(explorerSource, /onClick=\{\(\) => setMoreTasksOpen\(\(open\) => !open\)\}/);
  assert.doesNotMatch(explorerSource, /setOpenReferenceName\([^)]*moreTasks/i);

  for (const name of ["stand", "forward", "turn", "sit", "stop", "get_battery_status"]) {
    assert.doesNotMatch(explorerSource, new RegExp(`["']${name}["']`), `${name} is derived from reviewed Common Tasks, not repeated as a literal`);
  }
});

test("renders one responsive master-detail workspace instead of inline details per row", () => {
  const workspace = sourceIndex(explorerSource, 'data-navi-reference-workspace="true"', "master-detail workspace hook is present");
  const index = sourceIndex(explorerSource, 'data-navi-reference-index="true"', "reference index hook is present");
  const desktopDetail = sourceIndex(explorerSource, 'data-navi-desktop-detail="true"', "desktop detail pane hook is present");
  const detailRenderer = sourceIndex(explorerSource, "<NaviReferenceDetail", "single detail renderer is present");
  assert.ok(workspace < index && index < desktopDetail);
  assert.ok(desktopDetail < detailRenderer, "detail renderer belongs to the workspace pane rather than an index row");
  assert.match(explorerSource, /data-navi-reference-selected=\{selected \? "true" : "false"\}/);
  assert.match(explorerSource, /aria-pressed=\{selected\}/);
  assert.match(explorerSource, /data-navi-reference-name-label="true"/);
  assert.match(explorerSource, /data-navi-reference-category-label="true"/);
  assert.match(explorerSource, /data-navi-reference-summary="true"/);
  assert.match(explorerSource, /data-navi-selected-indicator="true"/);
  assert.match(explorerSource, /selectedReference \? "hidden lg:block" : "block"/);
  assert.match(explorerSource, /selectedReference \? "block" : "hidden lg:block"/);
  assert.match(explorerSource, /lg:grid-cols-\[minmax\(280px,0\.36fr\)_minmax\(0,0\.64fr\)\]/);
});

test("keeps one NaviReferenceDetail renderer and a no-selection prompt", () => {
  assert.equal(explorerSource.match(/<NaviReferenceDetail\b/g)?.length, 1);
  assert.match(explorerSource, /const selectedReference = .*openReferenceName/);
  assert.match(explorerSource, /data-navi-detail-placeholder="true"/);
  assert.match(explorerSource, /Select a reference to view its documentation\./);
  assert.match(detailSource, /data-navi-mobile-back="true"/);
  assert.match(detailSource, /data-navi-mobile-back="true"[^]*?onClick=\{onRequestClose\}/);
  assert.match(detailSource, /Back to references/);
  assert.match(detailSource, /Close details/);
  assert.match(detailSource, /lg:hidden/);
  assert.match(detailSource, /hidden lg:inline/);
  assert.match(detailSource, /\{reference\.category\}/);
  const mobileBack = sourceIndex(detailSource, 'data-navi-mobile-back="true"', "mobile Back control is present");
  const detailTitle = sourceIndex(detailSource, 'id={`${detailId}-title`}', "reference title is present");
  assert.ok(mobileBack < detailTitle, "mobile Back control precedes the reference title in DOM order");
});

test("preserves explicit-only detail evidence and URL state handlers", () => {
  assert.equal(explorerSource.match(/onFunctionDetailViewed\?\./g)?.length, 2);
  assert.match(explorerSource, /function activateCommonTask\(name: string\)[^]*onFunctionDetailViewed\?\.\(\{ robot: "navi", functionName: name \}\)/);
  assert.match(explorerSource, /function toggleReference\(name: string\)[^]*if \(opening\) onFunctionDetailViewed\?\.\(\{ robot: "navi", functionName: name \}\)/);
  assert.doesNotMatch(explorerSource.match(/function closeReference\(name: string\)[^]*?\n  \}/)?.[0] ?? "", /onFunctionDetailViewed/);
  assert.match(explorerSource, /parseNaviExplorerState/);
  assert.match(explorerSource, /serializeNaviExplorerState/);
  assert.match(explorerSource, /router\.push\(hrefForState/);
  assert.match(explorerSource, /router\.replace/);
  assert.match(explorerSource, /function handleEscape/);
});
