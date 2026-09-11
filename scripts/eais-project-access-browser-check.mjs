import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.AGENTECH_PLAYWRIGHT_PATH ?? "playwright");
const origin = process.env.EAIS_ACCESS_ORIGIN ?? "http://127.0.0.1:3027";
const artifacts = process.env.EAIS_ACCESS_ARTIFACTS ?? ".codex-artifacts/eais-project-access";
const browserExecutable = process.env.EAIS_ACCESS_BROWSER ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sessionSecret = process.env.AGENTECH_SESSION_SECRET ?? "eais-access-browser-test-only-secret";
const signedCookieName = "agentech_account_session";
const fixtureEmail = "eais-browser-fixture@example.invalid";
const fixtureUserId = "8f138742-102c-4bc7-a4d7-b86dbe9b4252";

function createFixtureSession() {
  const payload = Buffer.from(JSON.stringify({
    version: 2,
    userId: fixtureUserId,
    email: fixtureEmail,
    expiresAt: Date.now() + 10 * 60 * 1000
  }), "utf8").toString("base64url");
  const signature = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

async function setFixtureSession(context) {
  await context.addCookies([{
    name: signedCookieName,
    value: createFixtureSession(),
    url: origin,
    httpOnly: true,
    sameSite: "Lax"
  }]);
}

function watchErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: browserExecutable });
const summary = {
  publicDiscovery: false,
  publicPreview: false,
  gatedFullProject: false,
  authChoices: false,
  safeTargetPreserved: false,
  mockSignInRestoredTarget: false,
  mockCreateAccountRestoredTarget: false,
  signedSessionDirectAccess: false,
  mobileDirectAccess: false,
  errors: []
};

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    extraHTTPHeaders: { "x-forwarded-host": "eais-access-browser.invalid" }
  });
  await context.addInitScript(() => localStorage.setItem("agentech-theme", "light"));
  const page = await context.newPage();
  const errors = watchErrors(page);

  const discoveryResponse = await page.goto(`${origin}/agentech-products/eais`, { waitUntil: "networkidle" });
  assert.equal(discoveryResponse?.status(), 200);
  await page.locator("[data-eais-public-page]").waitFor();
  assert.equal(await page.locator("[data-eais-work-dialog][open]").count(), 0);
  summary.publicDiscovery = true;

  await page.locator("[data-eais-work-card]").first().click();
  const preview = page.locator("[data-eais-work-dialog][open]");
  await preview.waitFor();
  const previewTitle = (await preview.locator("#eais-work-title").innerText()).trim();
  const targetPath = await preview.locator("[data-eais-open-project]").getAttribute("href");
  assert.ok(targetPath?.startsWith("/agentech-products/eais/projects/"));
  await page.screenshot({ path: path.join(artifacts, "01-public-preview.png"), fullPage: false });
  summary.publicPreview = true;

  await preview.locator("[data-eais-open-project]").click();
  await page.waitForURL((url) => url.pathname === "/login");
  assert.equal(new URL(page.url()).searchParams.get("next"), targetPath);
  assert.equal(await page.getByRole("button", { name: "Create Account", exact: true }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "Sign In", exact: true }).count(), 1);
  await page.screenshot({ path: path.join(artifacts, "02-gated-login.png"), fullPage: false });
  summary.gatedFullProject = true;
  summary.authChoices = true;
  summary.safeTargetPreserved = true;

  await page.route("**/api/auth/sign-in", async (route) => {
    assert.equal(route.request().method(), "POST");
    await setFixtureSession(context);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, email: fixtureEmail, userId: fixtureUserId })
    });
  });
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.locator('input[type="email"]').fill(fixtureEmail);
  await page.locator('input[type="password"]').fill("browser-fixture-password");
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === targetPath, { timeout: 15_000 });
  await page.locator("[data-eais-project-page]").waitFor();
  assert.equal((await page.locator("h1").innerText()).trim(), previewTitle);
  await page.screenshot({ path: path.join(artifacts, "03-restored-full-project.png"), fullPage: false });
  summary.mockSignInRestoredTarget = true;
  assert.deepEqual(errors, []);
  await context.close();

  const signupContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    extraHTTPHeaders: { "x-forwarded-host": "eais-access-browser.invalid" }
  });
  const signupPage = await signupContext.newPage();
  const signupErrors = watchErrors(signupPage);
  await signupPage.route("**/api/auth/send-code", async (route) => {
    assert.equal(route.request().method(), "POST");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, message: "Verification code sent." })
    });
  });
  await signupPage.route("**/api/auth/create-account", async (route) => {
    assert.equal(route.request().method(), "POST");
    await setFixtureSession(signupContext);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, email: fixtureEmail, userId: fixtureUserId })
    });
  });
  await signupPage.goto(`${origin}/login?next=${encodeURIComponent(targetPath)}`, { waitUntil: "networkidle" });
  await signupPage.getByLabel("Email", { exact: true }).fill(fixtureEmail);
  await signupPage.getByRole("button", { name: "Send Verification Code", exact: true }).click();
  await signupPage.getByLabel("Verification Code", { exact: true }).waitFor();
  assert.equal(new URL(signupPage.url()).searchParams.get("next"), targetPath);
  await signupPage.getByLabel("Verification Code", { exact: true }).fill("123456");
  await signupPage.getByLabel("First Name", { exact: true }).fill("Browser");
  await signupPage.getByLabel("Last Name", { exact: true }).fill("Fixture");
  await signupPage.getByLabel("Phone Number", { exact: true }).fill("5550100000");
  await signupPage.getByLabel("Create Password", { exact: true }).fill("browser-fixture-password");
  await signupPage.getByRole("button", { name: "Create Account", exact: true }).last().click();
  await signupPage.waitForURL((url) => url.pathname === targetPath, { timeout: 15_000 });
  await signupPage.locator("[data-eais-project-page]").waitFor();
  assert.equal((await signupPage.locator("h1").innerText()).trim(), previewTitle);
  summary.mockCreateAccountRestoredTarget = true;
  assert.deepEqual(signupErrors, []);
  await signupContext.close();

  const signedContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "dark",
    extraHTTPHeaders: { "x-forwarded-host": "eais-access-browser.invalid" }
  });
  await signedContext.addInitScript(() => localStorage.setItem("agentech-theme", "dark"));
  await setFixtureSession(signedContext);
  const signedPage = await signedContext.newPage();
  const signedErrors = watchErrors(signedPage);
  const signedResponse = await signedPage.goto(`${origin}${targetPath}`, { waitUntil: "networkidle" });
  assert.equal(signedResponse?.status(), 200);
  await signedPage.locator("[data-eais-project-page]").waitFor();
  assert.equal(new URL(signedPage.url()).pathname, targetPath);
  assert.ok(await signedPage.locator("[data-eais-project-page]").evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
  summary.signedSessionDirectAccess = true;
  summary.mobileDirectAccess = true;
  assert.deepEqual(signedErrors, []);
  await signedContext.close();
} catch (error) {
  summary.errors.push(error instanceof Error ? error.message : String(error));
  throw error;
} finally {
  await browser.close();
  await writeFile(path.join(artifacts, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
}

console.log(JSON.stringify(summary));
