import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import test from "node:test";
import postcss from "postcss";
import sharp from "sharp";

const taskRoutes = [
  ["Start Coding", "/agentech-products/eaic-hub/start-coding"],
  ["View SDK", "/agentech-products/eaic-hub/view-sdk"],
  ["Code Certification", "/agentech-products/eaic-hub/software-check"],
  ["Live Stream", "/agentech-products/eaic-hub/watch-live-run"],
];

const workbenchSource = readFileSync(
  new URL("../features/eaic/01-clients/eaic-hub/components/agentech-library-workbench.tsx", import.meta.url),
  "utf8",
);
const naviReferenceSource = readFileSync(
  new URL("../features/eaic/02-unified-api/projects-validation/navi-sdk-reference.ts", import.meta.url),
  "utf8",
);

let baseUrl = process.env.EAIC_THEME_TEST_BASE_URL ?? "";
let serverProcess;
let serverOutput = "";
const pages = new Map();

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

async function startDevelopmentServer() {
  const port = await reservePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
  );

  serverProcess.stdout.on("data", (chunk) => {
    serverOutput += chunk;
  });
  serverProcess.stderr.on("data", (chunk) => {
    serverOutput += chunk;
  });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Next.js development server exited early.\n${serverOutput}`);
    }

    try {
      const response = await fetch(`${baseUrl}${taskRoutes[0][1]}`);
      if (response.status === 200) {
        return;
      }
    } catch {
      // The server has not started listening yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for the Next.js development server.\n${serverOutput}`);
}

test.before(async () => {
  if (!baseUrl) {
    await startDevelopmentServer();
  }

  for (const [title, route] of taskRoutes) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 200, `${title} should load`);
    pages.set(route, await response.text());
  }
});

test.after(async () => {
  if (!serverProcess || serverProcess.exitCode !== null) {
    return;
  }

  serverProcess.kill("SIGTERM");
  await once(serverProcess, "exit");
});

async function loadPageStylesheet(route) {
  const response = await fetch(`${baseUrl}${route}`);
  assert.equal(response.status, 200, `${route} should load`);
  const html = await response.text();
  const stylesheetHrefs = [...html.matchAll(/<link\b[^>]*>/g)]
    .map(([tag]) => ({
      href: tag.match(/\bhref="([^"]+)"/)?.[1],
      rel: tag.match(/\brel="([^"]+)"/)?.[1],
    }))
    .filter(({ href, rel }) => href && rel === "stylesheet")
    .map(({ href }) => href);

  assert.ok(stylesheetHrefs.length > 0, `${route} should load at least one stylesheet`);
  const stylesheets = await Promise.all(
    stylesheetHrefs.map(async (href) => {
      const stylesheetResponse = await fetch(new URL(href, baseUrl));
      assert.equal(stylesheetResponse.status, 200, `${href} should load`);
      return stylesheetResponse.text();
    }),
  );

  return { html, stylesheet: postcss.parse(stylesheets.join("\n")) };
}

function darkRuleDeclarations(stylesheet, selectorFragments) {
  const declarations = {};

  stylesheet.walkRules((rule) => {
    const isDarkThemeRule = /\[data-theme=(?:"dark"|dark)\]/.test(rule.selector);
    if (!isDarkThemeRule || !selectorFragments.every((fragment) => rule.selector.includes(fragment))) {
      return;
    }

    for (const node of rule.nodes) {
      if (node.type === "decl") {
        declarations[node.prop] = node.value;
      }
    }
  });

  return declarations;
}

