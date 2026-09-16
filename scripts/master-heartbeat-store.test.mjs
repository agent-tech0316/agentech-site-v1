import assert from "node:assert/strict";
import test from "node:test";

const saved = { ...process.env };
process.env.NODE_ENV = "production";
process.env.SUPABASE_URL = "https://example.supabase.co/rest/v1";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

const { readLatestHeartbeat, writeLatestHeartbeat } = await import("../lib/master-heartbeat-store.ts");

test.after(() => {
  process.env = saved;
});

const record = {
  observation: {
    schemaVersion: 1,
    gatewayId: "agentech01",
    observedAt: "2026-09-01T12:00:00.000Z",
    master: { host: "192.168.4.152", controllerResponsive: true, connection: "connected", posture: "standard", action: null, state: null },
    battery: { available: true, percent: 89, voltage: 52.67, charging: false, sourceTopic: "/aima/hal/pmu/state" },
  },
  receivedAt: "2026-09-01T12:00:01.000Z",
};

test("production store upserts the latest heartbeat to private Supabase Storage", async () => {
  const originalFetch = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async (url, init) => {
    call += 1;
    if (call === 1) {
      assert.equal(url, "https://example.supabase.co/storage/v1/bucket/robot-heartbeats");
      return new Response("{}", { status: 200 });
    }
    assert.equal(url, "https://example.supabase.co/storage/v1/object/robot-heartbeats/latest.json");
    assert.equal(init.method, "POST");
    assert.equal(init.headers.apikey, "service-role-test-key");
    assert.equal(init.headers["x-upsert"], "true");
    assert.deepEqual(JSON.parse(init.body), record);
    return new Response("{}", { status: 200 });
  };
  try { await writeLatestHeartbeat(record); } finally { globalThis.fetch = originalFetch; }
});

test("production store reads and validates the private Supabase object", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://example.supabase.co/storage/v1/object/authenticated/robot-heartbeats/latest.json");
    assert.equal(init.headers.Authorization, "Bearer service-role-test-key");
    return new Response(JSON.stringify(record), { status: 200 });
  };
  try { assert.deepEqual(await readLatestHeartbeat(), record); } finally { globalThis.fetch = originalFetch; }
});

test("production store creates a private JSON-only bucket when missing", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith("/bucket/robot-heartbeats")) return new Response("missing", { status: 400 });
    return new Response("{}", { status: 200 });
  };
  try { await writeLatestHeartbeat(record); } finally { globalThis.fetch = originalFetch; }
  assert.equal(calls[1].url, "https://example.supabase.co/storage/v1/bucket");
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    id: "robot-heartbeats",
    name: "robot-heartbeats",
    public: false,
    file_size_limit: 65_536,
    allowed_mime_types: ["application/json"],
  });
});

test("production store treats a missing object as no heartbeat", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("missing", { status: 404 });
  try { assert.equal(await readLatestHeartbeat(), null); } finally { globalThis.fetch = originalFetch; }
});
