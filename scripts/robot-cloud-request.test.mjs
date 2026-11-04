import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createGatewayCloudRequest } from "./robot-cloud-request.mjs";

function makeRequest(fetchImpl, diagnostics = []) {
  return createGatewayCloudRequest({ fetchImpl, baseUrl: "https://example.invalid", apiKey: "private-api-key",
    retryDelayMs: 1, onDiagnostic: event => diagnostics.push(event) });
}
const ok = () => new Response(JSON.stringify([{ id: 101, session_status: "scheduled" }]), { status: 200 });

test("a transient schedule-read 502 recovers instead of losing the polling cycle", async () => {
  let calls = 0;
  const request = makeRequest(async () => ++calls === 1
    ? new Response("<html>upstream unavailable</html>", { status: 502 }) : ok());
  assert.deepEqual(await request("agentech_robot_sessions", "select=id"), [{ id: 101, session_status: "scheduled" }]);
  assert.equal(calls, 2);
});

test("a timed-out read retries once and returns fresh schedule data", async () => {
  let calls = 0;
  const request = makeRequest(async () => {
    if (++calls === 1) throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    return ok();
  });
  assert.deepEqual(await request("agentech_robot_sessions", "select=id"), [{ id: 101, session_status: "scheduled" }]);
  assert.equal(calls, 2);
});

test("persistent network failure is bounded and identifies the read without leaking secrets", async () => {
  let calls = 0;
  const request = makeRequest(async () => { calls++; throw new TypeError("fetch failed private-api-key"); });
  await assert.rejects(request("agentech_robot_sessions", "email=eq.private@example.com"), error => {
    assert.equal(error.name, "GatewayCloudRequestError");
    assert.equal(error.operation, "GET agentech_robot_sessions");
    assert.equal(error.attempts, 2);
    assert.equal(error.category, "network");
    assert.doesNotMatch(error.message, /private-api-key|private@example|https:/);
    return true;
  });
  assert.equal(calls, 2);
});

test("an ambiguous booking-claim PATCH is never replayed", async () => {
  let calls = 0;
  const request = makeRequest(async () => { calls++; throw new DOMException("timeout", "TimeoutError"); });
  await assert.rejects(request("agentech_robot_sessions", "id=eq.101", {
    method: "PATCH", body: { session_status: "running" },
  }), error => {
    assert.equal(error.operation, "PATCH agentech_robot_sessions");
    assert.equal(error.attempts, 1);
    assert.equal(error.category, "timeout");
    return true;
  });
  assert.equal(calls, 1);
});

test("authentication failure is not retried and raw response text is not logged", async () => {
  let calls = 0;
  const request = makeRequest(async () => {
    calls++;
    return new Response("private-api-key private@example.com", { status: 401 });
  });
  await assert.rejects(request("agentech_robot_sessions", "select=id"), error => {
    assert.equal(error.httpStatus, 401);
    assert.equal(error.attempts, 1);
    assert.doesNotMatch(error.message, /private-api-key|private@example/);
    return true;
  });
  assert.equal(calls, 1);
});

test("recovery diagnostics distinguish a recovered read from an exhausted outage", async () => {
  let calls = 0;
  const diagnostics = [];
  const request = makeRequest(async () => ++calls === 1 ? new Response("busy", { status: 503 }) : ok(), diagnostics);
  await request("agentech_robot_sessions", "select=id");
  assert.deepEqual(diagnostics.map(item => item.event), ["retry", "recovered"]);
  assert.ok(diagnostics.every(item => !Number.isNaN(Date.parse(item.timestamp))));
});

async function withServer(t, handler, options = {}) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return createGatewayCloudRequest({ baseUrl: `http://127.0.0.1:${server.address().port}`,
    apiKey: "test-key", retryDelayMs: 5, ...options });
}

