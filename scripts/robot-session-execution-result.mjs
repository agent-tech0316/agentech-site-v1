const OUTCOMES = new Set(["completed", "failed"]);
const COMMAND_STATUSES = new Set(["completed", "failed"]);
const SHA256 = /^[0-9a-f]{64}$/;
const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_MAX_COMMANDS = 256;


export function buildExecutionResultPatch(item, updatedAt = new Date().toISOString()) {
  return {
    execution_result: item.executionResult ?? null,
    execution_error: item.executionResultError ?? null,
    execution_updated_at: updatedAt,
  };
}


export function parseExecutionResult(
  text,
  expected,
  { maxBytes = DEFAULT_MAX_BYTES, maxCommands = DEFAULT_MAX_COMMANDS } = {},
) {
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("execution result is missing valid JSON");
  }
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new Error("execution result size exceeds the allowed bytes");
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("execution result is not valid JSON");
  }
  if (!isObject(value)) throw new Error("execution result must be a JSON object");
  if (value.schema_version !== 1) throw new Error("execution result schema is unsupported");
  if (!OUTCOMES.has(value.outcome)) throw new Error("execution result outcome is invalid");

  const expectedSessionId = String(expected?.sessionId ?? "");
  if (String(value.session_id ?? "") !== expectedSessionId) {
    throw new Error("execution result session identity does not match");
  }
  if (value.submission_id !== expected?.submissionId) {
    throw new Error("execution result submission identity does not match");
  }
  if (!SHA256.test(value.source_sha256 ?? "") || value.source_sha256 !== expected?.sourceSha256) {
    throw new Error("execution result source hash does not match");
  }
  if (!SHA256.test(value.plan_sha256 ?? "")) {
    throw new Error("execution result plan hash is invalid");
  }
  if (!SHA256.test(expected?.planSha256 ?? "") || value.plan_sha256 !== expected.planSha256) {
    throw new Error("execution result plan hash does not match the staged plan");
  }
  validateTimestamp(value.started_at, "started_at");
  validateTimestamp(value.finished_at, "finished_at");
  if (Date.parse(value.finished_at) < Date.parse(value.started_at)) {
    throw new Error("execution result timestamps are out of order");
  }

  if (!count(value.command_count) || value.command_count > maxCommands) {
    throw new Error("execution result command count is invalid");
  }
  if (!count(value.completed_count) || value.completed_count > value.command_count) {
    throw new Error("execution result completed count is invalid");
  }
  if (!Array.isArray(value.commands) || value.commands.length > value.command_count) {
    throw new Error("execution result command records count is invalid");
  }

  const commands = value.commands.map(normalizeCommand);
  const actualCompleted = commands.filter((command) => command.status === "completed").length;
  if (actualCompleted !== value.completed_count) {
    throw new Error("execution result completed count does not match command records");
  }
  commands.forEach((command, index) => {
    if (command.command_index !== index + 1) {
      throw new Error("execution result command indexes are not contiguous");
    }
  });

  let error = null;
  if (value.outcome === "completed") {
    if (value.completed_count !== value.command_count || commands.length !== value.command_count) {
      throw new Error("completed execution result has incomplete command counts");
    }
    if (commands.some((command) => command.status !== "completed") || value.error !== null) {
      throw new Error("completed execution result cannot contain a failure or error");
    }
  } else {
    error = normalizeError(value.error, "failed execution result");
    if (commands.length > 0 && commands.at(-1).status === "completed" && value.completed_count === value.command_count) {
      // A cleanup failure can occur after every planned command completed.
      if (error.command !== "stop" && !(value.robot_model === "master" && error.command === "verify_master_hold")) {
        throw new Error("failed execution result does not identify a failed command or cleanup");
      }
    }
    const firstFailure = commands.findIndex((command) => command.status === "failed");
    if (firstFailure >= 0 && commands.slice(firstFailure + 1).length > 0) {
      throw new Error("execution result continued after the first failed command");
    }
  }

  return {
    schema_version: 1,
    outcome: value.outcome,
    session_id: expectedSessionId,
    submission_id: value.submission_id,
    source_sha256: value.source_sha256,
    plan_sha256: value.plan_sha256,
    robot_model: typeof value.robot_model === "string" ? value.robot_model.slice(0, 40) : null,
    device_profile: isObject(value.device_profile) ? value.device_profile : null,
    command_count: value.command_count,
    completed_count: value.completed_count,
    started_at: value.started_at,
    finished_at: value.finished_at,
    commands,
    error,
    diary_path: typeof value.diary_path === "string" ? value.diary_path.slice(0, 1000) : null,
  };
}


function normalizeCommand(command, index) {
  if (!isObject(command)) throw new Error(`execution command ${index + 1} must be an object`);
  if (!Number.isInteger(command.command_index) || command.command_index < 1) {
    throw new Error(`execution command ${index + 1} has an invalid index`);
  }
  if (typeof command.name !== "string" || !command.name) {
    throw new Error(`execution command ${index + 1} has an invalid name`);
  }
  if (!isObject(command.args) || !isObject(command.source_args)) {
    throw new Error(`execution command ${index + 1} has invalid arguments`);
  }
  if (command.line !== null && (!Number.isInteger(command.line) || command.line < 1)) {
    throw new Error(`execution command ${index + 1} has an invalid source line`);
  }
  if (!COMMAND_STATUSES.has(command.status)) {
    throw new Error(`execution command ${index + 1} has an invalid status`);
  }
  if (typeof command.duration_ms !== "number" || !Number.isFinite(command.duration_ms) || command.duration_ms < 0) {
    throw new Error(`execution command ${index + 1} has an invalid duration`);
  }
  if (command.started_at !== undefined) validateTimestamp(command.started_at, `command ${index + 1} started_at`);
  const error = command.status === "failed"
    ? normalizeError(command.error, `execution command ${index + 1}`)
    : null;
  if (command.status === "completed" && command.error !== null) {
    throw new Error(`completed execution command ${index + 1} cannot include an error`);
  }
  return {
    command_index: command.command_index,
    name: command.name.slice(0, 120),
    args: command.args,
    source_args: command.source_args,
    line: command.line ?? null,
    status: command.status,
    result: command.result ?? null,
    error,
    started_at: command.started_at ?? null,
    duration_ms: command.duration_ms,
  };
}


function normalizeError(value, context) {
  if (!isObject(value) || typeof value.type !== "string" || typeof value.message !== "string") {
    throw new Error(`${context} requires a structured error`);
  }
  const normalized = {
    type: value.type.slice(0, 120),
    message: value.message.slice(0, 4000),
  };
  for (const key of ["command", "capability", "reason", "device"]) {
    if (value[key] !== undefined) normalized[key] = String(value[key]).slice(0, 1000);
  }
  for (const key of ["command_index", "line"]) {
    if (value[key] !== undefined) {
      if (!Number.isInteger(value[key]) || value[key] < 1) {
        throw new Error(`${context} has an invalid ${key}`);
      }
      normalized[key] = value[key];
    }
  }
  return normalized;
}


function validateTimestamp(value, field) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`execution result ${field} is invalid`);
  }
}


function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}


function count(value) {
  return Number.isInteger(value) && value >= 0;
}
