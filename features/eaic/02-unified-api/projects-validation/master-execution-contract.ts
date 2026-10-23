import contract from "../../../../scripts/master-command-contract.json";
import type { SoftwareCheckReport } from "./agentech-validation";

type Literal = null | boolean | number | string | Literal[] | { [key: string]: Literal };
type Parameter = { type: string; nullable?: boolean; min?: number; max?: number; values?: string[] };
type Command = { parameters: Record<string, Parameter>; required?: string[]; positional?: string[]; validator?: string };
const commands = contract.commands as Record<string, Command>;
export const masterExecutionCommandNames = Object.freeze(Object.keys(commands));
export const masterExecutionStarterCode = `from agentech import Agentech
Agentech.use("master")
Agentech.enter_stand_hand_guide(side="both")
Agentech.adjust_both_elbows(degrees=5, duration_seconds=2.0)
Agentech.adjust_waist(yaw=2)`;

const armKeys = new Set(["shoulder_pitch", "shoulder_roll", "shoulder_yaw", "elbow", "wrist_yaw", "wrist_pitch", "wrist_roll"]);
const axes = new Set(["roll", "pitch", "yaw"]);
const isObject = (value: Literal): value is Record<string, Literal> => value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: Literal) => typeof value === "number" && Number.isFinite(value);

/** Parses data literals only. No Python evaluation, identifier lookup or attribute execution. */
class LiteralParser {
  index = 0;
  constructor(readonly text: string) {}
  whitespace() { while (/\s/.test(this.text[this.index] ?? "") && this.index < this.text.length) this.index++; }
  value(depth = 0): Literal {
    if (depth > 6) throw new Error("Literal nesting is too deep.");
    this.whitespace();
    const start = this.index;
    const char = this.text[this.index++];
    if (char === '"' || char === "'") {
      let value = "";
      while (this.index < this.text.length) {
        const next = this.text[this.index++];
        if (next === char) return value;
        if (next === "\\") {
          const escaped = this.text[this.index++];
          if (!escaped || !["\\", "'", '"', "n", "r", "t"].includes(escaped)) throw new Error("Unsupported string escape.");
          value += ({ n: "\n", r: "\r", t: "\t" } as Record<string, string>)[escaped] ?? escaped;
        } else value += next;
      }
      throw new Error("Unclosed string literal.");
    }
    if (char === "{" || char === "[") {
      const closing = char === "{" ? "}" : "]";
      const result: Record<string, Literal> = Object.create(null);
      const list: Literal[] = [];
      this.whitespace();
      while (this.text[this.index] !== closing) {
        if (list.length + Object.keys(result).length >= 100) throw new Error("Literal contains too many entries.");
        const value = this.value(depth + 1);
        if (char === "{") {
          if (typeof value !== "string" || ["__proto__", "constructor", "prototype"].includes(value) || Object.hasOwn(result, value)) throw new Error("Map keys must be unique ordinary strings.");
          this.whitespace();
          if (this.text[this.index++] !== ":") throw new Error("Expected a map value.");
          result[value] = this.value(depth + 1);
        } else list.push(value);
        this.whitespace();
        if (this.text[this.index] === closing) break;
        if (this.text[this.index++] !== ",") throw new Error("Expected a comma between literal values.");
        this.whitespace();
      }
      this.index++;
      return char === "{" ? result : list;
    }
    this.index = start;
    const number = this.text.slice(start).match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
    if (number) {
      this.index += number[0].length;
      const value = Number(number[0]);
      if (!Number.isFinite(value)) throw new Error("Numeric literals must be finite.");
      return value;
    }
    for (const [token, value] of [["None", null], ["True", true], ["False", false]] as const) {
      if (this.text.slice(start, start + token.length) === token) { this.index += token.length; return value; }
    }
    throw new Error("Only literal numbers, strings, maps, lists, booleans and None are accepted.");
  }
  arguments(positional: string[]): Record<string, Literal> {
    const result: Record<string, Literal> = Object.create(null);
    let position = 0;
    let sawNamed = false;
    this.whitespace();
    while (this.index < this.text.length) {
      const named = this.text.slice(this.index).match(/^([A-Za-z_]\w*)\s*=/);
      let key: string;
      if (named) { key = named[1]; sawNamed = true; this.index += named[0].length; }
      else {
        if (sawNamed || position >= positional.length) throw new Error("Use supported positional arguments followed by named parameters.");
        key = positional[position++];
      }
      if (Object.hasOwn(result, key)) throw new Error(`Duplicate parameter '${key}'.`);
      result[key] = this.value();
      this.whitespace();
      if (this.index >= this.text.length) break;
      if (this.text[this.index++] !== ",") throw new Error("Expressions and nested calls are not accepted.");
      this.whitespace();
    }
    return result;
  }
}

