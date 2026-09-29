import assert from "node:assert/strict";
import test from "node:test";

const modulePath = "./website-inquiry.ts";
const inquiry = await import(modulePath).catch(() => null);
const valid = {
  name: "  Alex Chen  ", email: "alex+website@example.com", company: "Field & Co",
  audience: "business", website: "https://example.com", goal: "Explain our consulting services.",
  timeline: "Next month", readiness: "Some materials ready", acceptsPackage: true
};

test("a prepared inquiry retains the brief and safely encodes an email draft", () => {
  assert.equal(typeof inquiry?.prepareWebsiteInquiry, "function", "Inquiry preparation is not implemented");
  const result = inquiry.prepareWebsiteInquiry(valid);
  assert.equal(result.ok, true);
  const mail = new URL(result.mailto);
  assert.equal(mail.protocol, "mailto:");
  assert.equal(mail.pathname, "info@agent-tech.ai");
  assert.equal(mail.searchParams.get("subject"), "Website Launch inquiry — Field & Co");
  assert.match(mail.searchParams.get("body")!, /Name: Alex Chen\n/);
  assert.match(mail.searchParams.get("body")!, /Email: alex\+website@example.com/);
  assert.match(result.body, /Explain our consulting services\./);
  assert.match(result.body, /\$2,000/);
});

test("missing contact, malformed email, unaccepted price, and oversized briefs do not create drafts", () => {
  assert.ok(inquiry?.prepareWebsiteInquiry, "Inquiry preparation is not implemented");
  for (const patch of [{ name: " " }, { email: "bad" }, { acceptsPackage: false }, { goal: "x".repeat(2001) }, { audience: "unknown" }]) {
    const result = inquiry.prepareWebsiteInquiry({ ...valid, ...patch });
    assert.equal(result.ok, false);
    assert.equal(result.mailto, undefined);
  }
});

test("agency context survives drafting and user text cannot introduce mail headers", () => {
  assert.ok(inquiry?.prepareWebsiteInquiry, "Inquiry preparation is not implemented");
  const result = inquiry.prepareWebsiteInquiry({ ...valid, audience: "agency", company: "Studio & Partners", goal: "Design & build? 中文\nOne client project." });
  assert.equal(result.ok, true);
  const mail = new URL(result.mailto);
  assert.deepEqual([...mail.searchParams.keys()], ["subject", "body"]);
  assert.match(result.body, /Agency partner/);
  assert.match(result.body, /Design & build\? 中文/);
});
