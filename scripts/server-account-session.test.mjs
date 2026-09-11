import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    if (specifier === "next/server" || specifier === "next/headers") {
      return nextResolve(`${specifier}.js`, context);
    }
    return nextResolve(specifier, context);
  }
});
const { createSignedAccountSession, verifySignedAccountSession } = await import("../lib/server-account-session.ts");
const identity = {
  userId: "8f138742-102c-4bc7-a4d7-b86dbe9b4252",
  email: "owner@example.com"
};
let previousSecret;

test.beforeEach(() => {
  previousSecret = process.env.AGENTECH_SESSION_SECRET;
  process.env.AGENTECH_SESSION_SECRET = "test-only-stable-identity-secret";
});

test.afterEach(() => {
  if (previousSecret === undefined) delete process.env.AGENTECH_SESSION_SECRET;
  else process.env.AGENTECH_SESSION_SECRET = previousSecret;
});

test("a signed account session preserves the immutable Supabase user id", () => {
  const token = createSignedAccountSession(identity);
  assert.deepEqual(verifySignedAccountSession(token), identity);
});

test("email alone can no longer create an owner-bearing server session", () => {
  assert.throws(
    () => createSignedAccountSession({ userId: "", email: identity.email }),
    /stable Supabase user id/i
  );
});

test("tampering with the stable owner invalidates the whole session", () => {
  const token = createSignedAccountSession(identity);
  const [payload, signature] = token.split(".");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  decoded.userId = "f09fe339-02a9-4d8a-90a6-250dccd5dcb3";
  const tamperedPayload = Buffer.from(JSON.stringify(decoded)).toString("base64url");
  assert.equal(verifySignedAccountSession(`${tamperedPayload}.${signature}`), null);
});
