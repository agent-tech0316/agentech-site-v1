import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const runtimeDir = await mkdtemp(join(tmpdir(), "master-heartbeat-route-"));
process.env.MASTER_HEARTBEAT_RUNTIME_DIR = runtimeDir;
process.env.ROBOT_RUNNER_SECRET = "test-master-heartbeat-secret";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { GET, POST } = await import("../app/api/master-heartbeat/route.ts");

test.after(async () => {
  await rm(runtimeDir, { recursive: true, force: true });
});

function observation(overrides = {}) {
  return {
    schemaVersion: 1,
    gatewayId: "agentech01",
    observedAt: new Date().toISOString(),
    master: {
      host: "192.168.4.152",
      controllerResponsive: true,
      connection: "connected",
      posture: "standard",
      action: null,
      state: null,
    },
    battery: {
      available: false,
      percent: null,
      voltage: null,
      charging: null,
      sourceTopic: null,
    },
    ...overrides,
  };
}

function postRequest(body, secret, headers = {}) {
  return new Request("http://localhost/api/master-heartbeat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-robot-runner-secret": secret } : {}),
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("GET reports unavailable before the first valid observation", async () => {
  const response = await GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    schemaVersion: 1,
    gatewayId: "agentech01",
    condition: "unavailable",
    fresh: false,
    ageMs: null,
    observedAt: null,
    receivedAt: null,
    master: null,
    battery: null,
  });
});

test("POST rejects missing and incorrect secrets", async () => {
  for (const secret of [undefined, "wrong-secret"]) {
    const response = await POST(postRequest(observation(), secret));
    assert.equal(response.status, 401);
  }
});

test("POST accepts a Bearer secret and persists a sanitized observation", async () => {
  const response = await POST(postRequest(
    observation(),
    undefined,
    { authorization: "Bearer test-master-heartbeat-secret" },
  ));
  assert.equal(response.status, 202);
  const accepted = await response.json();
  assert.equal(accepted.accepted, true);
  assert.match(accepted.receivedAt, /^2026-|^2027-/);

  const persisted = JSON.parse(await readFile(join(runtimeDir, "latest.json"), "utf8"));
  assert.equal(persisted.observation.gatewayId, "agentech01");
  assert.equal("secret" in persisted, false);
  assert.equal("secret" in persisted.observation, false);
  assert.equal(persisted.receivedAt, accepted.receivedAt);
  assert.deepEqual(await readdir(runtimeDir), ["latest.json"]);
});

test("GET returns the latest accepted observation with server-derived freshness", async () => {
  const response = await GET();
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.gatewayId, "agentech01");
  assert.equal(payload.condition, "online");
  assert.equal(payload.fresh, true);
  assert.equal(payload.master.host, "192.168.4.152");
  assert.equal(payload.battery.available, false);
  assert.equal(typeof payload.ageMs, "number");
});

test("POST accepts the exact shared secret header", async () => {
  const response = await POST(postRequest(observation(), "test-master-heartbeat-secret"));
  assert.equal(response.status, 202);
});

test("POST rejects malformed and invalid observations", async () => {
  const malformed = await POST(postRequest("{", "test-master-heartbeat-secret"));
  assert.equal(malformed.status, 400);

  const invalid = await POST(postRequest(
    observation({ gatewayId: "somewhere-else" }),
    "test-master-heartbeat-secret",
  ));
  assert.equal(invalid.status, 400);
});

test("POST rejects a body larger than sixteen KiB", async () => {
  const response = await POST(postRequest(
    JSON.stringify({ padding: "x".repeat(16_385) }),
    "test-master-heartbeat-secret",
  ));
  assert.equal(response.status, 413);
});

test("GET treats corrupt runtime storage as unavailable", async () => {
  await writeFile(join(runtimeDir, "latest.json"), "not-json", "utf8");
  const response = await GET();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).condition, "unavailable");
});

test("POST fails closed when the server secret is absent", async () => {
  const saved = process.env.ROBOT_RUNNER_SECRET;
  const savedMaster = process.env.MASTER_HEARTBEAT_SECRET;
  delete process.env.ROBOT_RUNNER_SECRET;
  delete process.env.MASTER_HEARTBEAT_SECRET;
  try {
    const response = await POST(postRequest(observation(), "test-master-heartbeat-secret"));
    assert.equal(response.status, 503);
  } finally {
    process.env.ROBOT_RUNNER_SECRET = saved;
    if (savedMaster === undefined) delete process.env.MASTER_HEARTBEAT_SECRET;
    else process.env.MASTER_HEARTBEAT_SECRET = savedMaster;
  }
});

test("POST prefers the dedicated Master heartbeat secret", async () => {
  process.env.MASTER_HEARTBEAT_SECRET = "dedicated-master-secret";
  try {
    assert.equal((await POST(postRequest(observation(), "test-master-heartbeat-secret"))).status, 401);
    assert.equal((await POST(postRequest(observation(), "dedicated-master-secret"))).status, 202);
  } finally {
    delete process.env.MASTER_HEARTBEAT_SECRET;
  }
});
