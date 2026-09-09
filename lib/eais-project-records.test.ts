import assert from "node:assert/strict";
import test from "node:test";
import * as showcase from "./eais-showcase.ts";

test("a public project URL resolves its complete record, while an unknown slug cannot fall back to another project", () => {
  assert.equal(typeof showcase.findEaisProject, "function", "public details need a slug resolver");
  const walk = showcase.findEaisProject("prototype-walk-together");
  assert.equal(walk?.title, "Walk Together");
  assert.equal(walk?.image, "/assets/ff-robotics/ff-official-x2-motion-pair.jpg");
  assert.equal(showcase.findEaisProject("missing-project"), undefined);
  assert.equal(showcase.findEaisProject(""), undefined);

  for (const preview of showcase.prototypeWorks) {
    const record = showcase.findEaisProject(preview.slug);
    assert.ok(record?.project, `${preview.slug} must have a public project record`);
    assert.ok(record.project.problem.length > 40);
    assert.ok(record.project.robot.length > 10);
    assert.ok(record.project.hardware.length >= 3);
    assert.ok(record.project.architecture.length >= 3);
    assert.ok(record.project.development.length >= 3);
    assert.ok(record.project.evidence.plan.length >= 3);
  }
});

test("concept records cannot present absent demonstrations, experiments, contributors, or downloads as published work", () => {
  for (const work of showcase.prototypeWorks) {
    assert.ok("project" in work, `${work.slug} must explain its publication state`);
    const project = work.project;
    assert.equal(project.stage, "concept");
    assert.equal(project.evidence.status, "not-run");
    assert.equal(project.demo.status, "not-published");
    assert.equal(project.team.status, "not-published");
    assert.deepEqual(project.resources.map((resource) => resource.kind), ["code", "paper", "eaic-example"]);
    assert.ok(project.resources.every((resource) => resource.status === "not-published" && !("href" in resource)));
    assert.ok(project.coverNote.length > 20);
  }
});

test("discovery search finds proposed sensors and architecture and still respects a selected category", () => {
  assert.equal(typeof showcase.filterEaisWorks, "function", "project search needs to include its record");
  assert.deepEqual(showcase.filterEaisWorks("robot-arms", "  RGB-D  ").map((work) => work.slug), ["prototype-sort-at-sight"]);
  assert.ok(showcase.filterEaisWorks("humanoids", "person tracking").some((work) => work.slug === "prototype-walk-together"));
  assert.deepEqual(showcase.filterEaisWorks("drones", "person tracking"), []);
  assert.equal(showcase.filterEaisWorks("for-you", "  ").length, showcase.prototypeWorks.length);
  assert.deepEqual(showcase.filterEaisWorks("trending", "").map((work) => work.slug), ["prototype-night-run-rover", "prototype-gesture-lab", "prototype-trail-check"]);
});
