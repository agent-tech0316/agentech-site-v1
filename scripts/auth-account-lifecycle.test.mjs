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
const [{ POST: createAccount }, { POST: resetPassword }] = await Promise.all([
  import("../app/api/auth/create-account/route.ts"),
  import("../app/api/auth/reset-password/route.ts")
]);

const email = "lifecycle-regression@example.com";
const password = "test-only-password";
const replacementPassword = "replacement-test-password";
const userId = "8f138742-102c-4bc7-a4d7-b86dbe9b4252";
const code = "123456";

function routeRequest(path, body) {
  return new Request(`https://site-test.invalid${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function jsonBody(init = {}) {
  return typeof init.body === "string" ? JSON.parse(init.body) : null;
}

test.beforeEach((t) => {
  const saved = { ...process.env };
  process.env.SUPABASE_URL = "https://auth-test.invalid/rest/v1";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-key";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-only-publishable-key";
  process.env.AGENTECH_SESSION_SECRET = "test-only-session-secret";
  t.after(() => { process.env = saved; });
  t.mock.method(console, "error", () => {});
});

test("account creation makes Supabase Auth authoritative and persists the UUID bridge", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    const method = init.method ?? "GET";
    const body = jsonBody(init);
    requests.push({ method, path: url.pathname, query: url.search, body });

    if (url.pathname === "/rest/v1/agentech_accounts" && method === "GET") return Response.json([]);
    if (url.pathname === "/rest/v1/agentech_verification_codes" && method === "GET") {
      return Response.json([{ email, code, expires_at: "2999-01-01T00:00:00.000Z", created_at: "2026-09-11T00:00:00.000Z" }]);
    }
    if (url.pathname === "/auth/v1/token") return Response.json({ error_code: "invalid_credentials" }, { status: 400 });
    if (url.pathname === "/auth/v1/admin/users" && method === "POST") return Response.json({ id: userId, email });
    if (url.pathname === "/rest/v1/rpc/agentech_link_auth_identity") return Response.json({ user_id: userId, email });
    if (url.pathname === "/rest/v1/agentech_accounts" && method === "PATCH") {
      return Response.json([{ email, first_name: "Ada", last_name: "Lovelace", phone: "555-0100" }]);
    }
    if (url.pathname === "/rest/v1/agentech_profiles" && method === "GET") return Response.json([]);
    if (url.pathname === "/rest/v1/agentech_profiles" && method === "PATCH") return Response.json([]);
    if (url.pathname === "/rest/v1/agentech_profiles" && method === "POST") return Response.json([body]);
    if (url.pathname === "/rest/v1/agentech_verification_codes" && method === "DELETE") return new Response(null, { status: 204 });
    throw new Error(`Unexpected ${method} ${url.pathname}${url.search}`);
  });

  const response = await createAccount(routeRequest("/api/auth/create-account", {
    email,
    code,
    password,
    firstName: "ada",
    lastName: "lovelace",
    phone: "555-0100",
    addressLine1: "1 Test Way"
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, email, userId });
  assert.match(response.headers.get("set-cookie"), /agentech_account_session=.+;.*HttpOnly/i);
  const link = requests.find(({ path }) => path === "/rest/v1/rpc/agentech_link_auth_identity");
  assert.deepEqual(link?.body, { p_email: email, p_auth_user_id: userId });
  const profileWrite = requests.find(({ path, method }) => path === "/rest/v1/agentech_profiles" && method === "POST");
  assert.equal(profileWrite?.body.auth_user_id, userId);
  assert.equal(requests.some(({ path, body }) => path.startsWith("/rest/v1/") && body?.password_hash), false);
  assert.equal(requests.some(({ path, method }) => path.includes("/auth/v1/admin/users/") && method === "PUT"), false);
});

test("verified password reset updates only the mapped Supabase Auth identity", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (rawUrl, init = {}) => {
    const url = new URL(rawUrl);
    const method = init.method ?? "GET";
    const body = jsonBody(init);
    requests.push({ method, path: url.pathname, query: url.search, body });

    if (url.pathname === "/rest/v1/agentech_accounts") {
      return Response.json([{ email, auth_user_id: userId, password_hash: null, salt: null }]);
    }
    if (url.pathname === "/rest/v1/agentech_verification_codes" && method === "GET") {
      return Response.json([{ email, code, expires_at: "2999-01-01T00:00:00.000Z", created_at: "2026-09-11T00:00:00.000Z" }]);
    }
    if (url.pathname === "/auth/v1/admin/users" && method === "GET") return Response.json({ users: [{ id: userId, email }] });
    if (url.pathname === `/auth/v1/admin/users/${userId}` && method === "PUT") return Response.json({ id: userId, email });
    if (url.pathname === "/rest/v1/rpc/agentech_link_auth_identity") return Response.json({ user_id: userId, email });
    if (url.pathname === "/rest/v1/agentech_verification_codes" && method === "DELETE") return new Response(null, { status: 204 });
    throw new Error(`Unexpected ${method} ${url.pathname}${url.search}`);
  });

  const response = await resetPassword(routeRequest("/api/auth/reset-password", {
    email,
    code,
    password: replacementPassword
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, email, userId });
  const authWrite = requests.find(({ path, method }) => path === `/auth/v1/admin/users/${userId}` && method === "PUT");
  assert.deepEqual(authWrite?.body, { password: replacementPassword });
  assert.equal(requests.some(({ path, method }) => path === "/rest/v1/agentech_accounts" && method === "PATCH"), false);
  assert.match(response.headers.get("set-cookie"), /agentech_account_session=.+;.*HttpOnly/i);
});