function sourceStatements(source: string) {
  const statements: Array<{ text: string; line: number }> = [];
  let current = "", quote = "", escaped = false, comment = false, depth = 0, line = 1, startLine = 1;
  for (const char of source + "\n") {
    if (comment && char !== "\n") continue;
    if (!quote && char === "#") { comment = true; continue; }
    if (char === "\n") {
      comment = false;
      if (quote) throw new Error("Multiline string literals are not accepted.");
      if (depth === 0) { if (current.trim()) statements.push({ text: current.trim(), line: startLine }); current = ""; startLine = line + 1; }
      else current += " ";
      line++; continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if ("([{ ".includes(char) && char !== " ") depth++;
    else if (")] }".includes(char) && char !== " ") { depth--; if (depth < 0) throw new Error("Unbalanced command delimiters."); }
    else if (char === ";") throw new Error("Use one SDK command per statement.");
    current += char;
  }
  if (depth !== 0 || quote) throw new Error("Unclosed command or literal.");
  return statements;
}

function validParameter(value: Literal, parameter: Parameter): boolean {
  if (value === null) return parameter.nullable === true;
  if (parameter.values) return typeof value === "string" && parameter.values.includes(value);
  if (parameter.type === "number") return finite(value) && (parameter.min === undefined || Number(value) >= parameter.min) && (parameter.max === undefined || Number(value) <= parameter.max);
  if (parameter.type === "axis") return typeof value === "string" && axes.has(value);
  if (parameter.type === "side") return value === "right" || value === "left";
  if (parameter.type === "guide_side") return value === "both";
  if (parameter.type === "wrist_axis") return finite(value) || (typeof value === "string" && axes.has(value));
  if (parameter.type === "boolean") return typeof value === "boolean";
  if (parameter.type === "arm_map") return isObject(value) && Object.keys(value).length > 0 && Object.entries(value).every(([key, item]) => armKeys.has(key) && finite(item));
  if (parameter.type === "waist_map") return isObject(value) && Object.keys(value).length > 0 && Object.entries(value).every(([key, item]) => axes.has(key) && finite(item));
  if (parameter.type === "torque") {
    const allowed = new Set([...armKeys, ...axes, "right", "left", "right_arm", "left_arm", "both_elbows", "waist", "elbow"]);
    const valid = (item: Literal, depth = 0): boolean => finite(item) || (depth < 3 && isObject(item) && Object.keys(item).length > 0 && Object.entries(item).every(([key, child]) => allowed.has(key) && valid(child, depth + 1)));
    return valid(value);
  }
  return false;
}

function validateArguments(name: string, spec: Command, args: Record<string, Literal>) {
  for (const [key, value] of Object.entries(args)) {
    if (!Object.hasOwn(spec.parameters, key)) throw new Error(`${name}() does not support '${key}'.`);
    if (!validParameter(value, spec.parameters[key])) throw new Error(`${name}() '${key}' has an invalid value for the current SDK contract.`);
  }
  for (const key of spec.required ?? []) if (args[key] === undefined || args[key] === null) throw new Error(`${name}() requires '${key}'.`);
  const has = (key: string) => args[key] !== undefined && args[key] !== null;
  if (has("duration_seconds") && Number(args.duration_seconds) <= 0) throw new Error("duration_seconds must be positive; the SDK enforces its current timing limits.");
  if (spec.validator === "wrist") {
    const scalarAxes = [...axes].filter(has);
    if (scalarAxes.length && (has("axis") || has("degrees"))) throw new Error("Choose axis/degrees or named wrist axes, not both.");
    if (!scalarAxes.length && !has("axis")) throw new Error("Provide a wrist axis or named wrist adjustments.");
    if (typeof args.axis === "string" && !has("degrees")) throw new Error("A named wrist axis requires degrees.");
    if (typeof args.axis === "number" && has("degrees")) throw new Error("A numeric wrist axis supplies the all-axis adjustment itself.");
  }
  if (spec.validator === "waist") {
    const namedAxes = [...axes].filter(has);
    if (namedAxes.length && (has("axis") || has("degrees"))) throw new Error("Choose axis/degrees or named waist axes, not both.");
    if (!namedAxes.length && !(has("axis") && has("degrees"))) throw new Error("Provide axis and degrees or named waist adjustments.");
  }
  if (has("max_duration_seconds") && Number(args.max_duration_seconds) <= 0) throw new Error("max_duration_seconds must be positive.");
  if (has("speed") && Number(args.speed) <= 0) throw new Error("speed must be positive.");
  if (has("maximum_degrees_per_second") && Number(args.maximum_degrees_per_second) <= 0) throw new Error("maximum_degrees_per_second must be positive.");
  if (spec.validator === "elbow_selector") {
    if (has("degrees") === has("position")) throw new Error("Provide exactly one of degrees or position.");
    if (has("speed") && has("duration_seconds")) throw new Error("Choose speed or duration_seconds.");
  }
  if (spec.validator === "upper_body" && !["left_arm", "right_arm", "both_elbows", "waist"].some(has)) throw new Error("Provide at least one upper-body adjustment.");
  if (spec.validator === "upper_body" && has("both_elbows") && (has("left_arm") || has("right_arm"))) throw new Error("both_elbows cannot be combined with arm maps.");
  if (spec.validator === "move_arms" && !["left", "right"].some(has)) throw new Error("Provide at least one arm target map.");
  if (spec.validator === "mirror_targets" && (!isObject(args.targets) || Object.keys(args.targets).length !== armKeys.size || ![...armKeys].every(key => Object.hasOwn(args.targets as object, key)))) throw new Error("Mirrored targets require all seven arm joints.");
}

export function checkMasterExecutionCode(source: string): SoftwareCheckReport {
  const findings: SoftwareCheckReport["findings"] = [];
  const accepted: string[] = [];
  try {
    if (source.length > 64_000) throw new Error("Master programs must be at most 64,000 characters.");
    let setupSeen = false;
    for (const statement of sourceStatements(source)) {
      try {
        if (statement.text === "from agentech import Agentech") {
          if (accepted.length || setupSeen) throw new Error("Put the Agentech import before setup and commands.");
          continue;
        }
        const match = statement.text.match(/^Agentech\.([A-Za-z_]\w*)\s*\(([\s\S]*)\)$/);
        if (!match) throw new Error("Use direct Agentech SDK calls with literal arguments; Python control flow and assignments are not accepted.");
        const [, name, raw] = match;
        if (name === "use") {
          const args = new LiteralParser(raw).arguments(["robot"]);
          if (accepted.length || setupSeen || Object.keys(args).length !== 1 || args.robot !== "master") throw new Error('Setup must be one Agentech.use("master") call before commands.');
          setupSeen = true; continue;
        }
        if (Object.hasOwn(contract.unsupported_commands, name)) throw new Error(`${name}() is unavailable for scheduled live execution in the current SDK deployment.`);
        if (!Object.hasOwn(commands, name)) throw new Error(`${name}() is not enabled for Master's upper-body execution contract. Walking and raw controller calls are excluded.`);
        const spec = commands[name];
        validateArguments(name, spec, new LiteralParser(raw).arguments(spec.positional ?? []));
        accepted.push(name);
      } catch (error) {
        findings.push({ code: "MASTER_CONTRACT_INVALID", line: statement.line, message: error instanceof Error ? error.message : "Invalid Master command." });
      }
    }
    if (!accepted.length) findings.push({ code: "COMMAND_MISSING", message: "Add at least one supported Master upper-body command." });
    if (accepted.length > 200) findings.push({ code: "COMMAND_LIMIT", message: "Master programs support at most 200 commands." });
  } catch (error) { findings.push({ code: "MASTER_SYNTAX_INVALID", message: error instanceof Error ? error.message : "Invalid Master program." }); }
  const status = findings.length ? "FAIL" : "PASS";
  return { status, commands: accepted, findings, checklist: [
    { name: "Master upper-body SDK contract", status, detail: findings.length ? "Correct the listed SDK contract errors." : "Literal upper-body SDK calls passed static validation. Walking is excluded." },
    { name: "Runtime checks", status, detail: "The gateway enters or verifies bilateral raw mode before the first adjustment when entry is omitted, then checks posture, ownership, remaining joint travel, timing and torque limits. Static validation does not establish physical qualification." },
  ] };
}
