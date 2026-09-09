import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("shows the global navigation throughout EAIC Hub", async () => {
  const policy = await import("./site-header-visibility.ts").catch(() => null);

  assert.ok(policy, "site header visibility policy must be available");
  assert.equal(policy.shouldHideSiteHeader("/agentech-products/eaic-hub"), false);
  assert.equal(policy.shouldHideSiteHeader("/agentech-products/eaic-hub/view-sdk"), false);
});

test("keeps dedicated standalone flows free of the global navigation", async () => {
  const policy = await import("./site-header-visibility.ts").catch(() => null);

  assert.ok(policy, "site header visibility policy must be available");
  assert.equal(policy.shouldHideSiteHeader("/field-interest/agt-qr-2026"), true);
  assert.equal(policy.shouldHideSiteHeader("/agentech-products/agentech-library"), true);
});

test("hides the theme switcher on the homepage only", async () => {
  const policy = await import("./site-header-visibility.ts").catch(() => null);

  assert.ok(policy, "site header visibility policy must be available");
  assert.equal(policy.shouldShowThemeToggle("/"), false);
  assert.equal(policy.shouldShowThemeToggle("/agentech-education"), true);
  assert.equal(policy.shouldShowThemeToggle("/agentech-products/eaic-hub"), true);
});

test("hides the mobile theme switcher on the homepage while keeping it on other global-header pages", async () => {
  const [policy, headerSource] = await Promise.all([
    import("./site-header-visibility.ts").catch(() => null),
    readFile(path.join(process.cwd(), "components/site-header.tsx"), "utf8")
  ]);

  assert.ok(policy, "site header visibility policy must be available");
  assert.equal(policy.shouldShowMobileThemeToggle("/"), false);
  assert.equal(policy.shouldShowMobileThemeToggle("/agentech-education"), true);
  assert.equal(policy.shouldShowMobileThemeToggle("/agentech-products/eaic-hub/view-sdk"), true);
  assert.equal(policy.shouldShowMobileThemeToggle("/field-interest/agt-qr-2026"), false);
  assert.equal(policy.shouldShowMobileThemeToggle("/agentech-products/agentech-library"), false);
  assert.match(headerSource, /data-mobile-theme-controls/);
  assert.match(headerSource, /<ThemeToggle mobileHeader\s*\/>/);
});

test("hides auth controls only for localhost or an explicit public review build", async () => {
  const policy = await import("./site-header-visibility.ts").catch(() => null);

  assert.ok(policy, "site header visibility policy must be available");
  assert.equal(policy.shouldShowAuthControls("localhost", false), false);
  assert.equal(policy.shouldShowAuthControls("temporary-review.vercel.app", true), false);
  assert.equal(policy.shouldShowAuthControls("agentech.com", false), true);
});

test("renders navigation labels as Interface text instead of image assets", async () => {
  const [headerSource, globalStyles] = await Promise.all([
    readFile(path.join(process.cwd(), "components/site-header.tsx"), "utf8"),
    readFile(path.join(process.cwd(), "app/globals.css"), "utf8")
  ]);

  assert.match(headerSource, /data-site-nav-wordmark/);
  assert.doesNotMatch(headerSource, /agent-nav-logo-(?:base|active)/);
  assert.match(
    globalStyles,
    /\.agent-nav-wordmark\s*\{[\s\S]*?font-family:\s*var\(--font-sans\)/
  );
});

test("orders and names the primary navigation for the platform-first hierarchy", async () => {
  const { navigation } = await import("./site-data.ts");

  assert.deepEqual(
    navigation.map(({ label, href }) => ({ label, href })),
    [
      { label: "Platform", href: "/agentech-products/eaic" },
      { label: "Service", href: "/agentech-robotic" },
      { label: "Education", href: "/agentech-education" },
      { label: "Talents", href: "/talents" }
    ]
  );
});
