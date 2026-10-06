import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import test from "node:test";
import postcss from "postcss";
import sharp from "sharp";
import { loadTypeScriptModule } from "./test-utils/load-typescript-module.mjs";

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

const handoffProfiles = JSON.parse(readFileSync(new URL("./fixtures/master-adjustment-handoff-profiles.json", import.meta.url), "utf8"));
const sdkHtml = () => (pages.get("/agentech-products/eaic-hub/view-sdk") ?? "")
  .replaceAll("<!-- -->", "").replaceAll("&quot;", '"').replaceAll("&#x27;", "'");
const sdkCard = (name) => {
  const html = sdkHtml();
  const start = html.indexOf('data-sdk-function-name="' + name + '"');
  assert.ok(start >= 0, name + " must have one card");
  const end = html.indexOf('data-sdk-function-name="', start + 1);
  return html.slice(start, end < 0 ? undefined : end);
};
const plainSdk = (markup) => markup.replace(/<[^>]*>/g, "");
const profileCount = (name) => name === "adjust_waist" ? 34 : name === "adjust_upper_body" ? 4 : name === "stiff" ? 3 : handoffProfiles[name].length;


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

  assert.equal(compactMasterRows.length, 45, "every Master command row should use the leading compact layout");
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

test("lays out the four Master SDK summary metrics in one equal-width desktop row", () => {
  const html = pages.get("/agentech-products/eaic-hub/view-sdk") ?? "";
  assert.match(
    html,
    /data-sdk-overview-grid="true"[^>]*data-sdk-overview-count="4"[^>]*md:grid-cols-4/,
  );
});

