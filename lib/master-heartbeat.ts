export type BatteryTelemetry = {
  available: boolean;
  percent: number | null;
  voltage: number | null;
  charging: boolean | null;
  sourceTopic: string | null;
};

export type MasterControllerTelemetry = {
  host: "192.168.4.152";
  controllerResponsive: boolean;
  connection: string | null;
  posture: string | null;
  action: string | null;
  state: string | null;
};

export type MasterHeartbeatObservation = {
  schemaVersion: 1;
  gatewayId: "agentech01";
  observedAt: string;
  master: MasterControllerTelemetry;
  battery: BatteryTelemetry;
};

export type HeartbeatCondition = "online" | "controller-offline" | "stale" | "unavailable";

export type MasterHeartbeatResponse = {
  schemaVersion: 1;
  gatewayId: "agentech01";
  condition: HeartbeatCondition;
  fresh: boolean;
  ageMs: number | null;
  observedAt: string | null;
  receivedAt: string | null;
  master: MasterControllerTelemetry | null;
  battery: BatteryTelemetry | null;
};

const OBSERVATION_KEYS = ["schemaVersion", "gatewayId", "observedAt", "master", "battery"] as const;
const MASTER_KEYS = ["host", "controllerResponsive", "connection", "posture", "action", "state"] as const;
const BATTERY_KEYS = ["available", "percent", "voltage", "charging", "sourceTopic"] as const;
const MAX_CLOCK_SKEW_MS = 30_000;
// The PC checks availability hourly. Allow five minutes for a delayed report.
const FRESH_FOR_MS = 65 * 60_000;
const PACIFIC_HOUR = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23",
});

function reportingAgeMs(receivedAt: Date, now: Date): number {
  let age = 0;
  let cursor = receivedAt.getTime();
  const end = now.getTime();
  // Pacific quiet hours are 10 pm–8 am. UTC hour boundaries also handle the
  // skipped/repeated daylight-saving hour without assuming a fixed UTC offset.
  while (cursor < end && age < FRESH_FOR_MS) {
    const next = Math.min(end, (Math.floor(cursor / 3_600_000) + 1) * 3_600_000);
    const hour = Number(PACIFIC_HOUR.format(new Date(cursor)));
    if (hour >= 8 && hour < 22) age += next - cursor;
    cursor = next;
  }
  return age;
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownFields(
  record: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
) {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) throw new TypeError(`${path} has unknown field: ${key}`);
  }
  for (const key of allowed) {
    if (!(key in record)) throw new TypeError(`${path}.${key} is required`);
  }
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${path} must be boolean`);
  return value;
}

function requireNullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${path} must be a non-empty string or null`);
  }
  return value;
}

function requireNullableBoolean(value: unknown, path: string): boolean | null {
  if (value === null) return null;
  return requireBoolean(value, path);
}

