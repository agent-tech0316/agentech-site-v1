import assert from "node:assert/strict";
import test from "node:test";
import { motionCatalog } from "./motion-store-data.ts";

test("motion filtering combines normalized text and category without mutating catalog order", async () => {
  const module = await import("./motion-store-filter.ts").catch(() => null);
  assert.ok(module, "motion-store-filter.ts must define the catalog filtering boundary");

  const { filterMotions } = module;
  const originalOrder = motionCatalog.map((motion) => motion.id);

  assert.deepEqual(filterMotions(motionCatalog, "", "All").map((motion) => motion.name), [
    "Golf Swing",
    "Walk Forward",
    "Run",
    "Wave",
    "Boxing Combo",
    "Dance 01",
    "Pick Up Object",
    "Sit Down",
    "Stand Up"
  ]);
  assert.deepEqual(filterMotions(motionCatalog, "  GOLF  ", "All").map((motion) => motion.name), ["Golf Swing"]);
  assert.deepEqual(filterMotions(motionCatalog, " locomotion ", "All").map((motion) => motion.name), ["Walk Forward", "Run"]);
  assert.deepEqual(filterMotions(motionCatalog, "greeting", "All").map((motion) => motion.name), ["Wave"]);
  assert.deepEqual(filterMotions(motionCatalog, "", "Utility").map((motion) => motion.name), [
    "Pick Up Object",
    "Sit Down",
    "Stand Up"
  ]);
  assert.deepEqual(filterMotions(motionCatalog, "grab", "Utility").map((motion) => motion.name), ["Pick Up Object"]);
  assert.deepEqual(filterMotions(motionCatalog, "golf", "Utility"), []);
  assert.deepEqual(motionCatalog.map((motion) => motion.id), originalOrder);
  assert.notEqual(filterMotions(motionCatalog, "", "All"), motionCatalog);
});
