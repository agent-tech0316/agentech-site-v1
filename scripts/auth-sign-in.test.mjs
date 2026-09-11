import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
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

const { authenticateSupabasePassword, createSupabaseAuthUser, SupabaseAuthUserExistsError } = await import("../lib/supabase-auth-admin.ts");
const { POST } = await import("../app/api/auth/sign-in/route.ts");
const email = "login-regression@example.com";
const password = "test-only-password";
const userId = "8f138742-102c-4bc7-a4d7-b86dbe9b4252";
const salt = "test-only-salt";
const account = {
  email,
  auth_user_id: null,
  salt,
  password_hash: scryptSync(password, salt, 64).toString("hex"),
  first_name: "",
  last_name: "",
  phone: "",
  credit_balance: 0,
  paid_credit_balance: 0,
  bonus_credit_balance: 0,
  created_at: "2026-09-02T00:00:00.000Z",
  verified_at: "2026-09-02T00:00:00.000Z"
};

const providerSession = {
  access_token: "test-only-access-token",
  refresh_token: "test-only-refresh-token",
  expires_in: 3600,
  user: { id: userId, email }
};

test.beforeEach((t) => {
  const saved = { ...process.env };
  process.env.SUPABASE_URL = "https://auth-test.invalid/rest/v1";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-key";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-only-publishable-key";
  process.env.AGENTECH_SESSION_SECRET = "test-only-session-secret";
  t.after(() => { process.env = saved; });
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected external request in test"); });
  t.mock.method(console, "error", () => {});
});

for (const configuredUrl of [
  "https://auth-test.invalid",
  "https://auth-test.invalid/",
  "https://auth-test.invalid/rest/v1",
  "https://auth-test.invalid/rest/v1/"
]) {
  test(`password authentication returns stable identity for ${configuredUrl}`, async (t) => {
    process.env.SUPABASE_URL = configuredUrl;
    t.mock.method(globalThis, "fetch", async (url, init) => {
      assert.equal(url, "https://auth-test.invalid/auth/v1/token?grant_type=password");
      assert.equal(init.method, "POST");
      assert.equal(init.headers.apikey, "test-only-publishable-key");
      assert.deepEqual(JSON.parse(init.body), { email, password });
      return Response.json(providerSession);
    });
    assert.deepEqual(await authenticateSupabasePassword(email, password), {
      userId,
      email,
      accessToken: providerSession.access_token,
      refreshToken: providerSession.refresh_token,
      expiresIn: 3600
    });
  });
}

test("existing Auth user conflict is reported without overwriting its password", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init = {}) => {
    requests.push([init.method ?? "GET", new URL(url).pathname]);
    if (init.method === "POST") return Response.json({ error_code: "email_exists" }, { status: 422 });
    return Response.json({ users: [{ id: userId, email }] });
  });
  await assert.rejects(createSupabaseAuthUser(email, password), (error) => {
    assert.ok(error instanceof SupabaseAuthUserExistsError);
    assert.deepEqual(error.user, { userId, email });
    return true;
  });
  assert.deepEqual(requests, [
    ["POST", "/auth/v1/admin/users"],
    ["GET", "/auth/v1/admin/users"]
  ]);
  assert.equal(requests.some(([method]) => method === "PUT"), false);
});