test("real HTTP 502 recovery preserves the schedule query and authentication", async t => {
  let calls = 0;
  const observed = [];
  const request = await withServer(t, (req, res) => {
    observed.push({ method: req.method, url: req.url, auth: req.headers.authorization });
    if (++calls === 1) res.writeHead(502).end("proxy error");
    else res.writeHead(200, { "content-type": "application/json" }).end('[{"id":101}]');
  });
  assert.deepEqual(await request("agentech_robot_sessions", "scheduled_end=gte.now&select=id"), [{ id: 101 }]);
  assert.equal(observed.length, 2);
  for (const item of observed) assert.deepEqual(item, { method: "GET",
    url: "/rest/v1/agentech_robot_sessions?scheduled_end=gte.now&select=id", auth: "Bearer test-key" });
});

test("a healthy slow schedule response keeps the original full deadline", async t => {
  const request = await withServer(t, (_req, res) => {
    setTimeout(() => res.writeHead(200).end('[{"id":103}]'), 300);
  }, { timeoutMs: 500 });
  assert.deepEqual(await request("agentech_robot_sessions", "select=id"), [{ id: 103 }]);
});

test("stalled HTTP response bodies cannot exceed the shared retry deadline or poison the next read", async t => {
  let calls = 0;
  let recovered = false;
  const request = await withServer(t, (_req, res) => {
    calls++;
    if (recovered) res.writeHead(200).end('[{"id":102}]');
    else if (calls === 1) res.writeHead(502).end("temporary proxy error");
    else { res.writeHead(200); res.flushHeaders(); res.write('['); }
  }, { timeoutMs: 240 });
  const started = performance.now();
  await assert.rejects(request("agentech_robot_sessions", "select=id"), error => {
    assert.equal(error.category, "timeout");
    assert.equal(error.attempts, 2);
    return true;
  });
  assert.ok(performance.now() - started < 700, "a stalled read must be bounded, including body consumption");
  assert.equal(calls, 2);
  recovered = true;
  assert.deepEqual(await request("agentech_robot_sessions", "select=id"), [{ id: 102 }]);
  assert.equal(calls, 3);
});

test("an HTTP claim that commits before its response is lost executes only once", async t => {
  let claims = 0;
  let receivedBody;
  const request = await withServer(t, (req, res) => {
    let text = "";
    req.on("data", chunk => { text += chunk; });
    req.on("end", () => { claims++; receivedBody = JSON.parse(text); res.writeHead(200); res.flushHeaders(); });
  }, { timeoutMs: 120 });
  await assert.rejects(request("agentech_robot_sessions", "id=eq.101&session_status=eq.scheduled", {
    method: "PATCH", body: { session_status: "running" },
  }), error => error.category === "timeout" && error.attempts === 1);
  assert.equal(claims, 1);
  assert.deepEqual(receivedBody, { session_status: "running" });
});

test("Retry-After longer than the budget fails without an early retry", async () => {
  let calls = 0;
  const request = makeRequest(async () => {
    calls++;
    return new Response("rate limited", { status: 429, headers: { "retry-after": "60" } });
  });
  await assert.rejects(request("agentech_robot_sessions", "select=id"), error => error.httpStatus === 429);
  assert.equal(calls, 1);
});

test("malformed success JSON is reported without leaking or retrying the payload", async () => {
  let calls = 0;
  const request = makeRequest(async () => { calls++; return new Response("private-api-key invalid JSON"); });
  await assert.rejects(request("agentech_robot_sessions", "select=id"), error => {
    assert.equal(error.category, "invalid_response");
    assert.doesNotMatch(error.message, /private-api-key/);
    return true;
  });
  assert.equal(calls, 1);
});

test("successful no-content writes retain their existing result semantics", async () => {
  const request = makeRequest(async () => new Response(null, { status: 204 }));
  assert.equal(await request("agentech_robot_sessions", "id=eq.101", { method: "PATCH", body: { session_status: "completed" } }), null);
});
