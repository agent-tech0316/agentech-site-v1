import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const origin = process.env.EAIS_PERSISTENCE_ORIGIN ?? "http://127.0.0.1:3031";
const artifacts = path.resolve(process.env.EAIS_PERSISTENCE_ARTIFACTS ?? ".codex-artifacts/eais-persistence/browser");
const executablePath = process.env.EAIS_PERSISTENCE_BROWSER ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sessionSecret = process.env.AGENTECH_SESSION_SECRET ?? "eais-persistence-browser-test-only-secret";
const owner = {
  userId: "8f138742-102c-4bc7-a4d7-b86dbe9b4252",
  email: "eais-persistence-browser@example.invalid"
};
const coverUrl = `${origin}/assets/eais-showcase/sort-at-sight-concept-v1.png`;

function signedSession(overrides = {}) {
  const payload = Buffer.from(JSON.stringify({
    version: 2,
    ...owner,
    expiresAt: Date.now() + 10 * 60 * 1000,
    ...overrides
  })).toString("base64url");
  return `${payload}.${createHmac("sha256", sessionSecret).update(payload).digest("base64url")}`;
}

function fixtureProject(input) {
  return {
    id: input.id,
    owner_user_id: owner.userId,
    title: input.title,
    category: input.category,
    description: input.description,
    cover_object_path: `${owner.userId}/${input.id}/fixture/cover.png`,
    coverUrl,
    draft: {},
    progress: {},
    revision: input.revision ?? 1,
    created_at: "2026-09-11T00:00:00.000Z",
    updated_at: "2026-09-11T00:00:00.000Z",
    deleted_at: null
  };
}

await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath });
const summary = {
  publicDiscovery: false,
  unsignedGate: false,
  legacyCookieRejected: false,
  stableSessionAccepted: false,
  restoredAfterReload: false,
  privateCreate: false,
  idempotentDeleteSurface: false,
  apiRequests: [],
  errors: []
};

try {
  const publicContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const publicPage = await publicContext.newPage();
  const discovery = await publicPage.goto(`${origin}/agentech-products/eais`, { waitUntil: "networkidle" });
  assert.equal(discovery?.status(), 200);
  await publicPage.locator("[data-eais-public-page]").waitFor();
  assert.ok(await publicPage.locator("[data-eais-work-card]").count());
  summary.publicDiscovery = true;

  await publicPage.goto(`${origin}/account/my-works`, { waitUntil: "networkidle" });
  await publicPage.locator("[data-my-works-access-gate]").waitFor();
  summary.unsignedGate = true;

  await publicContext.addCookies([{
    name: "agentech_account_email",
    value: encodeURIComponent(owner.email),
    url: origin,
    sameSite: "Lax"
  }]);
  await publicPage.reload({ waitUntil: "networkidle" });
  await publicPage.locator("[data-my-works-access-gate]").waitFor();
  summary.legacyCookieRejected = true;
  await publicContext.close();

  const projects = [fixtureProject({
    id: "b44cbb4a-caa4-4448-8a94-34f213f540e8",
    title: "Restored private robot",
    category: "Humanoid",
    description: "Loaded from the private project API."
  })];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  await context.addCookies([{
    name: "agentech_account_session",
    value: signedSession(),
    url: origin,
    httpOnly: true,
    sameSite: "Lax"
  }]);
  const page = await context.newPage();
  page.on("pageerror", (error) => summary.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") summary.errors.push(message.text());
  });
  await page.route("**/api/eais/projects**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    summary.apiRequests.push(`${request.method()} ${url.pathname}`);

    if (request.method() === "GET" && url.pathname === "/api/eais/projects") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, projects }) });
    }
    if (request.method() === "POST" && url.pathname === "/api/eais/projects") {
      assert.match(request.headers()["content-type"] ?? "", /^multipart\/form-data; boundary=/);
      const project = fixtureProject({
        id: "f09fe339-02a9-4d8a-90a6-250dccd5dcb3",
        title: "Saved across sessions",
        category: "Robot arm",
        description: "A private browser-verified project."
      });
      projects.unshift(project);
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true, project, replayed: false }) });
    }
    if (request.method() === "DELETE" && url.pathname.startsWith("/api/eais/projects/")) {
      const id = decodeURIComponent(url.pathname.split("/").at(-1));
      const index = projects.findIndex((project) => project.id === id);
      assert.notEqual(index, -1);
      projects.splice(index, 1);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, replayed: false }) });
    }
    return route.abort("failed");
  });

  const response = await page.goto(`${origin}/account/my-works`, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200);
  await page.getByText("Restored private robot", { exact: true }).waitFor();
  assert.match(await page.locator("[data-my-works-page]").innerText(), /Saved privately to your account/);
  assert.equal(await page.locator("[data-my-works-access-gate]").count(), 0);
  summary.stableSessionAccepted = true;
  await page.screenshot({ path: path.join(artifacts, "01-restored-private-project.png"), fullPage: true });

  await page.locator("[data-my-works-add]").click();
  const cover = await readFile(path.resolve("public/assets/eais-showcase/sort-at-sight-concept-v1.png"));
  await page.locator('[data-my-works-form] input[type="file"]').setInputFiles({
    name: "private-project-cover.png",
    mimeType: "image/png",
    buffer: cover
  });
  await page.locator('img[alt="Selected cover preview"]').waitFor();
  await page.getByLabel("Project title", { exact: false }).fill("Saved across sessions");
  await page.getByLabel("Robot category").selectOption("Robot arm");
  await page.getByLabel("The project story", { exact: false }).fill("A private browser-verified project.");
  await page.getByRole("button", { name: "Save privately", exact: false }).click();
  await page.getByText("Saved across sessions", { exact: true }).waitFor();
  assert.match(await page.locator("[data-my-works-status]").innerText(), /saved privately to your account/i);
  assert.equal(projects.length, 2);
  summary.privateCreate = true;

  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Saved across sessions", { exact: true }).waitFor();
  assert.equal(await page.locator("[data-my-works-card]").count(), 2);
  summary.restoredAfterReload = true;
  await page.screenshot({ path: path.join(artifacts, "02-restored-after-reload.png"), fullPage: true });

  await page.getByRole("button", { name: "Remove Saved across sessions", exact: true }).click();
  await page.getByText("Saved across sessions", { exact: true }).waitFor({ state: "detached" });
  assert.equal(projects.length, 1);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Restored private robot", { exact: true }).waitFor();
  assert.equal(await page.getByText("Saved across sessions", { exact: true }).count(), 0);
  summary.idempotentDeleteSurface = true;
  assert.deepEqual(summary.errors, []);
  await context.close();
} catch (error) {
  summary.errors.push(error instanceof Error ? error.message : String(error));
  const contexts = browser.contexts();
  const lastPage = contexts.at(-1)?.pages().at(-1);
  if (lastPage) await lastPage.screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
  await writeFile(path.join(artifacts, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
}

console.log(JSON.stringify(summary));
