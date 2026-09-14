import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { scryptSync } from "node:crypto";
import test from "node:test";

// Resolve the same aliases as Next.js while testing the real route in Node.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    if (specifier === "next/server" || specifier === "next/headers") {
      return nextResolve(`${specifier}.js`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { verifySupabasePassword, ensureSupabaseAuthUser } = await import("../lib/supabase-auth-admin.ts");
const { POST } = await import("../app/api/auth/sign-in/route.ts");
const email = "login-regression@example.com";
const password = "test-only-password";
const salt = "test-only-salt";
const account = {
  email, salt, password_hash: scryptSync(password, salt, 64).toString("hex"),
  first_name: "", last_name: "", phone: "", credit_balance: 0,
  paid_credit_balance: 0, bonus_credit_balance: 0,
  created_at: "2026-09-02T00:00:00.000Z", verified_at: "2026-09-02T00:00:00.000Z",
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
  "https://auth-test.invalid/rest/v1/",
]) {
  test(`password authentication uses the Auth endpoint for ${configuredUrl}`, async (t) => {
    process.env.SUPABASE_URL = configuredUrl;
    t.mock.method(globalThis, "fetch", async (url, init) => {
      assert.equal(url, "https://auth-test.invalid/auth/v1/token?grant_type=password");
      assert.equal(init.method, "POST");
      assert.equal(init.headers.apikey, "test-only-publishable-key");
      assert.deepEqual(JSON.parse(init.body), { email, password });
      return Response.json({ access_token: "test-only-token" });
    });
    assert.equal(await verifySupabasePassword(email, password), true);
  });
}

test("account synchronization uses root Auth endpoints, including the existing-user fallback", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    requests.push([init.method ?? "GET", url]);
    if (init.method === "POST") return Response.json({ error_code: "email_exists" }, { status: 422 });
    if (init.method === "PUT") return Response.json({ id: "test-user", email });
    return Response.json({ users: [{ id: "test-user", email }] });
  });
  await ensureSupabaseAuthUser(email, password);
  assert.deepEqual(requests, [
    ["POST", "https://auth-test.invalid/auth/v1/admin/users"],
    ["GET", "https://auth-test.invalid/auth/v1/admin/users?page=1&per_page=1000"],
    ["PUT", "https://auth-test.invalid/auth/v1/admin/users/test-user"],
  ]);
});

function request(body = { email, password }) {
  return new Request("https://site-test.invalid/api/auth/sign-in", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

test("successful legacy sign-in synchronizes the account and issues a signed session", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const path = new URL(url).pathname;
    if (path === "/rest/v1/agentech_accounts") return Response.json([account]);
    if (path === "/auth/v1/token") return Response.json({ error_code: "invalid_credentials" }, { status: 400 });
    if (path === "/auth/v1/admin/users" && init.method === "POST") return Response.json({ id: "test-user", email });
    return Response.json({ message: "Invalid path" }, { status: 404 });
  });
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).email, email);
  assert.match(response.headers.get("set-cookie"), /agentech_account_session=.+;.*HttpOnly/i);
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

test("database failure returns a retryable JSON error without exposing internal details", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ message: "sensitive-database-detail" }, { status: 503 }));
  const response = await POST(request());
  assert.equal(response.status, 503);
  const result = await response.json();
  assert.match(result.error, /temporarily unavailable|try again/i);
  assert.doesNotMatch(JSON.stringify(result), /sensitive-database-detail|test-only-service-key/);
  assert.equal(response.headers.get("set-cookie"), null);
});

for (const status of [401, 404, 429, 503]) {
test(`Auth service HTTP ${status} does not trigger password synchronization`, async (t) => {
  let writes = 0;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const path = new URL(url).pathname;
    if (path === "/rest/v1/agentech_accounts") return Response.json([account]);
    if (path.includes("/admin/")) writes += 1;
    return Response.json({ message: "upstream unavailable" }, { status });
  });
  const response = await POST(request());
  assert.equal(response.status, 503);
  assert.equal(writes, 0);
  assert.equal(response.headers.get("set-cookie"), null);
});
}

test("network failure returns JSON and does not leave the route throwing", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("fetch failed"); });
  const response = await POST(request());
  assert.equal(response.status, 503);
  assert.equal(typeof (await response.json()).error, "string");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("existing Supabase credentials sign in without creating or overwriting an Auth user", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    const path = new URL(url).pathname;
    requests.push(path);
    if (path === "/rest/v1/agentech_accounts") return Response.json([account]);
    if (path === "/auth/v1/token") return Response.json({ access_token: "test-only-token" });
    throw new Error("An existing Auth account should not be modified");
  });
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.match(response.headers.get("set-cookie"), /agentech_account_session=/);
  assert.deepEqual(requests, ["/rest/v1/agentech_accounts", "/auth/v1/token"]);
});

test("synchronization failure never issues a signed session", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    const path = new URL(url).pathname;
    if (path === "/rest/v1/agentech_accounts") return Response.json([account]);
    if (path === "/auth/v1/token") return Response.json({ error_code: "invalid_credentials" }, { status: 400 });
    return Response.json({ message: "upstream unavailable" }, { status: 503 });
  });
  const response = await POST(request());
  assert.equal(response.status, 503);
  assert.equal(typeof (await response.json()).error, "string");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("invalid input is rejected before calling any account service", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests += 1; return Response.json([]); });
  const response = await POST(request({ email: "not-an-email", password: "" }));
  assert.equal(response.status, 400);
  assert.equal(requests, 0);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("password verification passes an abort signal so upstream timeouts fail closed", async (t) => {
  const timeoutError = new DOMException("Test timeout", "TimeoutError");
  t.mock.method(AbortSignal, "timeout", () => AbortSignal.abort(timeoutError));
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    assert.ok(init.signal, "Supabase Auth requests must have a timeout signal");
    init.signal.throwIfAborted();
    return Response.json({ access_token: "test-only-token" });
  });
  await assert.rejects(verifySupabasePassword(email, password), { name: "TimeoutError" });
});

for (let i = 1; i <= 8; i++) {
  const username = `skyrockettest${String(i).padStart(3, "0")}`;
  test(`only provisioned ${username} can sign in without email`, async (t) => {
    t.mock.method(globalThis, "fetch", async (url) => {
      assert.equal(new URL(url).pathname, "/rest/v1/agentech_accounts");
      return Response.json([{ ...account, email: username, password_hash: scryptSync(username, salt, 64).toString("hex") }]);
    });
    const response = await POST(request({ email: username, password: username }));
    assert.equal(response.status, 200);
    const { verifySignedAccountSession } = await import("../lib/server-account-session.ts");
    const token = response.cookies.get("agentech_account_session").value;
    assert.equal(verifySignedAccountSession(token), username);
    const denied = await POST(request({ email: username, password: "wrong-password" }));
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get("set-cookie"), null);
  });
}
for (const username of ["skyrockettest000", "skyrockettest009", "skyrockettest01", "skyrocket", "otheruser"]) {
  test(`rejects unapproved username ${username}`, async () => {
    assert.equal((await POST(request({ email: username, password }))).status, 400);
  });
}
test("missing test account cannot sign in or auto-provision", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    assert.equal(init.method, "GET");
    return Response.json([]);
  });
  assert.equal((await POST(request({ email: "skyrockettest001", password: "skyrockettest001" }))).status, 401);
});