test("renders all four EAIC tasks with the approved warm immersion theme", () => {
  for (const [title, route] of taskRoutes) {
    const html = pages.get(route) ?? "";
    assert.match(html, /bg-\[\#f5f4f1\] text-\[\#111111\]/, `${title} should use the warm page canvas`);
    assert.match(html, /text-\[\#1a73e8\]/, `${title} should use the electric-blue label color`);
    assert.match(html, /rounded-\[22px\]/, `${title} should render the rounded immersion cards`);
  }
});

test("renders the task numbers as black circles without leading zeros", () => {
  const expectedNumbers = ["1", "2", "3", "4"];

  taskRoutes.forEach(([, route], index) => {
    const html = pages.get(route) ?? "";
    assert.match(
      html,
      new RegExp(`data-task-number-badge="true"[^>]*rounded-full[^>]*bg-\\\[\\#111111\\\][^>]*>${expectedNumbers[index]}</div>`),
      `${route} should render its task number as a black circle`,
    );
  });
});

test("keeps every SDK category heading on the same left edge", () => {
  const html = pages.get("/agentech-products/eaic-hub/view-sdk") ?? "";
  assert.match(html, /data-sdk-category-summary="true"[^>]*sm:grid-cols-\[32px_minmax\(0,1fr\)_auto\]/);
  assert.match(html, /data-sdk-category-arrow="true"/);
  assert.match(html, /data-sdk-category-copy="true"/);
});

test("left-aligns every SDK function signature at the start of its command row", () => {
  const html = pages.get("/agentech-products/eaic-hub/view-sdk") ?? "";
  const signatures = html.match(/data-sdk-function-signature="true"[^>]*>/g) ?? [];

  assert.ok(signatures.length > 0, "the SDK page should render function signatures");
  for (const signature of signatures) {
    assert.match(signature, /\bjustify-self-start\b/);
    assert.match(signature, /\btext-left\b/);
  }
});

test("keeps every robot's SDK controls together after a custom disclosure arrow", () => {
  const html = pages.get("/agentech-products/eaic-hub/view-sdk") ?? "";
  const compactMasterRows = [...html.matchAll(/data-sdk-function-name="([^"]+)"[^>]*><summary data-sdk-function-summary-layout="compact-leading"/g)]
    .map((match) => match[1]);

  assert.equal(compactMasterRows.length, 38, "every Master command row should use the leading compact layout");
  assert.match(
    workbenchSource,
    /const useTrailingDescriptionLayout = selectedRobot === "master"[\s\S]*?\|\| selectedRobot === "aegis"[\s\S]*?\|\| selectedRobot === "navi"/,
  );
  assert.match(workbenchSource, /data-sdk-function-summary-layout=\{useCompactFunctionLayout/);
  assert.match(workbenchSource, /data-sdk-description-layout=\{useTrailingDescriptionLayout \? "trailing-column"/);
  assert.match(workbenchSource, /data-sdk-function-arrow="true"/);
  assert.match(workbenchSource, /data-sdk-function-controls="true"/);
  assert.match(workbenchSource, /xl:grid-cols-\[24px_max-content_auto_minmax\(32px,1fr\)_minmax\(360px,40%\)\]/);
});

test("keeps the six Navi Athletics commands while using the unified SDK row renderer", () => {
  const athleticsFunctions = [...naviReferenceSource.matchAll(
    /\{\s*name: "([^"]+)",\s*category: "Athletics"/g,
  )].map((match) => match[1]);

  assert.deepEqual(athleticsFunctions, [
    "jump",
    "jump_round",
    "jump_forward",
    "frontflip",
    "sideflip",
    "kick",
  ]);
  assert.match(workbenchSource, /const useCompactFunctionLayout = useTrailingDescriptionLayout/);
});

test("lays out the three Master SDK summary metrics in one equal-width desktop row", () => {
  const html = pages.get("/agentech-products/eaic-hub/view-sdk") ?? "";
  assert.match(
    html,
    /data-sdk-overview-grid="true"[^>]*data-sdk-overview-count="3"[^>]*md:grid-cols-3/,
  );
});

test("presents Master SDK groups as joint adjustment, posture, then action commands", () => {
  const html = (pages.get("/agentech-products/eaic-hub/view-sdk") ?? "").replaceAll("<!-- -->", "");
  const expectedGroups = [
    ["joint-adjustments", "Joint Adjustment Commands"],
    ["sensing", "Posture Commands"],
    ["actions", "Action Commands"],
  ];
  const overviewOffset = html.indexOf('data-sdk-overview-grid="true"');
  const firstSummaryOffset = html.indexOf('data-sdk-category-summary="true"');
  let summaryOffset = overviewOffset;

  assert.ok(overviewOffset >= 0 && firstSummaryOffset > overviewOffset, "the Master SDK summary and detail regions should render");
  for (const [anchor, title] of expectedGroups) {
    const hrefOffset = html.indexOf(`href="#function-${anchor}"`, summaryOffset);
    const titleOffset = html.indexOf(`>${title}<`, hrefOffset);
    assert.ok(hrefOffset >= summaryOffset && hrefOffset < firstSummaryOffset, `${title} should appear in the Master summary region`);
    assert.ok(titleOffset > hrefOffset && titleOffset < firstSummaryOffset, `${title} should label its Master summary card`);
    summaryOffset = titleOffset;
  }

  let detailOffset = overviewOffset;
  for (const [anchor, title] of expectedGroups) {
    const groupOffset = html.indexOf(`id="function-${anchor}"`, detailOffset);
    const titleOffset = html.indexOf(`>${title}</h2>`, groupOffset);
    assert.ok(groupOffset >= detailOffset, `${title} should render as a detailed Master group`);
    assert.ok(titleOffset > groupOffset, `${title} should be the detailed Master group heading`);
    detailOffset = titleOffset;
  }
});

test("documents the latest Master command set once per API without changing the three-group layout", () => {
  const html = (pages.get("/agentech-products/eaic-hub/view-sdk") ?? "").replaceAll("<!-- -->", "");
  const decodedHtml = html.replaceAll("&quot;", '"').replaceAll("&#x27;", "'");
  const groupStarts = [
    html.indexOf('id="function-joint-adjustments"'),
    html.indexOf('id="function-sensing"'),
    html.indexOf('id="function-actions"'),
  ];

  assert.ok(groupStarts[0] >= 0 && groupStarts[0] < groupStarts[1] && groupStarts[1] < groupStarts[2]);
  const jointHtml = html.slice(groupStarts[0], groupStarts[1]);
  const postureHtml = html.slice(groupStarts[1], groupStarts[2]);
  const actionHtml = html.slice(groupStarts[2]);
  const functionNames = (fragment) => [...fragment.matchAll(/data-sdk-function-name="([^"]+)"/g)].map((match) => match[1]);
  const postureNames = functionNames(postureHtml);
  const jointNames = functionNames(jointHtml);
  const actionNames = functionNames(actionHtml);

  assert.deepEqual(postureNames, [
    "enter_stand_hand_guide",
    "restore_stand_hand_guide",
    "restore_stand_default",
    "status",
  ]);
  assert.deepEqual(jointNames, [
    "adjust_right_elbow",
    "adjust_left_elbow",
    "adjust_both_elbows",
    "adjust_elbow",
    "move_elbows_to",
    "adjust_right_shoulder",
    "adjust_left_shoulder",
    "adjust_right_wrist",
    "adjust_left_wrist",
    "adjust_wrist",
    "adjust_waist",
    "return_waist_to_neutral",
    "adjust_upper_body",
    "move_arms_to",
    "mirror_arm_pose",
    "move_mirrored_arms_to",
  ]);
  assert.equal(actionNames.length, 18, "the existing 18 actions should render once each");
  assert.equal(actionNames.filter((name) => name === "stay").length, 1, "stay should render as one command card");
  assert.equal(new Set([...postureNames, ...jointNames, ...actionNames]).size, 38, "all Master documentation cards should have unique API names");
  assert.deepEqual(
    [...jointHtml.matchAll(/data-master-joint-group="([^"]+)"/g)].map((match) => match[1]),
    ["Elbows", "Shoulders", "Wrists", "Waist", "Upper Body"],
  );
  assert.match(postureHtml, /Commands for entering and restoring supported standing modes\./);
  assert.match(jointHtml, /Fine control of Master’s shoulders, elbows, wrists, waist, and upper-body joints\./);
  assert.match(actionHtml, /Predefined and coordinated arm, pose, and movement commands for Master\./);
  assert.match(html, /from agentech import Agentech, master/);
  assert.match(html, /ssh_password=&quot;YOUR_PASSWORD&quot;/);
  assert.doesNotMatch(html, /ssh_password=&quot;1&quot;/);
  assert.doesNotMatch(html, /data-sdk-function-name="standing_actions\.teach"/);
  assert.doesNotMatch(html, /data-sdk-function-name="action_catalog"/);
  assert.doesNotMatch(html, /Agentech\.movement_b|data-sdk-function-name="movement_b"/);
  assert.match(html, /data-sdk-overview-category="Sensing"[^>]*data-sdk-function-count="4"/);
  assert.match(html, /data-sdk-overview-category="Joint Adjustments"[^>]*data-sdk-function-count="16"/);
  assert.match(html, /data-sdk-overview-category="Actions"[^>]*data-sdk-function-count="18"/);

  for (const example of [
    'Agentech.enter_stand_hand_guide("right")',
    'Agentech.enter_stand_hand_guide("both")',
    "Agentech.restore_stand_hand_guide()",
    "Agentech.restore_stand_default()",
    "Agentech.adjust_right_elbow(+5, duration_seconds=1.0)",
    "Agentech.adjust_left_elbow(+5, duration_seconds=1.0)",
    "Agentech.adjust_both_elbows(+30, duration_seconds=3.0)",
    'Agentech.adjust_elbow("right", +5, duration_seconds=1.0)',
    'Agentech.adjust_elbow("left", +5, duration_seconds=1.0)',
    "Agentech.move_elbows_to(50, duration_seconds=8.0)",
    'Agentech.adjust_right_shoulder("pitch", +5, duration_seconds=1.0)',
    'Agentech.adjust_right_shoulder("roll", +5, duration_seconds=1.0)',
    'Agentech.adjust_right_shoulder("yaw", +5, duration_seconds=1.0)',
    'Agentech.adjust_left_shoulder("pitch", +5, duration_seconds=1.0)',
    'Agentech.adjust_left_shoulder("roll", +5, duration_seconds=1.0)',
    'Agentech.adjust_left_shoulder("yaw", +5, duration_seconds=1.0)',
    'Agentech.adjust_right_wrist("roll", +5)',
    'Agentech.adjust_right_wrist("pitch", +5)',
    'Agentech.adjust_right_wrist("yaw", +5)',
    "Agentech.adjust_right_wrist(roll=+5, pitch=-3, yaw=+2)",
    "Agentech.adjust_right_wrist(+10)",
    'Agentech.adjust_left_wrist("roll", +5)',
    'Agentech.adjust_left_wrist("pitch", +5)',
    'Agentech.adjust_left_wrist("yaw", +5)',
    "Agentech.adjust_left_wrist(roll=+5, pitch=-3, yaw=+2)",
    "Agentech.adjust_left_wrist(+10)",
    "Agentech.adjust_wrist(roll=+5, pitch=-3, yaw=+2)",
    'Agentech.adjust_waist("yaw", +10)',
    "Agentech.stay(1.0)",
  ]) {
    assert.ok(decodedHtml.includes(example), `${example} should be present as a Master usage example`);
  }
  for (const multilineExampleFragment of [
    "max_duration_seconds=8.0",
    'waist={"yaw": +10}',
    '"shoulder_pitch": -19.45',
    'source_side="right"',
    'source_side="left"',
    "duration_seconds=20.0",
  ]) {
    assert.ok(decodedHtml.includes(multilineExampleFragment), `${multilineExampleFragment} should be present in the engineering examples`);
  }
});

test("presents adjust_waist overloads with one axis example and accurate parameter types", () => {
  const html = (pages.get("/agentech-products/eaic-hub/view-sdk") ?? "")
    .replaceAll("<!-- -->", "")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'");
  const waistStart = html.indexOf('data-sdk-function-name="adjust_waist"');
  const waistEnd = html.indexOf('data-sdk-function-name="return_waist_to_neutral"', waistStart);

  assert.ok(waistStart >= 0 && waistEnd > waistStart, "the adjust_waist card should render before return_waist_to_neutral");
  const waistHtml = html.slice(waistStart, waistEnd);
  assert.match(waistHtml, />axis<\/span><span[^>]*>string \("roll", "pitch", "yaw"\)<\/span>/);
  assert.match(waistHtml, />degrees<\/span><span[^>]*>number · dynamic limit<\/span>/);
  for (const numericAxis of ["yaw", "pitch", "roll"]) {
    assert.match(
      waistHtml,
      new RegExp(`>${numericAxis}<\\/span><span[^>]*>number<\\/span>`),
      `${numericAxis} should remain a numeric keyword argument`,
    );
  }

  const exampleStart = waistHtml.lastIndexOf(">Example<");
  const exampleEnd = waistHtml.indexOf("</pre>", exampleStart);
  assert.ok(exampleStart >= 0 && exampleEnd > exampleStart, "the adjust_waist card should render a primary Example block");
  const exampleHtml = waistHtml.slice(exampleStart, exampleEnd);
  assert.match(exampleHtml, /Agentech\.adjust_waist\("yaw", \+10\)/);
  assert.doesNotMatch(exampleHtml, /"pitch"|"roll"|max_duration_seconds/);
});

test("documents Master default-speed profiles and separates paid performances from pending duration pricing", () => {
  const html = (pages.get("/agentech-products/eaic-hub/view-sdk") ?? "")
    .replaceAll("<!-- -->", "")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'");
  const cards = [...html.matchAll(/data-sdk-function-name="([^"]+)"/g)];
  const cardHtml = (name) => {
    const cardIndex = cards.findIndex((match) => match[1] === name);
    assert.ok(cardIndex >= 0, `${name} should render as a Master command card`);
    const start = cards[cardIndex].index;
    const end = cards[cardIndex + 1]?.index ?? html.length;
    return html.slice(start, end);
  };

  for (const shoulder of ["adjust_right_shoulder", "adjust_left_shoulder"]) {
    assert.match(cardHtml(shoulder), />axis<\/span><span[^>]*>string \("roll", "pitch", "yaw"\)<\/span>/);
  }
  for (const wrist of ["adjust_right_wrist", "adjust_left_wrist"]) {
    assert.match(cardHtml(wrist), />axis<\/span><span[^>]*>string \("roll", "pitch", "yaw"\) or number<\/span>/);
  }

  const plain = (fragment) => fragment.replace(/<[^>]*>/g, "");
  const leftElbow = plain(cardHtml("adjust_left_elbow"));
  const defaultCall = leftElbow.indexOf("Agentech.adjust_left_elbow(degrees = x)");
  const explanation = leftElbow.indexOf("Adjust left elbow by x degrees, at default speed.");
  const customCall = leftElbow.indexOf("Agentech.adjust_left_elbow(degrees = x, duration_seconds = x)");
  assert.ok(defaultCall >= 0 && explanation > defaultCall && customCall > explanation, "show default syntax, its explanation, then custom duration syntax");
  assert.match(html, /Using code to run robot or Navi performances on this website requires payment\./);
  assert.match(leftElbow, /Custom duration may require an extra fee or a higher-tier plan\./);
  assert.match(leftElbow, /Pricing TBD/);
  assert.doesNotMatch(html, /Paid users only|Top up to customize duration|Top up on this website to customize duration/);
  assert.match(plain(cardHtml("adjust_right_shoulder")), /Adjust right shoulder pitch by x degrees, at default speed\./);
  assert.match(plain(cardHtml("move_elbows_to")), /Move both elbows to x degrees, at default speed\./);
  assert.match(plain(cardHtml("mirror_arm_pose")), /Mirror the right arm pose onto the left arm, at default speed\./);
  assert.match(plain(cardHtml("adjust_left_wrist")), /Adjust left wrist roll by x degrees, at default speed\./);

  const jointStart = html.indexOf('id="function-joint-adjustments"');
  const jointEnd = html.indexOf('id="function-sensing"', jointStart);
  const jointHtml = html.slice(jointStart, jointEnd);
  const defaultSyntaxes = [...jointHtml.matchAll(/data-sdk-profile-default="true"[^>]*>([\s\S]*?)<\/p>/g)];
  assert.equal(defaultSyntaxes.length, 33, "every joint profile should document default speed");
  for (const [, syntax] of defaultSyntaxes) {
    assert.doesNotMatch(plain(syntax), /(?:max_)?duration_seconds\s*=/);
  }
  assert.equal([...jointHtml.matchAll(/data-sdk-profile-description="true"/g)].length, 33);
  assert.equal([...jointHtml.matchAll(/data-sdk-profile-custom-duration="true"/g)].length, 19);

  const parameterRows = [...jointHtml.matchAll(/<details data-sdk-param-name="([^"]+)"[\s\S]*?<\/details>/g)];
  assert.ok(parameterRows.length > 0);
  for (const [row, name] of parameterRows) {
    if (name === "duration_seconds" || name === "max_duration_seconds") {
      assert.match(row, /Pricing TBD/);
      assert.doesNotMatch(row, />Available</);
    } else {
      assert.doesNotMatch(row, /Pricing TBD/);
    }
  }
  assert.doesNotMatch(jointHtml, /Adjustable by authorized users only/);
});

test("explains Master Posture Commands once and exposes valid arm configurations without another disclosure", () => {
  const html = (pages.get("/agentech-products/eaic-hub/view-sdk") ?? "")
    .replaceAll("<!-- -->", "")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'");
  const cards = [...html.matchAll(/data-sdk-function-name="([^"]+)"/g)];
  const cardHtml = (name) => {
    const index = cards.findIndex((match) => match[1] === name);
    assert.ok(index >= 0, `${name} should remain one command`);
    return html.slice(cards[index].index, cards[index + 1]?.index ?? html.length);
  };
  const plain = (fragment) => fragment.replace(/<[^>]*>/g, "");
  const entry = cardHtml("enter_stand_hand_guide");
  const entryText = plain(entry);
  assert.match(entry, /data-sdk-posture-title="true"[^>]*>Enter Standing Hand Guidance</);
  assert.match(entryText, /Agentech\.enter_stand_hand_guide\(side\)/);
  assert.equal((entry.match(/data-sdk-profile-syntax="true"/g) ?? []).length, 2);
  assert.match(entryText, /Right arm.*Enables Hand Guidance for the right arm\./s);
  assert.match(entryText, /Both arms.*Enables Hand Guidance for both arms\./s);
  const side = entry.match(/<details data-sdk-param-name="side"[\s\S]*?<\/details>/)?.[0] ?? "";
  const sideSummary = side.split("</summary>")[0];
  assert.match(sideSummary, /data-sdk-param-allowed-values="true"/);
  assert.match(plain(sideSummary), /Allowed values:.*"right".*"both"/s);
  assert.match(plain(side), /Selects which arm configuration enters Hand Guidance mode\./);
  assert.match(entryText, /# Enable Hand Guidance for the right arm\nAgentech\.enter_stand_hand_guide\("right"\)\n\n# Enable Hand Guidance for both arms\nAgentech\.enter_stand_hand_guide\("both"\)/);

  for (const name of ["enter_stand_hand_guide", "restore_stand_hand_guide", "restore_stand_default", "status"]) {
    const card = cardHtml(name);
    const explanation = card.match(/data-sdk-posture-explanation="true"[^>]*>([\s\S]*?)<\/p>/)?.[1];
    assert.ok(explanation, `${name} should have a plain-English explanation`);
    assert.equal(card.split(explanation).length - 1, 1, `${name} should not repeat its description in the summary`);
    const order = ["data-sdk-posture-title", "data-sdk-posture-signature", "data-sdk-posture-explanation", "data-sdk-posture-configurations", ">Parameters<", ">Example<"].map((marker) => card.indexOf(marker));
    assert.ok(order.every((offset, index) => offset >= 0 && (index === 0 || offset > order[index - 1])), `${name} should follow the requested documentation hierarchy`);
  }
  assert.match(plain(cardHtml("restore_stand_hand_guide")), /selected arms and waist.*reference positions.*releases.*hold/s);
  assert.match(plain(cardHtml("restore_stand_hand_guide")), /restore_stand_default\(\).*stiffness/s);
  assert.match(plain(cardHtml("restore_stand_default")), /stiffness.*does not.*pose/s);
  assert.match(plain(cardHtml("status")), /Does not move Master\./);
  assert.doesNotMatch(entryText, /allows? .*physically moved by hand/i);
});

test("makes all 18 Master Action Commands readable with visible parameters and matching preview calls", () => {
  const html = (pages.get("/agentech-products/eaic-hub/view-sdk") ?? "")
    .replaceAll("<!-- -->", "").replaceAll("&quot;", '"').replaceAll("&#x27;", "'");
  const cards = [...html.matchAll(/data-sdk-function-name="([^"]+)"/g)];
  const actionNames = ["wave", "blow_kiss", "raise_hand", "salute", "heart", "handshake", "high_five", "clap", "cross_arms", "chest_wave", "hug", "cheer", "wave_goodbye", "raise_hands", "bow", "scratch_head", "center", "stay"];
  const handCommands = new Set(["wave", "blow_kiss", "raise_hand", "salute", "heart", "handshake", "high_five", "chest_wave"]);
  const plain = (value) => value.replace(/<[^>]*>/g, "").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
  for (const name of actionNames) {
    const index = cards.findIndex((match) => match[1] === name);
    assert.ok(index >= 0, `${name} should be present`);
    const card = html.slice(cards[index].index, cards[index + 1]?.index ?? html.indexOf("</details>", cards[index].index) + 10);
    const summary = card.match(/data-sdk-function-description="true"[^>]*>([\s\S]*?)<\/p>/)?.[1];
    const definition = card.match(/data-sdk-action-definition="true"[^>]*>([\s\S]*?)<\/p>/)?.[1];
    assert.ok(summary && definition, `${name} needs both a short summary and detailed behavior`);
    assert.notEqual(plain(summary), plain(definition), `${name} should not repeat its summary`);
    assert.match(card, /data-sdk-action-preview-call="true"/);
    assert.match(card, />Action Preview</);
    assert.doesNotMatch(card, />Verification<|bg-\[#e8f7f3\]/, "verification should not be a prominent panel");
    if (handCommands.has(name)) {
      const values = name === "heart" ? ["left", "right", "both"] : ["left", "right"];
      const hand = card.match(/data-sdk-action-parameter="hand"[\s\S]*?<\/section>/)?.[0] ?? "";
      assert.match(hand, /Allowed values:/);
      assert.doesNotMatch(hand, /<details|<summary/);
      for (const value of values) {
        assert.ok(plain(card).includes(`Agentech.${name}("${value}")`), `${name} should show the ${value} example`);
        assert.ok(plain(hand).includes(`"${value}"`), `${name} should expose ${value} outside a disclosure`);
        assert.ok(card.includes(`data-sdk-action-option="${value}"`));
      }
    } else if (name === "stay") {
      assert.match(card, /data-sdk-action-parameter="seconds"/);
      assert.match(plain(card), /0 < seconds ≤ 300/);
    } else {
      assert.match(card, />No parameters\.</);
      assert.doesNotMatch(card, /data-sdk-action-option|Select .+ preview variant/);
    }
    if (name === "wave") {
      assert.match(plain(card), /# Wave with the left hand\nAgentech\.wave\("left"\)\n\n# Wave with the right hand\nAgentech\.wave\("right"\)/);
    }
    if (name === "center") assert.match(plain(definition), /head.*saved.*center/i);
    if (name === "heart") {
      for (const parameter of ["posture", "operator_ready", "feet_planted"]) {
        assert.ok(card.includes(`data-sdk-action-parameter="${parameter}"`));
      }
    }
  }
});

test("renders the engineering Master usage variants as numbered parameter profiles", () => {
  const html = (pages.get("/agentech-products/eaic-hub/view-sdk") ?? "").replaceAll("<!-- -->", "");
  const expectedProfiles = new Map([
    ["enter_stand_hand_guide", ["Right arm", "Both arms"]],
    ["adjust_right_elbow", ["Right elbow relative angle"]],
    ["adjust_left_elbow", ["Left elbow relative angle"]],
    ["adjust_both_elbows", ["Both elbows relative angle"]],
    ["adjust_elbow", ["Select right elbow", "Select left elbow"]],
    ["move_elbows_to", ["Both elbows target angle"]],
    ["adjust_right_shoulder", ["Pitch axis", "Roll axis", "Yaw axis"]],
    ["adjust_left_shoulder", ["Pitch axis", "Roll axis", "Yaw axis"]],
    ["adjust_right_wrist", ["Roll axis", "Pitch axis", "Yaw axis", "Combined axes", "Single-value form"]],
    ["adjust_left_wrist", ["Roll axis", "Pitch axis", "Yaw axis", "Combined axes", "Single-value form"]],
    ["adjust_wrist", ["Combined wrist axes"]],
    ["adjust_waist", ["Yaw axis", "Pitch axis", "Roll axis", "Combined waist axes"]],
    ["return_waist_to_neutral", ["Return to neutral"]],
    ["adjust_upper_body", ["Waist + both elbows"]],
    ["move_arms_to", ["Right + left arm targets"]],
    ["mirror_arm_pose", ["Mirror from right arm", "Mirror from left arm"]],
    ["move_mirrored_arms_to", ["Mirrored arm target"]],
  ]);

  for (const [command, profileNames] of expectedProfiles) {
    const commandOffset = html.indexOf(`data-sdk-function-name="${command}"`);
    const nextCommandOffset = html.indexOf('data-sdk-function-name="', commandOffset + 1);
    const commandHtml = html.slice(commandOffset, nextCommandOffset >= 0 ? nextCommandOffset : undefined);

    assert.ok(commandOffset >= 0, `${command} should remain one Master command card`);
    assert.match(commandHtml, /Parameter profiles/, `${command} should render the shared profile cards`);
    for (const profileName of profileNames) {
      assert.ok(commandHtml.includes(`>${profileName}<`), `${command} should render the ${profileName} profile`);
    }
  }

  assert.equal(
    [...expectedProfiles.values()].reduce((total, profiles) => total + profiles.length, 0),
    35,
    "the engineering examples should produce 38 profiles without creating more API cards",
  );
});

test("blends the Master motor map into the warm EAIC page palette", () => {
  const html = pages.get("/agentech-products/eaic-hub/view-sdk") ?? "";
  assert.match(
    html,
    /data-master-motor-map-theme="warm-neutral"[^>]*border-\[\#d8d3ca\][^>]*bg-\[\#eeece7\]/,
  );
});

test("matches the Master motor-map title weight and tracking to the SDK tutorial title", () => {
  const html = (pages.get("/agentech-products/eaic-hub/view-sdk") ?? "").replaceAll("<!-- -->", "");
  const motorMapTitle = html.match(/<h2\b[^>]*id="master-motor-map-title"[^>]*>/i)?.[0] ?? "";

  assert.notEqual(motorMapTitle, "", "the Master motor-map title should render");
  assert.match(motorMapTitle, /\btext-3xl\b/);
  assert.match(motorMapTitle, /\bfont-semibold\b/);
  assert.match(motorMapTitle, /\btracking-tight\b/);
  assert.doesNotMatch(motorMapTitle, /\bfont-interface\b/);
  assert.doesNotMatch(motorMapTitle, /\bfont-medium\b/);
});

test("blends the Master motion guide shell into the warm EAIC page palette", () => {
  const html = pages.get("/agentech-products/eaic-hub/view-sdk") ?? "";
  assert.match(
    html,
    /data-master-joint-motion-theme="warm-neutral"[^>]*border-\[\#d8d3ca\][^>]*bg-\[\#eeece7\]/,
  );
});

test("renders Safety Limits with the engineering-yellow hierarchy", () => {
  const html = pages.get("/agentech-products/eaic-hub/view-sdk") ?? "";
  assert.match(
    html,
    /data-safety-limits-theme="engineering-yellow"[^>]*border-\[\#d8d3ca\][^>]*bg-white\/70/,
  );
});

test("keeps Safety Limits and live heartbeat readable on the dark EAIC task canvas", async () => {
  const { html, stylesheet } = await loadPageStylesheet("/agentech-products/eaic-hub/view-sdk");

  assert.match(html, /data-safety-limit-kind="standard"/);
  assert.match(html, /data-master-heartbeat="true"/);
  assert.match(html, /data-master-heartbeat-field="true"/);

  assert.deepEqual(
    darkRuleDeclarations(stylesheet, ["[data-safety-limit-kind=standard]"]),
    {
      "background-color": "#11151b",
      "border-color": "#2a3440",
      color: "#e5edf5",
    },
  );
  assert.deepEqual(
    darkRuleDeclarations(stylesheet, ["[data-master-heartbeat=true]"]),
    {
      "background-color": "#0d1117",
      "border-color": "#2a3440",
      color: "#e5edf5",
    },
  );
  assert.deepEqual(
    darkRuleDeclarations(stylesheet, ["[data-master-heartbeat-field=true]"]),
    {
      "background-color": "#11151b",
      "border-color": "#2a3440",
    },
  );
});

test("keeps Code Certification error and locked states dark and legible", async () => {
  const { html, stylesheet } = await loadPageStylesheet("/agentech-products/eaic-hub/software-check");

  assert.match(html, /data-code-upload-zone="true"[^>]*data-code-upload-state="idle"/);
  assert.match(html, /data-code-review-stage="software-security"/);
  assert.match(html, /data-code-review-schedule-gate="true"/);

  assert.deepEqual(
    darkRuleDeclarations(stylesheet, ["[data-code-upload-zone=true]", "[data-code-upload-state=error]"]),
    {
      "background-color": "#211315",
      "border-color": "#c95e5e",
    },
  );
  assert.deepEqual(
    darkRuleDeclarations(stylesheet, ["[data-code-review-alert=true]"]),
    {
      "background-color": "#241416",
      "border-color": "#ef6b6b",
      color: "#ffb4b4",
    },
  );
  assert.deepEqual(
    darkRuleDeclarations(stylesheet, ["[data-code-review-stage-description=true]"]),
    { color: "#aeb8c2" },
  );
  assert.deepEqual(
    darkRuleDeclarations(stylesheet, ["[data-code-review-schedule-description=true]"]),
    { color: "#aeb8c2" },
  );
});

test("emphasizes the live-gesture completion warning without bookending exclamation marks", () => {
  const html = (pages.get("/agentech-products/eaic-hub/view-sdk") ?? "").replaceAll("<!-- -->", "");
  assert.match(
    html,
    /data-safety-limit-emphasis="completion-verification"[^>]*font-bold[^>]*>Every live gesture waits for completion and verifies stable standing again<\/strong>/,
  );
});

test("highlights the completion warning with the boundary palette while keeping ordinary limits neutral", async () => {
  const { html, stylesheet } = await loadPageStylesheet("/agentech-products/eaic-hub/view-sdk");
  const warning = html.match(/<div\b[^>]*data-safety-limit-kind="completion-verification"[^>]*>/)?.[0] ?? "";

  assert.notEqual(warning, "", "the completion warning should have its own highlighted row");
  assert.match(warning, /border-\[#d1a832\]/);
  assert.match(warning, /bg-\[#fff7d6\]/);
  assert.match(warning, /text-\[#55430a\]/);
  assert.match(warning, /shadow-\[inset_3px_0_0_#c99a00\]/);
  assert.match(warning, /\bpy-2\b(?!\.)/, "the completion row should keep its original vertical padding");
  assert.equal((html.match(/data-safety-limit-kind="standard"/g) ?? []).length, 3);
  assert.doesNotMatch(html, /data-safety-limit-kind="temporary-boundary"/, "the Master completion warning is not a temporary boundary");

  assert.deepEqual(
    darkRuleDeclarations(stylesheet, ["[data-safety-limit-kind=completion-verification]"]),
    {
      "background-color": "#20190a",
      "border-color": "#7a5d1f",
      color: "#f2cf67",
    },
  );
});

test("renders Start Coding with the regenerated transparent Aegis blueprint", () => {
  const html = pages.get(taskRoutes[0][1]) ?? "";
  assert.match(html, /dog-blueprint-transparent-v4\.png/);
  assert.doesNotMatch(html, /dog-blueprint\.png/);
  assert.match(html, /<link rel="preload" as="image"[^>]*dog-blueprint-transparent-v4\.png/, "the above-the-fold robot image should be preloaded");
});

test("distributes the four Starter Rules evenly and centers every label", () => {
  const html = pages.get(taskRoutes[0][1]) ?? "";
  const strip = html.match(/<div\b[^>]*data-eaic-starter-rules="true"[^>]*>/)?.[0] ?? "";
  const rules = html.match(/<div\b[^>]*data-eaic-starter-rule="true"[^>]*>/g) ?? [];

  assert.match(strip, /\bgrid\b/);
  assert.match(strip, /\bmd:grid-cols-4\b/, "tablet and desktop should keep four equal grid tracks");
  assert.equal(rules.length, 4);
  for (const rule of rules) {
    assert.match(rule, /\bmin-w-0\b/);
    assert.match(rule, /\bplace-items-center\b/);
    assert.match(rule, /\btext-center\b/);
  }
});

test("uses only the approved interface and code typefaces in the View SDK documentation region", () => {
  const html = pages.get(taskRoutes[1][1]) ?? "";
  const region = html.match(/<div\b[^>]*data-sdk-documentation-region="true"[^>]*>/)?.[0] ?? "";
  const sourceStart = workbenchSource.indexOf('data-sdk-documentation-region="true"');
  const sourceEnd = workbenchSource.indexOf("function HardwareSimulationMedia", sourceStart);
  const documentationSource = sourceStart >= 0 && sourceEnd > sourceStart
    ? workbenchSource.slice(sourceStart, sourceEnd)
    : "";

  assert.match(region, /\bfont-interface\b/, "the command documentation needs a local Manrope scope");
  assert.notEqual(documentationSource, "", "the scoped documentation source should be found");
  assert.doesNotMatch(documentationSource, /\bfont-display\b/, "the region must not introduce a third display face");
  assert.match(documentationSource, /data-sdk-typeface="interface"/);
  assert.match(documentationSource, /data-sdk-typeface="code"/);
  assert.doesNotMatch(
    documentationSource,
    /font-mono[^>]*>\{group\.items\.length\} functions/,
    "function counts are interface text, not code",
  );
  assert.doesNotMatch(
    documentationSource,
    /place-items-center[^>]*font-mono[^>]*>\{profile\.number/,
    "profile ordinals are counts, not code",
  );
  assert.equal(
    (documentationSource.match(/Choose one profile only/g) ?? []).length,
    1,
    "the renderer copy must remain intact and appear once in source",
  );
  for (const label of ["Definition", "Parameters", "Example"]) {
    assert.match(documentationSource, new RegExp(`>${label}<`), `${label} must remain in the expanded card`);
  }
});

test("cleans Start Coding blueprint ink only in dark mode", async () => {
  const { html, stylesheet } = await loadPageStylesheet(taskRoutes[0][1]);
  const imageTag = [...html.matchAll(/<img\b[^>]*>/g)]
    .map(([tag]) => tag)
    .find((tag) => tag.includes("dog-blueprint-transparent-v4.png"));
  assert.ok(imageTag?.includes('data-eaic-start-blueprint="true"'), "the Start Coding blueprint needs a scoped rendering hook");

  const { filter } = darkRuleDeclarations(stylesheet, [".eaic-task-theme", "[data-eaic-start-blueprint]"]);
  const filterId = filter?.match(/url\(["']?#([^"')]+)["']?\)/)?.[1];
  assert.ok(filterId, "dark mode should apply the clean-linework filter");
  stylesheet.walkRules((rule) => {
    if (!rule.selector.includes("[data-eaic-start-blueprint]")) return;
    assert.match(rule.selector, /\[data-theme=(?:"dark"|dark)\]/, "light mode must keep the original image rendering");
  });

  const filterMarkup = [...html.matchAll(/<filter\b[^>]*>[\s\S]*?<\/filter>/g)]
    .map(([markup]) => markup)
    .find((markup) => markup.includes(`id="${filterId}"`));
  assert.ok(filterMarkup, "the referenced filter must be rendered with the blueprint");

  // Exercise the actual emitted filter with representative source pixels, not
  // duplicated filter constants. Alpha is the visibility on the dark canvas.
  const inks = [
    ["#1d73a2", 1], // Primary robot outline.
    ["#84c1dc", 0.8], // Lighter mechanical detail.
    ["#ffffff", 0.5], // White reflection / extraction residue.
    ["#e4eaef", 0.7], // Near-neutral pale sketch line.
    ["#c6dce8", 0.45], // Subtle blue ground grid.
    ["#1d73a2", 0], // Fully transparent source must stay transparent.
  ];
  const fixture = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="10"><defs>${filterMarkup}</defs><g filter="url(#${filterId})">${inks.map(([color, opacity], index) => `<rect x="${index * 10}" width="10" height="10" fill="${color}" fill-opacity="${opacity}"/>`).join("")}</g></svg>`;
  const { data, info } = await sharp(Buffer.from(fixture)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = (index) => data[(5 * info.width + index * 10 + 5) * info.channels + 3];
  assert.ok(alpha(0) >= 180, "primary blue outlines must stay prominent");
  assert.ok(alpha(1) >= 55, "lighter mechanical detail must remain visible");
  assert.ok(alpha(2) <= 5 && alpha(3) <= 5, "white and gray sketch residue must disappear");
  assert.ok(alpha(4) >= 5 && alpha(4) < alpha(0) * 0.25, "the ground grid should remain faint, below the robot outline");
  assert.equal(alpha(5), 0, "transparent areas must remain transparent");
});

test("renders the EAIC Hub hero with the approved light and dark humanoid illustrations", async () => {
  const response = await fetch(`${baseUrl}/agentech-products/eaic-hub`);
  assert.equal(response.status, 200);
  const html = await response.text();
  const images = [...html.matchAll(/<img\b[^>]*>/g)].map(([tag]) => tag);
  for (const theme of ["light", "dark"]) {
    const image = images.find((tag) => tag.includes(`data-eaic-hero-theme="${theme}"`));
    assert.ok(image, `the ${theme} illustration must be rendered`);
    assert.ok(image.includes(`humanoid-wireframe-${theme}-v1.png`), `${theme} must use the approved image`);
    assert.ok(image.includes("Humanoid robot wireframe"), "the accessible description must match the new subject");
  }
  assert.doesNotMatch(html, /dog-blueprint/);
});

test("keeps the EAIC Hub blueprint linework legible in light mode", async () => {
  const response = await fetch(`${baseUrl}/agentech-products/eaic-hub`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /data-eaic-hero-blueprint="linework"/);

  const stylesheetHrefs = [...html.matchAll(/<link\b[^>]*>/g)]
    .map(([tag]) => ({
      href: tag.match(/\bhref="([^"]+)"/)?.[1],
      rel: tag.match(/\brel="([^"]+)"/)?.[1],
    }))
    .filter(({ href, rel }) => href && rel === "stylesheet")
    .map(({ href }) => href);

  assert.ok(stylesheetHrefs.length > 0, "the Hub should load at least one stylesheet");

  const stylesheets = await Promise.all(
    stylesheetHrefs.map(async (href) => {
      const stylesheetResponse = await fetch(new URL(href, baseUrl));
      assert.equal(stylesheetResponse.status, 200, `${href} should load`);
      return stylesheetResponse.text();
    }),
  );
  const stylesheet = postcss.parse(stylesheets.join("\n"));

  let blueprintFilter = "";
  let blueprintFit = "";
  const themeDisplay = {};
  const mobileOverlays = {};
  let desktopLightOverlay = "";

  stylesheet.walkRules((rule) => {
    const isLightThemeRule = /\[data-theme=(?:"light"|light)\]/.test(rule.selector);

    if (rule.selector.includes("[data-eaic-hero-blueprint]")) {
      blueprintFilter = rule.nodes.find(
        (node) => node.type === "decl" && node.prop === "filter",
      )?.value ?? blueprintFilter;
      blueprintFit = rule.nodes.find(
        (node) => node.type === "decl" && node.prop === "object-fit",
      )?.value ?? blueprintFit;
    }

    for (const theme of ["light", "dark"]) {
      if (rule.selector.includes(`[data-eaic-hero-theme=${theme}]`) || rule.selector.includes(`[data-eaic-hero-theme="${theme}"]`)) {
        const display = rule.nodes.find((node) => node.type === "decl" && node.prop === "display")?.value;
        if (display) themeDisplay[`${isLightThemeRule ? "light" : "default"}:${theme}`] = display;
      }
    }

    if (rule.selector.includes("[data-eaic-hero-overlay]") && rule.parent?.type === "root") {
      const background = rule.nodes.find((node) => node.type === "decl" && node.prop === "background")?.value;
      if (background) mobileOverlays[isLightThemeRule ? "light" : "dark"] = background;
    }

    if (
      isLightThemeRule &&
      rule.selector.includes("[data-eaic-hero-overlay]") &&
      rule.parent?.type === "atrule" &&
      rule.parent.name === "media" &&
      rule.parent.params.includes("min-width")
    ) {
      desktopLightOverlay = rule.nodes.find(
        (node) => node.type === "decl" && node.prop === "background",
      )?.value ?? desktopLightOverlay;
    }
  });

  assert.equal(blueprintFilter, "none", "the restored linework must not be dimmed or recolored");
  assert.equal(blueprintFit, "contain", "the square illustration must retain the head and both hands");
  assert.deepEqual(themeDisplay, {
    "default:light": "none", "default:dark": "block",
    "light:light": "block", "light:dark": "none",
  }, "exactly the matching illustration should be visible for each theme");
  for (const theme of ["light", "dark"]) {
    assert.match(mobileOverlays[theme] ?? "", /transparent 60%/, `${theme} overlay must clear the mobile illustration's head`);
  }

  const lowOpacityStop = [...desktopLightOverlay.matchAll(/rgba\(245,\s*244,\s*241,\s*(0?\.\d+)\)\s*(\d+)%/g)]
    .map((match) => ({ alpha: Number(match[1]), position: Number(match[2]) }))
    .find(({ alpha }) => alpha <= 0.08);
  assert.ok(lowOpacityStop, "the desktop light overlay should expose the blueprint region");
  assert.ok(lowOpacityStop.position <= 64, "the low-opacity overlay stop should begin before the robot center");
});

test("optically aligns both EAIC brand marks with the hero copy", async () => {
  const response = await fetch(`${baseUrl}/agentech-products/eaic-hub`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /data-hero-optical-align="image-mark"/i);
  assert.match(html, /data-eaic-hub-word[^>]*data-hero-optical-align="display-title"/i);
});

test("renders the login hero as a concise two-line editorial headline", async () => {
  const response = await fetch(`${baseUrl}/login`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(
    html,
    /data-login-hero-title="true"[^>]*font-black[^>]*leading-\[0\.86\][^>]*>\s*<span[^>]*>Access the<\/span>\s*<span[^>]*>Agentech Ecosystem<\/span>/,
  );
});

test("renders the login canvas with the shared warm off-white background", async () => {
  const response = await fetch(`${baseUrl}/login`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /data-login-canvas="warm-off-white"[^>]*bg-\[\#f5f4f1\]/);
});
