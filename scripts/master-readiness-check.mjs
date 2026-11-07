// A readiness process can outlive a gateway poll. Its completion only records
// evidence; claiming and dispatch remain exclusively in the regular booking loop.
const CHECK_BUDGET_MS = 90000;
const FRESH_MS = 5000;
const RETRY_MS = 5000;
const OPENING_MARGIN_MS = 2000;

export class MasterReadinessChecks {
  constructor({ now = Date.now, onReady = () => {}, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.now = now;
    this.onReady = onReady;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.entries = new Map();
    this.inFlight = null;
  }

  discard(id) {
    const entry = this.entries.get(id);
    this.entries.delete(id);
    if (entry?.timer != null) this.clearTimer(entry.timer);
    if (entry?.status === "checking") entry.controller.abort();
  }

  wakeAt(id, entry, when) {
    if (entry.wakeAt === when) return;
    if (entry.timer != null) this.clearTimer(entry.timer);
    entry.wakeAt = when;
    entry.timer = this.setTimer(() => {
      if (this.entries.get(id) !== entry || entry.wakeAt !== when) return;
      entry.timer = null;
      entry.wakeAt = null;
      this.onReady(); // Wake the normal cloud/OBS/booking tick. This timer cannot claim or dispatch.
    }, Math.max(0, when - this.now()));
    entry.timer?.unref?.();
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
      const beforeOpening = prepareOnly && now < startMs;
      const usableAtOpening = previous.completedAt + FRESH_MS > startMs + OPENING_MARGIN_MS;
      if (previous.status === "ready" && age >= 0 && age < FRESH_MS && (!beforeOpening || usableAtOpening)) {
        if (beforeOpening) this.wakeAt(id, previous, startMs);
        if (prepareOnly) return { status: "prepared" };
        if (this.inFlight) return { status: "checking" };
        this.discard(id);
        return { status: "ready", expiresAt: Math.min(endMs, previous.completedAt + FRESH_MS) };
      }
      if (beforeOpening && age >= 0) {
        // This measurement estimates cost only. The actual replacement must
        // still finish inside the same five-second admission freshness limit.
        const measuredCost = Math.max(1000, previous.completedAt - previous.startedAt);
        const refreshAt = startMs - measuredCost - OPENING_MARGIN_MS;
        const earliestRetry = previous.status === "failed" ? previous.completedAt + RETRY_MS : now;
        const nextCheck = Math.max(refreshAt, earliestRetry);
        if (now < nextCheck) {
          this.wakeAt(id, previous, Math.min(nextCheck, startMs));
          return { status: "waiting" };
        }
      }
      if (previous.status === "failed" && age >= 0 && age < RETRY_MS) {
        return { status: "failed", error: previous.error };
      }
    }
    this.discard(id);
    // Aborting a superseded check asks its subprocess to stop; it does not
    // prove it exited. Never open another readiness client until it settles.
    if (this.inFlight) return { status: "checking" };
    const entry = { identity, status: "checking", startedAt: now, controller: new AbortController() };
    this.entries.set(id, entry);
    this.inFlight = entry;
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
      } catch (error) {
        if (this.entries.get(id) !== entry) return;
        entry.status = "failed";
        entry.completedAt = this.now();
        entry.error = error.message;
      } finally {
        this.inFlight = null;
        if (this.entries.get(id) === entry && entry.status === "ready") this.onReady();
      }
    };
    void finish();
    return { status: "checking" };
  }
}
