import assert from "node:assert/strict";
import test from "node:test";
import { buildLoginPath, isProtectedAuthDestination, resolveAuthReturnPath } from "./auth-return-path.ts";

test("auth return paths keep internal project targets, queries, and fragments", () => {
  const target = "/agentech-products/eais/projects/prototype-walk-together?view=build#process";
  assert.equal(resolveAuthReturnPath(target), target);
  assert.equal(resolveAuthReturnPath([target, "/account"]), target);
  assert.equal(buildLoginPath(target), `/login?next=${encodeURIComponent(target)}`);
});
test("auth return paths fail closed for external, recursive, or malformed destinations", () => {
  for (const candidate of [
    "https://example.com/steal-session",
    "//example.com/steal-session",
    "/\\example.com/steal-session",
    "/login",
    "/login?next=/account",
    "/login#continue",
    "/account\nSet-Cookie: unsafe=1",
    "account"
  ]) {
    assert.equal(resolveAuthReturnPath(candidate), "/account", candidate);
  }
  assert.equal(resolveAuthReturnPath(undefined, ""), "");
});

test("local login bypass stays disabled for server-protected destinations", () => {
  assert.equal(isProtectedAuthDestination("/admin/ai-gateway"), true);
  assert.equal(isProtectedAuthDestination("/agentech-products/eais/projects/prototype-walk-together"), true);
  assert.equal(isProtectedAuthDestination("/agentech-products/eais"), false);
  assert.equal(isProtectedAuthDestination("/account"), false);
});
