import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { normalizeBuyerProfile, normalizeServiceProfile, normalizeCollectionBrief, isLocalBuyerPreview, isServiceRequestOrigin } from "./data-collection.ts";
import { buyerStorageKey } from "./data-collection-store.ts";

test("buyer profiles require organization and contact details, without granting another role", () => {
  assert.throws(() => normalizeBuyerProfile({}), /organization/i);
  const profile = normalizeBuyerProfile({ organization: "  Example AI  ", contactName: "Alex Lee", role: "Research lead", region: "United States", profileType: "developer" });
  assert.equal(profile.organization, "Example AI");
  assert.equal(profile.profileType, "data-buyer");
  assert.throws(() => normalizeBuyerProfile({ organization: "Example", contactName: "" }), /contact/i);
});

test("briefs validate collection quantities and supported choices", () => {
  const valid = { title: "Warehouse picking", scenario: "logistics", modality: "Egocentric video", format: "MP4 + JSON", quantity: 100, unit: "hours", notes: "Pick and place" };
  assert.equal(normalizeCollectionBrief(valid).quantity, 100);
  for (const quantity of [0, -1, 0.5, Infinity, 1000001]) assert.throws(() => normalizeCollectionBrief({ ...valid, quantity }), /quantity/i);
  assert.throws(() => normalizeCollectionBrief({ ...valid, scenario: "unknown" }), /scenario/i);
  assert.throws(() => normalizeCollectionBrief({ ...valid, modality: "anything" }), /modality/i);
});

test("preview access is limited to explicit loopback development requests", () => {
  assert.equal(isLocalBuyerPreview("development", "localhost:3012", "1"), true);
  assert.equal(isLocalBuyerPreview("development", "127.0.0.1:3012", "1"), true);
  for (const [env, host, flag] of [["production", "localhost", "1"], ["development", "example.com", "1"], ["development", "localhost.evil.test", "1"], ["development", "localhost", "0"]]) assert.equal(isLocalBuyerPreview(env, host, flag), false);
});

test("buyer storage stays isolated by verified account identity", () => {
  assert.equal(buyerStorageKey("A@example.com"), buyerStorageKey("a@example.com"));
  assert.notEqual(buyerStorageKey("a@example.com"), buyerStorageKey("b@example.com"));
  assert.match(buyerStorageKey("../../a@example.com"), /^[a-f0-9]{64}$/);
});

test("both client profiles need only two fields and never create a robot developer role", () => {
  for (const profileType of ["data-buyer", "development-client"]) {
    const result = normalizeServiceProfile({ profileType, organization: "Example Lab", contactName: "Alex Lee" });
    assert.equal(result.profileType, profileType);
    assert.equal(result.role, "");
    assert.equal(result.region, "");
  }
  assert.throws(() => normalizeServiceProfile({ profileType: "developer", organization: "Example", contactName: "Alex" }), /profile/i);
});

test("origin checks use the browser-facing host while rejecting cross-origin writes", () => {
  assert.equal(isServiceRequestOrigin("http://127.0.0.1:3011", "127.0.0.1:3011"), true);
  assert.equal(isServiceRequestOrigin("https://www.agent-tech.ai", "www.agent-tech.ai"), true);
  assert.equal(isServiceRequestOrigin("http://www.agent-tech.ai", "www.agent-tech.ai", "https:"), false);
  assert.equal(isServiceRequestOrigin("https://evil.test", "www.agent-tech.ai"), false);
  assert.equal(isServiceRequestOrigin("http://localhost:3000", "localhost:3011"), false);
  assert.equal(isServiceRequestOrigin(null, "localhost:3011"), false);
  assert.equal(isServiceRequestOrigin("null", "localhost:3011"), false);
});

test("closed mobile drawer cannot cast a shadow over collection pages", async () => {
  const css = await readFile(new URL("../app/data-collection/data-collection.css", import.meta.url), "utf8");
  const header = await readFile(new URL("../components/site-header.tsx", import.meta.url), "utf8");
  assert.match(header, /data-site-mobile-drawer/);
  assert.match(css, /body:has\(\[data-collection-page\]\) \[data-site-mobile-drawer\]\[aria-hidden="true"\][^{]*\{[^}]*box-shadow:\s*none;[^}]*visibility:\s*hidden;/);
});
