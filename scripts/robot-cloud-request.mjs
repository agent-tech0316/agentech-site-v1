import { setTimeout as delay } from "node:timers/promises";

const transientStatuses = new Set([408, 429, 502, 503, 504]);

export class GatewayCloudRequestError extends Error {
  constructor(details) {
    super(`${details.timestamp} Supabase ${details.operation} failed: ${details.category}`
      + (details.httpStatus ? ` HTTP ${details.httpStatus}` : "")
      + ` after ${details.attempts} attempt(s), ${details.elapsedMs}ms`);
    this.name = "GatewayCloudRequestError";
    Object.assign(this, details);
  }
}

// One eight-second total budget, including response bodies and a single safe
// read retry. Never replay a write: a timed-out claim may already have committed.
export function createGatewayCloudRequest({
  baseUrl, apiKey, fetchImpl = fetch, timeoutMs = 8000, retryDelayMs = 150,
  onDiagnostic = () => {},
}) {
  const base = new URL(baseUrl).href.replace(/\/$/, "");
  if (!Number.isFinite(timeoutMs) || timeoutMs < 2 || !Number.isFinite(retryDelayMs) || retryDelayMs < 0) {
    throw new TypeError("Invalid cloud request deadline");
  }
  return async function request(table, query, options = {}) {
    if (!/^[a-z][a-z0-9_]*$/i.test(table)) throw new TypeError("Invalid cloud table");
    const method = String(options.method || "GET").toUpperCase();
    if (!["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"].includes(method)) throw new TypeError("Invalid cloud method");
    const safeRead = method === "GET" || method === "HEAD";
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    const started = performance.now();
    const deadline = started + timeoutMs;
    const maxAttempts = safeRead ? 2 : 1;
    const operation = `${method} ${table}`;
    const details = (attempts, extra = {}) => ({
      timestamp: new Date().toISOString(), operation, attempts,
      elapsedMs: Math.round(performance.now() - started), ...extra,
    });
    const report = event => {
      // A diagnostic sink must not change the result of an authorized request.
      try { onDiagnostic(event); } catch {}
    };
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const remaining = Math.max(1, Math.floor(deadline - performance.now()));
      // Preserve the full allowance for a healthy but slow first response.
      // Only retry failures that leave time; a fully exhausted deadline is
      // reported and the next polling cycle starts a new read normally.
      const signal = AbortSignal.timeout(remaining);
      let httpStatus;
      let retryAfterMs = retryDelayMs;
      try {
        const response = await fetchImpl(`${base}/rest/v1/${table}?${query}`, {
          signal, method, body,
          headers: {
            apikey: apiKey, Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json", Prefer: options.prefer || "return=representation",
          },
        });
        if (!response.ok) {
          httpStatus = response.status;
          const retryAfter = response.headers.get("retry-after");
          if (retryAfter) {
            const seconds = Number(retryAfter);
            const waitMs = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
            if (Number.isFinite(waitMs)) retryAfterMs = Math.max(retryDelayMs, waitMs);
          }
          // Discard upstream content: it may contain credentials, account data,
          // or an HTML proxy error. Status and operation are sufficient here.
          await response.body?.cancel();
          throw new Error("Cloud HTTP failure");
        }
        const text = response.status === 204 || method === "HEAD" ? "" : await response.text();
        const result = text ? JSON.parse(text) : null;
        if (attempt > 1) report(details(attempt, { event: "recovered" }));
        return result;
      } catch (error) {
        const category = httpStatus ? "http"
          : signal.aborted || error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout"
            : error instanceof SyntaxError ? "invalid_response" : "network";
        const failure = new GatewayCloudRequestError(details(attempt, { category, ...(httpStatus ? { httpStatus } : {}) }));
        const retryable = httpStatus ? transientStatuses.has(httpStatus) : category === "timeout" || category === "network";
        if (!safeRead || attempt === maxAttempts || !retryable || deadline - performance.now() <= retryAfterMs + 1) {
          throw failure;
        }
        report(details(attempt, { event: "retry", category, ...(httpStatus ? { httpStatus } : {}) }));
        await delay(retryAfterMs);
      }
    }
  };
}
