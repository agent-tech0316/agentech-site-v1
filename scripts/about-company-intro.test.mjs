import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [page, stylesheet, journey] = await Promise.all([
  readFile(new URL("../app/about/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/about/about-intro.module.css", import.meta.url), "utf8").catch(() => ""),
  readFile(new URL("../app/about/about-journey.tsx", import.meta.url), "utf8").catch(() => "")
]);

test("About keeps the production canonical and inherited Open Graph metadata", () => {
  assert.match(page, /import type \{ Metadata, ResolvingMetadata \} from "next"/);
  assert.match(page, /export async function generateMetadata/);
  assert.match(page, /alternates:\s*\{\s*canonical:\s*"\/about"/s);
  assert.match(page, /openGraph:\s*\{\s*\.\.\.inherited\.openGraph,\s*url:\s*"\/about"/s);
});

test("interactive company journey stays between the team heading and cards without turning the page into a client component", () => {
  const headingIndex = page.indexOf("Leadership and Technical Members");
  const introIndex = page.indexOf("<AboutJourney />");
  const cardsIndex = page.indexOf("data-team-grid");

  assert.ok(headingIndex >= 0, "About heading should remain present");
  assert.ok(introIndex > headingIndex, "Interactive company journey should follow the heading");
  assert.ok(cardsIndex > introIndex, "Team cards should follow the interactive company journey");
  assert.match(page, /import \{ AboutJourney \} from "\.\/about-journey"/);
  assert.doesNotMatch(page, /^"use client";/);
  assert.match(journey, /^"use client";/);
  assert.match(journey, /import styles from "\.\/about-intro\.module\.css"/);
  assert.match(journey, /data-about-intro-statement/);
  assert.match(journey, /At Agentech, we turn curiosity into creation with AI and robotics\./);
  assert.match(
    journey,
    /Through software tools, robot applications, and hands-on learning, we help you explore ideas, build skills, and create projects of your own\./
  );
  assert.doesNotMatch(journey, /From curiosity to creation\./);
  assert.doesNotMatch(journey, /Agentech brings together robotics, AI software/);
  assert.match(journey, /EAIC[\s\S]*?program, validate, and refine[\s\S]*?supervised robot session/);
  assert.match(journey, /EAIS[\s\S]*?robotics projects[\s\S]*?maker community/);
});

test("journey exposes three manual tabs with complete roving keyboard and panel semantics", () => {
  assert.equal((journey.match(/id: "(?:idea|build|share)"/g) ?? []).length, 3);
  assert.match(journey, /id: "idea"[\s\S]*?label: "Idea"/);
  assert.match(journey, /id: "build"[\s\S]*?label: "Build"/);
  assert.match(journey, /id: "share"[\s\S]*?label: "Share"/);
  assert.match(journey, /useState\(0\)/);
  assert.match(journey, /role="tablist"/);
  assert.match(journey, /role="tab"/);
  assert.match(journey, /aria-selected=/);
  assert.match(journey, /aria-controls=/);
  assert.match(journey, /tabIndex=\{isActive \? 0 : -1\}/);
  assert.match(journey, /role="tabpanel"/);
  assert.match(journey, /aria-labelledby=/);
  for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
    assert.ok(journey.includes(`"${key}"`), `${key} keyboard behavior should be implemented`);
  }
  assert.doesNotMatch(journey, /setInterval|setTimeout/);
});

test("journey uses a responsive Manrope layout with stable scenes and accessible motion", () => {
  assert.match(stylesheet, /\.intro\s*{[^}]*display:\s*grid/s);
  assert.match(stylesheet, /\.intro\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(stylesheet, /\.statement\s*{[^}]*font-family:\s*var\(--font-sans\)/s);
  assert.match(stylesheet, /\.statement\s*{[^}]*font-weight:\s*500/s);
  assert.match(stylesheet, /\.statement\s*{[^}]*max-width:\s*24ch/s);
  assert.match(stylesheet, /\.statementRule\s*{[^}]*flex-shrink:\s*0/s);
  assert.match(stylesheet, /\.copy\s*{[^}]*max-width:\s*52ch/s);
  assert.match(stylesheet, /\.copy\s*{[^}]*line-height:\s*1\.7/s);
  assert.match(stylesheet, /\.tab\s*{[^}]*min-height:\s*44px/s);
  assert.match(stylesheet, /\.tab:focus-visible\s*{/s);
  assert.match(stylesheet, /\.panel\s*{[^}]*min-height:\s*18rem/s);
  assert.match(stylesheet, /@media\s*\(min-width:\s*768px\)[\s\S]*?\.intro\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*0\.9fr\)\s*minmax\(0,\s*2fr\)/);
  assert.match(stylesheet, /@media\s*\(min-width:\s*768px\)[\s\S]*?\.statement\s*{[^}]*max-width:\s*22ch/);
  assert.match(stylesheet, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none/);
});

test("the original six members remain unchanged and three new members are appended in order", () => {
  const teamRecords = page.slice(page.indexOf("const teamMembers"), page.indexOf("] as const"));
  const originalMembers = [
    ["Bill Wang", "Founder and CEO"],
    ["Meryl Li", "Co-founder and COO"],
    ["Connie Sun", "Co-founder and Strategy Advisor"],
    ["Xin Gao", "CTO and Senior Hardware Engineer"],
    ["Wesley Fan", "Senior Software Engineer"],
    ["Victoria Chen", "Senior Project Engineer"]
  ];
  const appendedMembers = [
    ["William Wang", "Software Engineer", "Software"],
    ["George Huang", "Software Engineer", "Software"],
    ["Shuangyi Lian", "Product Manager", "Product"]
  ];

  assert.equal((teamRecords.match(/\n\s+name:/g) ?? []).length, 9, "Exactly nine team records should be present");
  for (const [name, role] of originalMembers) {
    assert.match(teamRecords, new RegExp(`name: "${name}"[\\s\\S]*?role: "${role}"`));
  }
  for (const [name, role, group] of appendedMembers) {
    assert.match(teamRecords, new RegExp(`name: "${name}"[\\s\\S]*?role: "${role}"[\\s\\S]*?group: "${group}"`));
  }

  const originalLastIndex = teamRecords.indexOf('name: "Victoria Chen"');
  const williamIndex = teamRecords.indexOf('name: "William Wang"');
  const georgeIndex = teamRecords.indexOf('name: "George Huang"');
  const shuangyiIndex = teamRecords.indexOf('name: "Shuangyi Lian"');
  assert.ok(originalLastIndex < williamIndex, "William Wang should follow the original six members");
  assert.ok(williamIndex < georgeIndex, "George Huang should follow William Wang");
  assert.ok(georgeIndex < shuangyiIndex, "Shuangyi Lian should follow George Huang");
});
