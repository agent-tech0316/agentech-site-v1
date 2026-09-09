import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [page, stylesheet] = await Promise.all([
  readFile(new URL("../app/about/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/about/about-team.module.css", import.meta.url), "utf8").catch(() => "")
]);

const expectedMembers = [
  ["Bill Wang", "Founder and CEO", "Leadership", "leadership"],
  ["Meryl Li", "Co-founder and COO", "Operations", "operations"],
  ["Connie Sun", "Co-founder and Strategy Advisor", "Strategy", "strategy"],
  ["Xin Gao", "CTO and Senior Hardware Engineer", "Hardware", "hardware"],
  ["Wesley Fan", "Senior Software Engineer", "Software", "software"],
  ["Victoria Chen", "Senior Project Engineer", "Robotics", "robotics"],
  ["William Wang", "Software Engineer", "Software", "software"],
  ["George Huang", "Software Engineer", "Software", "software"],
  ["Shuangyi Lian", "Product Manager", "Product", "product"]
];

const categories = ["leadership", "operations", "strategy", "hardware", "software", "robotics", "product"];

test("each unchanged team member has an explicit semantic category and Software shares one category", () => {
  const teamRecords = page.slice(page.indexOf("const teamMembers"), page.indexOf("] as const"));

  for (const [name, role, group, category] of expectedMembers) {
    assert.match(
      teamRecords,
      new RegExp(
        `name: "${name}"[\\s\\S]*?role: "${role}"[\\s\\S]*?group: "${group}"[\\s\\S]*?category: "${category}"`
      )
    );
  }

  assert.equal((teamRecords.match(/category: "software"/g) ?? []).length, 3);
  assert.doesNotMatch(teamRecords, /tone:/, "presentation colors should live in the category stylesheet");
});

test("team cards expose their categories through a locally scoped stylesheet", () => {
  assert.match(page, /import teamStyles from "\.\/about-team\.module\.css"/);
  assert.match(page, /data-team-category=\{member\.category\}/);
  assert.match(page, /className=\{`\$\{teamStyles\.card\}/);
  assert.match(page, /data-team-role-marker/);
  assert.doesNotMatch(page, /data-about-kicker[^>]*>&gt;<\/span>/);
});

test("seven restrained category palettes drive every requested card accent", () => {
  const lightAccents = [];
  const darkAccents = [];

  for (const category of categories) {
    const block = stylesheet.match(
      new RegExp(`\\.card\\[data-team-category="${category}"\\]\\s*\\{([\\s\\S]*?)\\}`)
    )?.[1];
    assert.ok(block, `${category} needs an explicit category block`);
    const light = block.match(/--team-accent-light:\s*(#[0-9a-f]{6})/i)?.[1];
    const dark = block.match(/--team-accent-dark:\s*(#[0-9a-f]{6})/i)?.[1];
    assert.ok(light && dark, `${category} needs explicit Light and Dark accent colors`);
    lightAccents.push(light.toLowerCase());
    darkAccents.push(dark.toLowerCase());
  }

  assert.equal(new Set(lightAccents).size, 7, "Light categories should remain visually distinct");
  assert.equal(new Set(darkAccents).size, 7, "Dark categories should remain visually distinct");
  assert.match(stylesheet, /\.card\[data-team-card\][\s\S]*?background-image:[\s\S]*?var\(--team-accent\)/);
  assert.match(stylesheet, /\.card\[data-team-card\][\s\S]*?background-color:\s*#090d10/);
  assert.match(stylesheet, /\.card\[data-team-card\]\s+\[data-team-group\][\s\S]*?color:\s*var\(--team-accent\)/);
  assert.match(stylesheet, /\.card\[data-team-card\]\s+\[data-team-role\][\s\S]*?color:\s*var\(--team-accent\)/);
  assert.match(stylesheet, /\.card\[data-team-card\]\s+\[data-team-role-marker\][\s\S]*?color:\s*var\(--team-accent\)/);
  assert.match(stylesheet, /\.card\[data-team-card\]\s+\[data-team-spark\][\s\S]*?background:\s*var\(--team-accent\)/);
  assert.match(stylesheet, /\.card\[data-team-card\]\s+\[data-team-orbit\][\s\S]*?border-color:[\s\S]*?var\(--team-accent\)/);
  assert.match(stylesheet, /\.card\[data-team-card\]:hover[\s\S]*?border-color:\s*var\(--team-accent\)/);
  assert.match(stylesheet, /:global\(:root\[data-theme="light"\]\)[\s\S]*?\.card\[data-team-card\]/);
});
