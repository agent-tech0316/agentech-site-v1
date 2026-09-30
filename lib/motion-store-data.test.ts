import assert from "node:assert/strict";
import test from "node:test";

test("motion catalog exposes the complete replaceable storefront dataset", async () => {
  const data = await import("./motion-store-data.ts").catch(() => null);

  assert.ok(data, "motion-store-data.ts must define the catalog boundary");
  assert.deepEqual(data.motionCategories, [
    "Locomotion",
    "Sports",
    "Gestures",
    "Dance",
    "Combat",
    "Utility"
  ]);
  assert.equal(data.motionCatalog.length, 9);
  assert.equal(new Set(data.motionCatalog.map((motion) => motion.id)).size, 9);
  assert.equal(new Set(data.motionCatalog.map((motion) => motion.slug)).size, 9);
  assert.deepEqual(
    data.motionCatalog.map((motion) => motion.name),
    [
      "Golf Swing",
      "Walk Forward",
      "Run",
      "Wave",
      "Boxing Combo",
      "Dance 01",
      "Pick Up Object",
      "Sit Down",
      "Stand Up"
    ]
  );

  for (const motion of data.motionCatalog) {
    assert.ok(data.motionCategories.includes(motion.category));
    assert.ok(motion.description.length > 0);
    assert.equal(motion.status, "Coming Soon");
    assert.equal(motion.preview.type, "placeholder");
    assert.ok(motion.preview.motif.length > 0);
    assert.ok(motion.metadata.motionType.length > 0);
    assert.ok(motion.metadata.duration.length > 0);
    assert.ok(motion.metadata.compatibility.length > 0);
    assert.ok(motion.metadata.format.length > 0);
    assert.ok(motion.metadata.version.length > 0);
  }

  assert.deepEqual(
    data.featuredMotions.map((motion) => motion.id),
    data.motionCatalog.filter((motion) => motion.featured).map((motion) => motion.id)
  );
  assert.deepEqual(
    data.featuredMotions.map((motion) => motion.name),
    ["Golf Swing", "Walk Forward", "Run", "Wave", "Boxing Combo", "Dance 01"]
  );
});
