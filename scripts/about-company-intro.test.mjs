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

test("journey exposes the three approved steps together as lightweight editorial cards", () => {
  assert.equal((journey.match(/id: "(?:idea|build|share)"/g) ?? []).length, 3);
  assert.match(journey, /id: "idea"[\s\S]*?label: "Idea"/);
  assert.match(journey, /id: "build"[\s\S]*?label: "Build"/);
  assert.match(journey, /id: "share"[\s\S]*?label: "Share"/);
  assert.match(journey, /<header className=\{styles\.introHeader\}>/);
  assert.match(journey, /data-about-journey-grid/);
  assert.match(journey, /<article[\s\S]*?data-journey-card[\s\S]*?data-journey-step=\{step\.id\}/);
  assert.match(journey, /data-journey-number/);
  assert.match(journey, /data-journey-label/);
  assert.match(journey, /<IdeaWorkshop active\s*\/>/);
  assert.doesNotMatch(journey, /useState|useRef|KeyboardEvent/);
  assert.doesNotMatch(journey, /role="tab(?:list|panel)?"|aria-selected=|aria-controls=|\shidden=\{/);
  assert.doesNotMatch(journey, /setInterval|setTimeout/);
});

test("journey uses the approved responsive three-card editorial layout", () => {
  assert.match(stylesheet, /\.intro\s*{[^}]*display:\s*grid/s);
  assert.match(stylesheet, /\.intro\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(stylesheet, /\.introHeader\s*{[^}]*display:\s*grid/s);
  assert.match(stylesheet, /\.statement\s*{[^}]*font-family:\s*var\(--font-sans\)/s);
  assert.match(stylesheet, /\.statement\s*{[^}]*font-weight:\s*500/s);
  assert.match(stylesheet, /\.copy\s*{[^}]*max-width:\s*52ch/s);
  assert.match(stylesheet, /\.copy\s*{[^}]*line-height:\s*1\.7/s);
  assert.match(stylesheet, /\.cardGrid\s*{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(stylesheet, /\.card\s*{[^}]*border-top:\s*1px solid var\(--journey-line\)/s);
  const cardRule = stylesheet.match(/\.card\s*{([^}]*)}/s)?.[1] ?? "";
  assert.doesNotMatch(cardRule, /box-shadow|border-radius|background:/);
  assert.match(stylesheet, /\.scene\s*{[^}]*aspect-ratio:\s*520\s*\/\s*250/s);
  assert.match(stylesheet, /\.scene:focus-within\s*{[^}]*outline:\s*[23]px solid var\(--journey-blue\)[^}]*outline-offset:\s*[23]px/s);
  assert.match(stylesheet, /@media\s*\(min-width:\s*768px\)[\s\S]*?\.cardGrid\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(stylesheet, /@media\s*\(min-width:\s*1100px\)[\s\S]*?\.cardGrid\s*{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(stylesheet, /\.tabs?\b|\.panels?\b|journey-panel-enter/);
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