function request(body = { email, password }) {
  return new Request("https://site-test.invalid/api/auth/sign-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

test("legacy-only sign-in creates one provider identity, links it, and issues a UUID session", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init = {}) => {
    const path = new URL(url).pathname;
    requests.push([init.method ?? "GET", path, init.body ? JSON.parse(init.body) : null]);
    if (path === "/rest/v1/agentech_accounts") return Response.json([account]);
    if (path === "/auth/v1/token") return Response.json({ error_code: "invalid_credentials" }, { status: 400 });
    if (path === "/auth/v1/admin/users" && !init.method) return Response.json({ users: [] });
    if (path === "/auth/v1/admin/users" && init.method === "POST") return Response.json({ id: userId, email });
    if (path === "/rest/v1/rpc/agentech_link_auth_identity") return Response.json({ user_id: userId, email });
    return Response.json({ message: "Invalid path" }, { status: 404 });
  });

  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, email, userId, authProvider: "supabase" });
  assert.match(response.headers.get("set-cookie"), /agentech_account_session=.+;.*HttpOnly/i);
  assert.equal(requests.some(([method, path]) => method === "PUT" && path.includes("/admin/users/")), false);
  assert.equal(requests.some(([, path, body]) => path === "/rest/v1/agentech_accounts" && body?.password_hash), false);
  const link = requests.find(([, path]) => path === "/rest/v1/rpc/agentech_link_auth_identity");
  assert.deepEqual(link[2], { p_email: email, p_auth_user_id: userId });
});

test("an existing provider session links the same UUID without admin password writes", async (t) => {
  const paths = [];
  t.mock.method(globalThis, "fetch", async (url, init = {}) => {
    const path = new URL(url).pathname;
    paths.push([init.method ?? "GET", path]);
    if (path === "/rest/v1/agentech_accounts") return Response.json([account]);
    if (path === "/auth/v1/token") return Response.json(providerSession);
    if (path === "/rest/v1/rpc/agentech_link_auth_identity") return Response.json({ user_id: userId, email });
    throw new Error("An existing Auth account should not be modified");
  });
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).userId, userId);
  assert.equal(paths.some(([, path]) => path.includes("/auth/v1/admin/")), false);
});

test("legacy password never overwrites an already-existing provider password", async (t) => {
  let adminWrites = 0;
  t.mock.method(globalThis, "fetch", async (url, init = {}) => {
    const path = new URL(url).pathname;
    if (path === "/rest/v1/agentech_accounts") return Response.json([account]);
    if (path === "/auth/v1/token") return Response.json({ error_code: "invalid_credentials" }, { status: 400 });
    if (path === "/auth/v1/admin/users") return Response.json({ users: [{ id: userId, email }] });
    if (path.includes("/auth/v1/admin/") && ["POST", "PUT", "PATCH"].includes(init.method)) adminWrites += 1;
    return Response.json({ message: "unexpected" }, { status: 500 });
  });
  const response = await POST(request());
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /Forgot Password/i);
  assert.equal(adminWrites, 0);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("wrong credentials remain a 401 and never create a session", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => new URL(url).pathname === "/rest/v1/agentech_accounts"
    ? Response.json([account])
    : Response.json({ error_code: "invalid_credentials" }, { status: 400 }));
  const response = await POST(request({ email, password: "wrong-test-password" }));
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /email or password/i);
  assert.equal(response.headers.get("set-cookie"), null);
});

for (const status of [401, 404, 429, 503]) {
  test(`Auth service HTTP ${status} does not trigger legacy migration`, async (t) => {
    let adminWrites = 0;
    t.mock.method(globalThis, "fetch", async (url, init = {}) => {
      const path = new URL(url).pathname;
      if (path === "/rest/v1/agentech_accounts") return Response.json([account]);
      if (path.includes("/admin/") && init.method) adminWrites += 1;
      return Response.json({ message: "upstream unavailable" }, { status });
    });
    const response = await POST(request());
    assert.equal(response.status, 503);
    assert.equal(adminWrites, 0);
    assert.equal(response.headers.get("set-cookie"), null);
  });
}

test("password verification passes an abort signal so upstream timeouts fail closed", async (t) => {
  const timeoutError = new DOMException("Test timeout", "TimeoutError");
  t.mock.method(AbortSignal, "timeout", () => AbortSignal.abort(timeoutError));
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    assert.ok(init.signal);
    init.signal.throwIfAborted();
    return Response.json(providerSession);
  });
  await assert.rejects(authenticateSupabasePassword(email, password), { name: "TimeoutError" });
});