test("presents Master SDK groups as joint adjustment, posture, actions, then custom movements", () => {
  const html = (pages.get("/agentech-products/eaic-hub/view-sdk") ?? "").replaceAll("<!-- -->", "");
  const expectedGroups = [
    ["joint-adjustments", "Joint Adjustment Commands"],
    ["sensing", "Posture Commands"],
    ["actions", "Action Commands"],
    ["custom-movements", "Custom Movements"],
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

test("documents all Master APIs in four groups without duplicate function cards", () => {
  const html = sdkHtml();
  const starts = ["joint-adjustments", "sensing", "actions", "custom-movements"].map((group) => html.indexOf('id="function-' + group + '"'));
  assert.ok(starts.every((start, i) => start >= 0 && (i === 0 || start > starts[i - 1])));
  const names = (fragment) => [...fragment.matchAll(/data-sdk-function-name="([^"]+)"/g)].map((match) => match[1]);
  const jointNames = names(html.slice(starts[0], starts[1]));
  const postureNames = names(html.slice(starts[1], starts[2]));
  const actionNames = names(html.slice(starts[2], starts[3]));
  const customNames = names(html.slice(starts[3]));
  assert.deepEqual(jointNames, ["adjust_right_elbow", "adjust_left_elbow", "adjust_both_elbows", "adjust_elbow", "move_elbows_to", "adjust_right_shoulder", "adjust_left_shoulder", "adjust_right_wrist", "adjust_left_wrist", "adjust_wrist", "adjust_waist", "return_waist_to_neutral", "undo_waist", "adjust_upper_body", "move_arms_to", "mirror_arm_pose", "move_mirrored_arms_to", "plan_upper_body_torque_assist"]);
  assert.deepEqual(postureNames, ["enter_stand_hand_guide", "restore_stand_hand_guide", "restore_stand_default", "stiff", "status", "get_status", "action_catalog"]);
  assert.equal(actionNames.length, 18);
  assert.deepEqual(customNames, ["golf_put", "close_door"]);
  assert.equal(new Set([...jointNames, ...postureNames, ...actionNames, ...customNames]).size, 45);
  assert.deepEqual([...html.slice(starts[0], starts[1]).matchAll(/data-master-joint-group="([^"]+)"/g)].map((match) => match[1]), ["Elbows", "Shoulders", "Wrists", "Waist", "Upper Body", "Torque Planning"]);
  for (const [group, count] of [["Joint Adjustments", 18], ["Sensing", 7], ["Actions", 18], ["Custom Movements", 2]]) {
    assert.match(html, new RegExp('data-sdk-overview-category="' + group + '"[^>]*data-sdk-function-count="' + count + '"'));
  }
  assert.ok(html.includes('from agentech import Agentech\nAgentech.use("master")'));
  assert.doesNotMatch(html, /data-sdk-setup-param="standing_elbow_torque_limit_nm"/);
  assert.doesNotMatch(html, /data-sdk-function-name="standing_actions\.teach"/);
});

test("lists Golf and Close Door once under Custom Movements with current SDK calls", () => {
  const html = sdkHtml();
  const section = html.slice(html.indexOf('id="function-custom-movements"'));
  for (const name of ["golf_put", "close_door"]) {
    assert.equal([...html.matchAll(new RegExp('data-sdk-function-name="' + name + '"', 'g'))].length, 1, name);
    assert.ok(section.includes('data-sdk-function-name="' + name + '"'));
  }
  assert.doesNotMatch(html, /data-sdk-function-name="(?:door_close|putting)"/);
  const golf = sdkCard("golf_put");
  assert.match(plainSdk(golf), /Golf/);
  assert.match(plainSdk(golf), /operator_ready=True/);
  assert.match(plainSdk(golf), /mechanically_supported=True/);
  assert.doesNotMatch(golf, /include_stroke/, "do not expose a parameter absent from the published SDK");
  const door = sdkCard("close_door");
  assert.match(plainSdk(door), /Agentech\.close_door\("right"\)/);
  assert.match(plainSdk(door), /Agentech\.close_door\("left"\)/);
  for (const name of ["arm_duration_seconds", "waist_max_duration_seconds"]) {
    assert.ok(door.includes('data-sdk-param-name="' + name + '"'));
    assert.ok(golf.includes('data-sdk-param-name="' + name + '"'));
  }
});

test("presents all waist axes, timeout and checked-start profiles without fake keyword rows", () => {
  const card = sdkCard("adjust_waist");
  assert.deepEqual([...card.matchAll(/data-sdk-param-name="([^"]+)"/g)].map((match) => match[1]), ["axis", "degrees", "yaw", "pitch", "roll", "max_duration_seconds", "expected_start_degrees", "torque"]);
  assert.equal([...card.matchAll(/data-sdk-profile-syntax="true"/g)].length, 34);
  assert.equal([...card.matchAll(/>Custom maximum duration</g)].length, 17);
  assert.match(plainSdk(card), /dry-run does not validate/);
  assert.ok(card.includes("Agentech.adjust_waist(yaw=5, pitch=-3, max_duration_seconds=8.0)"));
});

test("shows full upper-body mappings with four concise profiles", () => {
  const card = sdkCard("adjust_upper_body");
  assert.deepEqual([...card.matchAll(/data-sdk-param-name="([^"]+)"/g)].map((match) => match[1]), ["waist", "right_arm", "left_arm", "both_elbows", "duration_seconds", "torque"]);
  assert.equal([...card.matchAll(/data-sdk-profile-number="true"/g)].length, 4);
  assert.equal([...card.matchAll(/data-sdk-profile-syntax="true"/g)].length, 4);
  assert.doesNotMatch(plainSdk(card), /\bInternal\b|\bProposed\b|Needs integration/i);
  assert.match(plainSdk(card), /Any subset of arm joints/);
  assert.match(plainSdk(card), /shoulder_pitch.*shoulder_roll.*shoulder_yaw.*elbow.*wrist_yaw.*wrist_pitch.*wrist_roll/);
  assert.match(plainSdk(card), /Nonzero waist torque has no live receiver/);
  const profiles = [...card.matchAll(/data-sdk-profile-syntax="true"[^>]*>([\s\S]*?)<\/p>/g)].map(([, markup]) => plainSdk(markup));
  assert.ok(profiles.every((syntax) => !/torque=\{\s*"waist"/.test(syntax)), "coordinated profiles assign torque only to supported arm receivers");
  assert.doesNotMatch(card, /axis: x|degrees = x|both_elbows = degrees/);
  assert.match(plainSdk(card), /"right_arm": \{"shoulder_pitch": 20\}/);
  assert.match(plainSdk(card), /"left_arm": \{"wrist_yaw": 20\}/);
});

test("renders all eleven forms and actual named-axis keywords for each wrist function", () => {
  for (const name of ["adjust_right_wrist", "adjust_left_wrist", "adjust_wrist"]) {
    const card = sdkCard(name);
    assert.deepEqual([...card.matchAll(/data-sdk-param-name="([^"]+)"/g)].map((match) => match[1]), ["axis", "degrees", "roll", "pitch", "yaw", "torque"]);
    assert.equal([...card.matchAll(/data-sdk-profile-syntax="true"/g)].length, 11);
    assert.doesNotMatch(card, /data-sdk-profile-variant="custom-duration"/);
  }
  assert.match(plainSdk(sdkCard("adjust_wrist")), /Right-wrist compatibility alias/);
});

test("shows numeric relative angle ranges in every Master adjustment parameter row", () => {
  const relativeFields = {
    adjust_right_elbow: ["degrees"], adjust_left_elbow: ["degrees"],
    adjust_both_elbows: ["degrees"], adjust_elbow: ["degrees", "position"],
    adjust_right_shoulder: ["degrees"], adjust_left_shoulder: ["degrees"],
    adjust_right_wrist: ["degrees", "roll", "pitch", "yaw"],
    adjust_left_wrist: ["degrees", "roll", "pitch", "yaw"],
    adjust_wrist: ["degrees", "roll", "pitch", "yaw"],
    adjust_waist: ["degrees", "yaw", "pitch", "roll"],
    adjust_upper_body: ["waist", "both_elbows"],
  };
  for (const [name, fields] of Object.entries(relativeFields)) {
    for (const field of fields) {
      const row = sdkCard(name).match(new RegExp('<details data-sdk-param-name="' + field + '"[\\s\\S]*?<\\/details>'))?.[0] ?? "";
      const summary = row.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1] ?? "";
      assert.match(plainSdk(summary), /Range: .*\d(?:\.\d+)? − current/, `${name}.${field}: numeric bounds are visible with Details closed`);
      assert.doesNotMatch(plainSdk(summary), /Dynamic/, `${name}.${field}: no vague range label`);
      assert.match(plainSdk(row), /Example.*°.*range.*°/i, `${name}.${field}: gives a concrete remaining-range example`);
    }
  }
});

test("documents every partial arm selection using actual mapping fields and one zero-target note", () => {
  const card = sdkCard("move_arms_to");
  assert.deepEqual([...card.matchAll(/data-sdk-param-name="([^"]+)"/g)].map((match) => match[1]), ["left", "right", "duration_seconds"]);
  assert.equal([...card.matchAll(/data-sdk-profile-syntax="true"/g)].length, 56);
  assert.equal([...card.matchAll(/data-sdk-joint-target-note="true"/g)].length, 1);
  assert.match(plainSdk(card), /Omitted joints keep their current commanded positions/);
  assert.match(plainSdk(card), /Set a joint to 0 explicitly/);
  assert.match(plainSdk(card), /elbow domain excludes zero/);
  for (const field of ["left", "right"]) {
    const parameter = card.match(new RegExp('<details data-sdk-param-name="' + field + '"[\\s\\S]*?</details>'))?.[0] ?? "";
    for (const key of ["shoulder_pitch", "shoulder_roll", "shoulder_yaw", "elbow", "wrist_yaw", "wrist_pitch", "wrist_roll"]) assert.ok(parameter.includes('"' + key + '"'));
    assert.match(plainSdk(parameter), /Any nonempty subset/);
  }
});

test("requires all seven mirrored targets and describes the complete target mapping", () => {
  const card = sdkCard("move_mirrored_arms_to");
  assert.match(plainSdk(card), /All seven joint targets are required/);
  assert.match(plainSdk(card), /A missing joint causes an error/);
  assert.match(plainSdk(card), /elbow domain excludes zero/);
  assert.match(plainSdk(card), /Use move_arms_to\(\) for partial joint targets/);
  assert.deepEqual([...card.matchAll(/data-sdk-param-name="([^"]+)"/g)].map((match) => match[1]), ["targets", "duration_seconds"]);
  for (const key of ["shoulder_pitch", "shoulder_roll", "shoulder_yaw", "elbow", "wrist_yaw", "wrist_pitch", "wrist_roll"]) assert.ok(card.includes('"' + key + '"'));
});

test("lists both mirror_arm_pose source-side strings in the parameter type", () => {
  const html = (pages.get("/agentech-products/eaic-hub/view-sdk") ?? "").replaceAll("<!-- -->", "").replaceAll("&quot;", '"');
  const start = html.indexOf('data-sdk-function-name="mirror_arm_pose"');
  const end = html.indexOf('data-sdk-function-name="move_mirrored_arms_to"', start);
  const card = html.slice(start, end);
  assert.match(card, />source_side<\/span><span[^>]*>string \("left", "right"\)<\/span>/);
});

test("keeps runnable setup examples free of dry-run configuration and private connection fields", () => {
  for (const [route, html] of pages) {
    for (const [, example] of html.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/g)) assert.doesNotMatch(plainSdk(example), /dry_run\s*=|ssh_password|host\s*=/i, route);
    assert.doesNotMatch(html, /ssh_password/i);
  }
});

test("renders valid Python for every profile map and every copyable Master example", () => {
  const html = sdkHtml();
  const jointHtml = html.slice(html.indexOf('id="function-joint-adjustments"'), html.indexOf('id="function-sensing"'));
  const profiles = [...html.matchAll(/data-sdk-profile-syntax="true"[^>]*>([\s\S]*?)<\/p>/g)].map(([, markup]) => plainSdk(markup));
  const examples = [...html.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/g)].map(([, markup]) => plainSdk(markup));
  assert.equal([...jointHtml.matchAll(/data-sdk-profile-syntax="true"/g)].length, 223);
  assert.ok(profiles.length >= 239, "validate custom movement profiles as well as existing profiles");
  assert.equal(examples.length, 46);
  const python = spawnSync(process.env.PYTHON_BINARY ?? "python", ["-c", "import ast,json,sys\nfor source in json.load(sys.stdin): ast.parse(source)"], { input: JSON.stringify([...profiles, ...examples]), encoding: "utf8" });
  assert.ifError(python.error);
  assert.equal(python.status, 0, python.stderr);
  for (const syntax of profiles) assert.doesNotMatch(syntax, /,\s*[)}]|degrees = x|axis: x/);
  assert.match(workbenchSource, /\[overflow-wrap:anywhere\]/);
});

test("preserves existing duration pricing while distinguishing torque, speed, timeouts and proposed stiffness", () => {
  const elbow = plainSdk(sdkCard("adjust_left_elbow"));
  assert.match(elbow, /default timing/);
  assert.match(elbow, /Custom duration may require an extra fee or a higher-tier plan/);
  const waist = plainSdk(sdkCard("adjust_waist"));
  assert.match(waist, /Custom maximum duration/);
  assert.match(waist, /timeout, not a speed setting/);
  const stiff = plainSdk(sdkCard("stiff"));
  assert.equal([...sdkCard("stiff").matchAll(/data-sdk-profile-syntax="true"/g)].length, 3);
  for (const level of ["hard", "medium", "soft"]) assert.ok(stiff.includes('Agentech.stiff(level="' + level + '")'));
  assert.doesNotMatch(stiff, /Pricing TBD|extra fee|higher-tier plan/);
  assert.equal([...sdkCard("stiff").matchAll(/>Under Development|>Internal</g)].length, 0);
  assert.deepEqual([...sdkCard("stiff").matchAll(/data-sdk-param-name="([^"]+)"/g)].map((match) => match[1]), ["level"]);
  assert.doesNotMatch(stiff, /operator_ready|mechanically_supported|preflight|boolean/);
  for (const name of ["speed", "torque"]) {
    const row = sdkCard("adjust_elbow").match(new RegExp('<details data-sdk-param-name="' + name + '"[\\s\\S]*?</details>'))?.[0] ?? "";
    assert.ok(row);
    assert.doesNotMatch(row, /Pricing TBD/);
  }
  assert.match(sdkHtml(), /Using code to run robot or Navi performances on this website requires payment/);
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

test("renders every handoff request family in numbered cards using the existing format", () => {
  for (const name of Object.keys(handoffProfiles).filter((name) => !["turn_head", "return_head_to_center", "center_head", "shake_head"].includes(name))) {
    const card = sdkCard(name);
    assert.match(card, /Parameter profiles/);
    assert.match(card, /Choose one profile only/);
    assert.equal([...card.matchAll(/data-sdk-profile-syntax="true"/g)].length, profileCount(name), name);
    const numbers = [...card.matchAll(/data-sdk-profile-number="true"[^>]*>(\d+)<\/span>/g)].map(([, number]) => Number(number));
    assert.deepEqual(numbers, Array.from({ length: profileCount(name) }, (_, index) => index + 1), name);
    assert.match(card, />Example</);
    assert.match(card, /Copy/);
  }
});

test("numbers each duration companion immediately after its default profile", () => {
  for (const name of ["adjust_right_elbow", "adjust_left_elbow", "move_arms_to", "move_mirrored_arms_to"]) {
    const card = sdkCard(name);
    const numbers = [...card.matchAll(/data-sdk-profile-number="true"[^>]*>(\d+)<\/span>/g)].map(([, number]) => Number(number));
    assert.deepEqual(numbers, Array.from({ length: profileCount(name) }, (_, index) => index + 1));
    const variants = [...card.matchAll(/<div[^>]*data-sdk-profile-variant="custom-duration"[^>]*>/g)];
    assert.ok(variants.length);
    for (const [tag] of variants) assert.doesNotMatch(tag, /\bborder-t\b/);
  }
});

test("uses the shared purple x convention for every Master profile with quoted joint mapping keys", () => {
  const html = sdkHtml();
  const profiles = [...html.matchAll(/data-sdk-profile-syntax="true"[^>]*>([\s\S]*?)<\/p>/g)].map(([, markup]) => markup);
  assert.ok(profiles.length > 200);
  for (const markup of profiles) {
    assert.doesNotMatch(plainSdk(markup), /\b(?:delta|target|duration|max_duration|[a-z_]+_(?:delta|deltas|target|targets|start))\b/);
    if (/\bx\b/.test(plainSdk(markup))) assert.match(markup, /data-sdk-profile-placeholder="true"[^>]*text-\[\#4c1d95\][^>]*>x<\/span>/);
  }
  const arms = sdkCard("move_arms_to");
  assert.match(plainSdk(arms), /"elbow": x/);
  assert.match(plainSdk(arms), /Angle maps contain degrees; torque maps contain N·m/);
  for (const name of ["adjust_right_elbow", "adjust_left_elbow", "adjust_elbow"]) {
    const card = sdkCard(name);
    assert.match(plainSdk(card), /degrees=x/);
    assert.ok(plainSdk(card).includes("-24 to +24"), `${name}: native joint range stays in the torque table`);
  }
});

test("capitalizes Degrees in every profile label and sentence opening", () => {
  const html = sdkHtml();
  const labels = [...html.matchAll(/data-sdk-profile-label="true"[^>]*>([\s\S]*?)<\/span>/g)].map(([, markup]) => plainSdk(markup));
  assert.ok(labels.length > 200, "all default and duration profile headings use the shared display label");
  assert.ok(labels.some((label) => /Right \/ Degrees \//.test(label)));
  for (const label of labels) assert.doesNotMatch(label, /\bdegrees\b/);
  const descriptions = [...html.matchAll(/data-sdk-profile-description="true"[^>]*>([\s\S]*?)<\/p>/g)].map(([, markup]) => plainSdk(markup));
  for (const description of descriptions) assert.doesNotMatch(description, /^degrees\b|[.!?]\s+degrees\b/);
  assert.ok(descriptions.some((description) => /^Degrees is a signed relative angle\./.test(description)));
  assert.match(plainSdk(sdkCard("adjust_elbow")), /degrees=x/, "actual Python parameter names stay lowercase");
  assert.match(plainSdk(sdkCard("adjust_elbow")), /abs\(degrees\) \/ speed/, "Python expressions stay lowercase");
});

test("highlights every profile's selected values in the same purple as x", () => {
  const html = sdkHtml();
  const profiles = [...html.matchAll(/data-sdk-profile-syntax="true"[^>]*>([\s\S]*?)<\/p>/g)].map(([, markup]) => markup);
  assert.ok(profiles.length > 200);
  let valueCount = 0;
  for (const markup of profiles) {
    const syntax = plainSdk(markup);
    const values = [...syntax.matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:True|False|None)\b/g)]
      .filter((match) => !/^\s*:/.test(syntax.slice(match.index + match[0].length)))
      .map(([value]) => value);
    const highlighted = [...markup.matchAll(/<span[^>]*data-sdk-profile-value="true"[^>]*>([\s\S]*?)<\/span>/g)];
    assert.deepEqual(highlighted.map(([, value]) => value), values, syntax);
    for (const [span] of highlighted) assert.match(span, /text-\[\#4c1d95\]/);
    valueCount += values.length;
  }
  assert.ok(valueCount > 50, "every side, axis, level and other selected literal is covered");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\[data-sdk-profile-placeholder="true"\][\s\S]*?\[data-sdk-profile-value="true"\][\s\S]*?color:\s*#c4b5fd/, "values share x's dark-theme color");
});

test("lists each native joint maximum effort in a compact two-column torque table", () => {
  const html = sdkHtml();
  const expected = JSON.parse(readFileSync(new URL("./fixtures/master-native-model-effort.json", import.meta.url), "utf8"));
  for (const [joint, effort] of Object.entries(expected.maxEffortNm)) {
    assert.match(html, new RegExp('data-sdk-joint-effort="' + joint + '"[^>]*data-sdk-native-max-effort-nm="' + effort + '"'));
    assert.match(plainSdk(html), new RegExp('-' + effort + ' to \\+' + effort));
  }
  assert.match(html, /data-sdk-joint-torque-reference="true"/);
  assert.match(plainSdk(html), /Native model torque limit/);
});

test("uses the multiplication dot in every displayed torque unit", () => {
  assert.match(plainSdk(sdkHtml()), /\(Range: -24 to \+24 N·m\)/);
  assert.doesNotMatch(plainSdk(sdkHtml()), /N[.]m/, "parameter rows, tables, profiles and examples use N·m");
});

test("omits None from public Master parameter types and explains each stiffness profile", () => {
  for (const [, summary] of sdkHtml().matchAll(/<details data-sdk-param-name="[^"]+"[\s\S]*?<summary[^>]*>([\s\S]*?)<\/summary>/g)) {
    assert.doesNotMatch(plainSdk(summary), /\bNone\b/, "public parameter types show the values users enter");
  }
  const profiles = [...sdkCard("stiff").matchAll(/<p data-sdk-profile-description="true"[^>]*>([\s\S]*?)<\/p>/g)].map(([, profile]) => plainSdk(profile));
  assert.equal(profiles.length, 3);
  assert.match(profiles[0], /stiffness.*100.*50.*30.*N·m\/rad/i);
  assert.match(profiles[1], /same.*Hard.*not an intermediate/i);
  assert.match(profiles[2], /compliant.*12 N·m\/rad.*returns.*arms.*waist/i);
});

test("shows each parameter's allowed values only once", () => {
  let choiceRows = 0;
  for (const [, markup] of sdkHtml().matchAll(/<details data-sdk-param-name="[^"]+"[\s\S]*?<summary[^>]*>([\s\S]*?)<\/summary>/g)) {
    const values = markup.match(/data-sdk-param-allowed-values="true"[^>]*>([\s\S]*?)<\/span>/)?.[1];
    if (!values) continue;
    choiceRows += 1;
    assert.doesNotMatch(plainSdk(markup), /string\s*\(/, "type labels do not repeat an explicit allowed-values list");
    for (const [, value] of markup.matchAll(/<code[^>]*>([\s\S]*?)<\/code>/g)) {
      assert.equal(plainSdk(markup).split(plainSdk(value)).length - 1, 1, value + " appears once in its parameter heading");
    }
  }
  assert.ok(choiceRows >= 2, "the shared row rule covers stiffness and hand guidance");
  const level = sdkCard("stiff").match(/<details data-sdk-param-name="level"[\s\S]*?<\/summary>/)?.[0] ?? "";
  assert.match(plainSdk(level), /levelstringAllowed values:.*"soft".*"medium".*"hard"/);
});

test("keeps every parameter header and its controls together above the range", () => {
  const summaries = [...sdkHtml().matchAll(/<details data-sdk-param-name="[^"]+"[\s\S]*?<summary[^>]*>([\s\S]*?)<\/summary>/g)].map(([, markup]) => markup);
  assert.ok(summaries.length > 60);
  for (const summary of summaries) {
    assert.match(summary, /data-sdk-param-header="true"/, "name, type and default share a header");
    const controls = summary.match(/<span data-sdk-param-controls="true"[\s\S]*?<\/span>\s*<\/span>/)?.[0] ?? "";
    assert.match(controls, /data-sdk-param-toggle="true"/, "Details stays with its status control");
    if (summary.includes('data-sdk-param-available="true"')) assert.ok(controls.includes('data-sdk-param-available="true"'));
  }
});

test("shows multi-axis ranges in separate labeled rows without losing numerical limits", () => {
  const waist = sdkCard("adjust_upper_body").match(/<details data-sdk-param-name="waist"[\s\S]*?<\/summary>/)?.[0] ?? "";
  assert.deepEqual([...waist.matchAll(/data-sdk-param-range-axis="([^"]+)"/g)].map(([, axis]) => axis), ["Yaw", "Pitch", "Roll"]);
  assert.match(plainSdk(waist), /Range:.*Yaw:.*-196\.525 − current.*136\.479 − current.*Pitch:.*max\(-30, -17\.991 − current\).*Roll:.*max\(-15, -27\.96 − current\)/);
  for (const name of ["adjust_right_shoulder", "adjust_left_shoulder", "adjust_right_wrist", "adjust_left_wrist", "adjust_wrist"]) {
    const degrees = sdkCard(name).match(/<details data-sdk-param-name="degrees"[\s\S]*?<\/summary>/)?.[0] ?? "";
    assert.equal([...degrees.matchAll(/data-sdk-param-range-axis="/g)].length, 3, name);
  }
  assert.match(plainSdk(sdkCard("adjust_right_elbow")), /\(Range: -24 to \+24 N·m\)/, "simple torque ranges remain explicit");
});

test("shows elbow torque ranges directly in parameter summaries without legacy wording", () => {
  assert.ok(!/\blegacy\b/i.test(plainSdk(sdkHtml())), "public SDK preview has no legacy labels");
  for (const name of ["adjust_right_elbow", "adjust_left_elbow", "adjust_elbow"]) {
    const row = sdkCard(name).match(/<details data-sdk-param-name="torque"[\s\S]*?<\/details>/)?.[0] ?? "";
    const summary = row.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)?.[1] ?? "";
    assert.ok(summary && plainSdk(summary).includes("torque"), `${name}: torque parameter remains visible`);
    assert.match(summary, /data-sdk-param-range="true"/, `${name}: range is visible before opening Details`);
    assert.match(plainSdk(summary), /Range: -24 to \+24 N·m/, `${name}: shows the current signed elbow range`);
    assert.match(plainSdk(summary), /number/, `${name}: summary retains its numeric type`);
    assert.doesNotMatch(plainSdk(summary), /\bNone\b/, `${name}: omit Python's null spelling from the displayed type`);
    assert.doesNotMatch(summary, /data-sdk-param-available=|>Available</, `${name}: torque summary has no status badge`);
    assert.ok(/-24 to \+24 N·m/.test(plainSdk(row)), `${name}: expanded details show the current elbow request ceiling`);
    assert.doesNotMatch(plainSdk(row), /-2 to \+2 N·m/, `${name}: no stale blanket live cap`);
  }
});

test("renders only native model ranges in every joint torque table", () => {
  const html = sdkHtml();
  const global = html.match(/<details data-sdk-joint-torque-reference="true"[\s\S]*?<\/details>/)?.[0] ?? "";
  const sections = [...html.matchAll(/<section data-sdk-function-joint-torque="[^"]+"[\s\S]*?<\/section>/g)].map(([section]) => section);
  assert.ok(global && sections.length >= 18, "global and per-function joint references stay visible");
  for (const section of [global, ...sections]) {
    const table = section.match(/<table\b[\s\S]*?<\/table>/)?.[0] ?? "";
    assert.equal([...table.matchAll(/<th\b/g)].length, 2, "joint torque table has exactly two column headings");
    for (const [, row] of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
      if (/<td\b/.test(row)) assert.equal([...row.matchAll(/<td\b/g)].length, 2, "joint torque data row has exactly two cells");
    }
    assert.ok(!/wrapper|argument|added effort|additional torque|admitted allowance/i.test(plainSdk(table)), "table only compares joint identity and native range");
  }
});

test("shows torque variables without status badges in the eight existing adjustment cards", () => {
  const { masterDocumentationFunctions } = loadTypeScriptModule("features/eaic/01-clients/eaic-hub/contracts/master-sdk-documentation.ts");
  const expected = {
    adjust_both_elbows: ["degrees", "duration_seconds"],
    adjust_right_shoulder: ["axis", "degrees", "duration_seconds"],
    adjust_left_shoulder: ["axis", "degrees", "duration_seconds"],
    adjust_right_wrist: ["axis", "degrees", "roll", "pitch", "yaw"],
    adjust_left_wrist: ["axis", "degrees", "roll", "pitch", "yaw"],
    adjust_wrist: ["axis", "degrees", "roll", "pitch", "yaw"],
    adjust_waist: ["axis", "degrees", "yaw", "pitch", "roll", "max_duration_seconds", "expected_start_degrees"],
    adjust_upper_body: ["waist", "right_arm", "left_arm", "both_elbows", "duration_seconds"],
  };
  for (const [name, params] of Object.entries(expected)) {
    const card = sdkCard(name);
    const functionSummary = card.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)?.[1] ?? "";
    const controls = functionSummary.match(/data-sdk-function-controls="true"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
    assert.equal(plainSdk(controls).trim().toLowerCase(), "details", `${name}: function header has only its disclosure control`);
    assert.doesNotMatch(plainSdk(card), /\bInternal\b|\bProposed\b|Needs integration|Under development/i, `${name}: torque card has no status wording`);
    assert.deepEqual([...card.matchAll(/data-sdk-param-name="([^"]+)"/g)].map(([, param]) => param), [...params, "torque"], `${name}: retains current parameters and torque`);
    const torque = card.match(/<details data-sdk-param-name="torque"[\s\S]*?<\/details>/)?.[0] ?? "";
    assert.ok(torque, `${name}: torque input remains visible`);
    const profiles = [...card.matchAll(/data-sdk-profile-syntax="true"[^>]*>([\s\S]*?)<\/p>/g)].map(([, markup]) => plainSdk(markup));
    assert.equal(profiles.length, profileCount(name), `${name}: existing form count is preserved`);
    for (const syntax of profiles) assert.ok(name === "adjust_waist" ? !/\btorque\s*=/.test(syntax) : /\btorque\s*=\s*(?:x|\{)/.test(syntax), `${name}: profiles expose the supported running arguments`);
    const profileHeaders = [...card.matchAll(/<div data-sdk-profile-card="true"[\s\S]*?<p data-sdk-typeface="code"/g)].map(([header]) => header);
    assert.equal(profileHeaders.length, profiles.length, `${name}: every rendered form has one card`);
    for (const header of profileHeaders) assert.equal([...header.matchAll(/<span\b/g)].length, 2, `${name}: profile header has its number and label only`);
    const examples = [...card.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/g)].map(([, markup]) => plainSdk(markup));
    assert.deepEqual(examples, [masterDocumentationFunctions.find((item) => item.name === name).example], `${name}: current movement example stays unchanged`);
  }
});

test("renders every Master torque range in its parameter summary without a status badge", () => {
  const rows = [...sdkHtml().matchAll(/<details data-sdk-param-name="torque"[\s\S]*?<\/details>/g)].map(([row]) => row);
  assert.equal(rows.length, 11, "all existing and added torque fields remain visible");
  for (const row of rows) {
    const summary = row.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)?.[1] ?? "";
    const toggle = summary.indexOf('<span data-sdk-param-toggle="true"');
    assert.ok(toggle >= 0, "torque keeps its details control");
    assert.match(summary.slice(0, toggle), /data-sdk-param-range="true"/, "torque range is visible before the details control");
    assert.doesNotMatch(summary, /data-sdk-param-available=/, "torque keeps its compact row without a status badge");
    assert.doesNotMatch(plainSdk(row), /\bInternal\b|\bProposed\b|Needs integration|Under development/i);
  }
  assert.match(sdkHtml(), /data-sdk-param-available="true"/, "other parameter status badges stay visible");
  for (const name of ["adjust_right_shoulder", "adjust_left_shoulder", "adjust_both_elbows", "adjust_upper_body"]) {
    const summary = sdkCard(name).match(/<details data-sdk-param-name="torque"[\s\S]*?<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1] ?? "";
    assert.match(plainSdk(summary), name === "adjust_upper_body" ? /Shoulder, elbow, wrist yaw: -24 to \+24 N·m.*Wrist pitch\/roll: -2\.2 to \+2\.2 N·m/ : /Range: -24 to \+24 N·m/, `${name}: signed range stays visible`);
  }
  for (const name of ["adjust_right_wrist", "adjust_left_wrist", "adjust_wrist"]) {
    const summary = sdkCard(name).match(/<details data-sdk-param-name="torque"[\s\S]*?<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1] ?? "";
    assert.match(plainSdk(summary), /Yaw: -24 to \+24; pitch\/roll: -2\.2 to \+2\.2 N·m/, `${name}: each axis retains its range`);
  }
});

test("shows all-joint torque planning and twenty-newton-metre capability with correct map units", () => {
  const card = sdkCard("plan_upper_body_torque_assist");
  const text = plainSdk(card);
  assert.equal([...card.matchAll(/data-sdk-profile-syntax="true"/g)].length, 22);
  assert.deepEqual([...card.matchAll(/data-sdk-param-name="([^"]+)"/g)].map((match) => match[1]), ["arm_effort_nm", "waist_effort_nm", "max_additional_effort_nm", "duration_seconds", "ramp_seconds", "limit_source"]);
  assert.equal([...card.matchAll(/data-sdk-function-torque-joint=/g)].length, 17);
  assert.match(text, /20 N·m requests were checked offline/);
  assert.match(text, /Effort-map values are signed N·m/);
  assert.match(text, /bound-map values are positive N·m/);
  assert.doesNotMatch(text, /its x value is degrees|extra fee|higher-tier plan/);
  assert.match(text, /"left_elbow_joint": 20/);
  for (const name of ["adjust_left_shoulder", "adjust_right_shoulder", "adjust_left_wrist", "adjust_right_wrist", "adjust_waist"]) {
    assert.match(sdkCard(name), /data-sdk-function-joint-torque=/);
  }
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
  assert.equal((html.match(/data-safety-limit-kind="standard"/g) ?? []).length, 2);
  assert.equal((html.match(/data-safety-limit-kind="completion-verification"/g) ?? []).length, 1);
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
