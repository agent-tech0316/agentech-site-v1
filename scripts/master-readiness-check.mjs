// A readiness process can outlive a gateway poll. Its completion only records
// evidence; claiming and dispatch remain exclusively in the regular booking loop.
const CHECK_BUDGET_MS = 90000;
const FRESH_MS = 5000;
const RETRY_MS = 5000;

export class MasterReadinessChecks {
  constructor({ now = Date.now, onReady = () => {} } = {}) {
    this.now = now;
    this.onReady = onReady;
    this.entries = new Map();
  }

  discard(id) {
    const entry = this.entries.get(id);
    this.entries.delete(id);
    if (entry?.status === "checking") entry.controller.abort();
  }

  retain(eligibleIds) {
    for (const id of this.entries.keys()) {
      if (!eligibleIds.has(id)) this.discard(id);
    }
  }

  poll({ id, identity, planHash, startMs, endMs, prepareOnly=false }, run) {
    const now = this.now();
    const remaining = endMs - now;
    if (!Number.isFinite(remaining) || remaining <= 0) {
      this.discard(id);
      return { status: "expired" };
    }
    const previous = this.entries.get(id);
    if (previous?.identity === identity) {
      if (previous.status === "checking") return { status: "checking" };
      const age = now - previous.completedAt;
      if (previous.status === "ready" && age >= 0 && age < FRESH_MS) {
        if (prepareOnly) return { status: "prepared" };
        this.entries.delete(id);
        return { status: "ready", expiresAt: Math.min(endMs, previous.completedAt + FRESH_MS) };
      }
      if (prepareOnly && previous.status === "ready" && age >= FRESH_MS &&
          now < startMs - Math.max(FRESH_MS, previous.completedAt - previous.startedAt)) {
        // The first observation finished too early. Start its replacement
        // near opening using the duration observed for this exact check.
        return { status: "waiting" };
      }
      if (previous.status === "failed" && age >= 0 && age < RETRY_MS) {
        return { status: "failed", error: previous.error };
      }
    }
    this.discard(id);
    const entry = { identity, status: "checking", startedAt: now, controller: new AbortController() };
    this.entries.set(id, entry);
    const finish = async () => {
      try {
        const result = await run({ timeoutMs: Math.min(remaining, CHECK_BUDGET_MS), signal: entry.controller.signal });
        if (result?.ready !== true || result.robot_model !== "master" ||
            result.robot_commands_sent !== false || result.plan_sha256 !== planHash) {
          throw new Error("Master readiness result does not match the reviewed plan");
        }
        if (this.entries.get(id) !== entry) return;
        entry.completedAt = this.now();
        entry.status = "ready";
        this.onReady();
      } catch (error) {
        if (this.entries.get(id) !== entry) return;
        entry.status = "failed";
        entry.completedAt = this.now();
        entry.error = error.message;
      }
    };
    void finish();
    return { status: "checking" };
  }
}