function requireNullableFiniteNumber(
  value: unknown,
  path: string,
  options: { min?: number; max?: number; positive?: boolean } = {},
): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${path} must be a finite number or null`);
  }
  if (options.positive && value <= 0) throw new RangeError(`${path} must be positive`);
  if (options.min !== undefined && value < options.min) throw new RangeError(`${path} is below its minimum`);
  if (options.max !== undefined && value > options.max) throw new RangeError(`${path} is above its maximum`);
  return value;
}

function parseMaster(value: unknown): MasterControllerTelemetry {
  const master = requireRecord(value, "master");
  rejectUnknownFields(master, MASTER_KEYS, "master");
  if (master.host !== "192.168.4.152") {
    throw new TypeError("master.host must be 192.168.4.152");
  }
  return {
    host: "192.168.4.152",
    controllerResponsive: requireBoolean(master.controllerResponsive, "master.controllerResponsive"),
    connection: requireNullableString(master.connection, "master.connection"),
    posture: requireNullableString(master.posture, "master.posture"),
    action: requireNullableString(master.action, "master.action"),
    state: requireNullableString(master.state, "master.state"),
  };
}

function parseBattery(value: unknown): BatteryTelemetry {
  const battery = requireRecord(value, "battery");
  rejectUnknownFields(battery, BATTERY_KEYS, "battery");
  const available = requireBoolean(battery.available, "battery.available");
  const parsed: BatteryTelemetry = {
    available,
    percent: requireNullableFiniteNumber(battery.percent, "battery.percent", { min: 0, max: 100 }),
    voltage: requireNullableFiniteNumber(battery.voltage, "battery.voltage", { positive: true }),
    charging: requireNullableBoolean(battery.charging, "battery.charging"),
    sourceTopic: requireNullableString(battery.sourceTopic, "battery.sourceTopic"),
  };
  if (!available && Object.entries(parsed).some(([key, entry]) => key !== "available" && entry !== null)) {
    throw new TypeError("unavailable battery values must all be null");
  }
  if (available && parsed.sourceTopic === null) {
    throw new TypeError("battery.sourceTopic is required when battery is available");
  }
  return parsed;
}

export function parseMasterHeartbeatObservation(
  value: unknown,
  now = new Date(),
): MasterHeartbeatObservation {
  const observation = requireRecord(value, "heartbeat");
  rejectUnknownFields(observation, OBSERVATION_KEYS, "heartbeat");
  if (observation.schemaVersion !== 1) throw new TypeError("schemaVersion must be 1");
  if (observation.gatewayId !== "agentech01") throw new TypeError("gatewayId must be agentech01");
  if (typeof observation.observedAt !== "string") throw new TypeError("observedAt must be an ISO timestamp");
  const observedAtMs = Date.parse(observation.observedAt);
  if (!Number.isFinite(observedAtMs) || Math.abs(observedAtMs - now.getTime()) > MAX_CLOCK_SKEW_MS) {
    throw new RangeError("observedAt must be within 30 seconds of server time");
  }
  return {
    schemaVersion: 1,
    gatewayId: "agentech01",
    observedAt: observation.observedAt,
    master: parseMaster(observation.master),
    battery: parseBattery(observation.battery),
  };
}

export function toMasterHeartbeatResponse(
  observation: MasterHeartbeatObservation,
  receivedAt: Date,
  now = new Date(),
): MasterHeartbeatResponse {
  const ageMs = Math.max(0, now.getTime() - receivedAt.getTime());
  const fresh = reportingAgeMs(receivedAt, now) < FRESH_FOR_MS;
  const condition: HeartbeatCondition = !fresh
    ? "stale"
    : observation.master.controllerResponsive
      ? "online"
      : "controller-offline";
  return {
    schemaVersion: 1,
    gatewayId: "agentech01",
    condition,
    fresh,
    ageMs,
    observedAt: observation.observedAt,
    receivedAt: receivedAt.toISOString(),
    master: observation.master,
    battery: observation.battery,
  };
}

export function unavailableMasterHeartbeatResponse(_now = new Date()): MasterHeartbeatResponse {
  return {
    schemaVersion: 1,
    gatewayId: "agentech01",
    condition: "unavailable",
    fresh: false,
    ageMs: null,
    observedAt: null,
    receivedAt: null,
    master: null,
    battery: null,
  };
}

export function toMasterHeartbeatView(response: MasterHeartbeatResponse) {
  const unavailable = response.condition === "unavailable" || !response.master;
  const gateway = unavailable ? "Unavailable" : response.fresh ? "Online" : "Offline";
  const availability = !unavailable && response.fresh && response.master?.controllerResponsive
    ? "Available"
    : "Unavailable";
  let lastUpdate = "No heartbeat received";
  if (response.ageMs !== null) {
    const seconds = Math.floor(response.ageMs / 1000);
    lastUpdate = seconds < 1
      ? "Just now"
      : seconds < 60 ? `${seconds}s ago`
        : seconds < 3600 ? `${Math.floor(seconds / 60)}m ago`
          : `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ago`;
  }
  return {
    gateway,
    availability,
    lastUpdate,
    tone: response.condition,
  };
}
