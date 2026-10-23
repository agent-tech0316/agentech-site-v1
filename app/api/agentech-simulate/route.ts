import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { normalizeAgentechRobotModel, type AgentechRobotModel } from "@/lib/agentech-robot-model";
import { validateAgentechCode } from "@/lib/agentech-validation";

type LocalSimulator = {
  root: string;
  adapter: string;
  timeoutMs: number;
};

const simulatorsRoot = path.resolve(process.cwd(), "simulators");
const localSimulators: Record<Exclude<AgentechRobotModel, "Master">, LocalSimulator> = {
  Aegies: {
    root: path.join(simulatorsRoot, "aegis"),
    adapter: "web_adapter.py",
    timeoutMs: 20_000
  },
  Navi: {
    root: path.join(simulatorsRoot, "navi"),
    adapter: "web_adapter.py",
    timeoutMs: 50_000
  }
};
const simulationCache = new Map<string, { createdAt: number; payload: unknown }>();
const cacheTtlMs = 5 * 60 * 1000;
const remoteSimulatorUrl = process.env.AGENTECH_SIMULATOR_URL;
const simulatorPython = process.env.AGENTECH_SIMULATOR_PYTHON || "python";

function numberArg(args: string, name: string) {
  const match = args.match(new RegExp(`${name}\\s*=\\s*([-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][-+]?\\d+)?)`));
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function turnLevelRateDeg(level: number) {
  return (level / 511) * 3 * 180 / Math.PI;
}

function signedTurnRateRad(args: string) {
  const rateRad = numberArg(args, "turn_rate_rad_s");
  if (rateRad !== null) return rateRad;
  const rateDeg = numberArg(args, "turn_rate_deg_s");
  if (rateDeg !== null) return rateDeg * Math.PI / 180;
  const percent = numberArg(args, "rate_percentage");
  if (percent !== null) return 3 * percent / 100;
  const level = numberArg(args, "turn_level");
  if (level !== null) return turnLevelRateDeg(level) * Math.PI / 180;
  return 2;
}

function signedTurnAngleDeg(args: string) {
  const angleRad = numberArg(args, "angle_rad");
  if (angleRad !== null) return angleRad * 180 / Math.PI;
  const angleDeg = numberArg(args, "angle_deg");
  if (angleDeg !== null) return angleDeg;
  const duration = numberArg(args, "duration_s");
  if (duration !== null) return duration * signedTurnRateRad(args) * 180 / Math.PI;
  return 45;
}

function normalizeCanonicalTurnsForMuJoCo(code: string) {
  const aliasSpeed = 2;
  return code
    .replace(/((?:Agentech|dog))\.turn_right\(\s*\)/g, `$1.turn_right(angle=90, speed=${aliasSpeed})`)
    .replace(/((?:Agentech|dog))\.turn_left\(\s*\)/g, `$1.turn_left(angle=90, speed=${aliasSpeed})`)
    .replace(/((?:Agentech|dog))\.u_turn\(\s*\)/g, `$1.turn_left(angle=180, speed=${aliasSpeed})`)
    .replace(/((?:Agentech|dog))\.yaw\(([^)]*)\)/g, (_match, owner: string, args: string) => {
      const positionRad = numberArg(args, "position_rad");
      const signedPositionDeg = positionRad !== null ? positionRad * 180 / Math.PI : 25.36;
      const direction = signedPositionDeg > 0 ? "right" : "left";
      return `${owner}.twist_${direction}(angle=${Math.abs(signedPositionDeg)})`;
    })
    .replace(/((?:Agentech|dog))\.pitch\(([^)]*)\)/g, (_match, owner: string, args: string) => {
      const positionRad = numberArg(args, "position_rad");
      const signedPositionDeg = positionRad !== null ? positionRad * 180 / Math.PI : 22.98;
      const direction = signedPositionDeg < 0 ? "down" : "up";
      return `${owner}.look_${direction}(angle=${Math.abs(signedPositionDeg)})`;
    })
    .replace(/((?:Agentech|dog))\.roll\(([^)]*)\)/g, "$1.stand()")
    .replace(/((?:Agentech|dog))\.stay\(([^)]*)\)/g, "$1.stand()")
    .replace(/((?:Agentech|dog))\.turn\(([^)]*)\)/g, (_match, owner: string, args: string) => {
      const signedAngle = signedTurnAngleDeg(args);
      const signedRate = signedTurnRateRad(args);
      const direction = (signedAngle || signedRate) < 0 ? "left" : "right";
      const angle = Math.abs(signedAngle);
      const speed = Math.abs(signedRate) || 0.35;
      return `${owner}.turn_${direction}(angle=${angle}, speed=${speed})`;
    });
}

function remoteSimulatorEndpoint() {
  if (!remoteSimulatorUrl) return null;
  const endpoint = new URL(remoteSimulatorUrl);
  if (endpoint.pathname === "/" || endpoint.pathname === "") {
    endpoint.pathname = "/simulate";
  }
  return endpoint;
}

async function runRemoteSimulator(code: string, robotModel: AgentechRobotModel) {
  const endpoint = remoteSimulatorEndpoint();
  if (!endpoint) {
    return null;
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      robot_model: robotModel,
      max_render_frames: 32,
      render_width: 480,
      render_height: 320
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload === null) {
    const message = payload?.error ?? payload?.detail ?? `Remote simulator failed with status ${response.status}.`;
    throw new Error(message);
  }
  return payload;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  const robotModel = normalizeAgentechRobotModel(body?.robotModel ?? body?.robot_model ?? "Aegies");

  if (!code.trim()) {
    return NextResponse.json({ error: "No Agentech code provided." }, { status: 400 });
  }
  if (!robotModel) {
    return NextResponse.json({ error: "Choose Aegies, Navi or Master." }, { status: 400 });
  }

  const validationErrors = validateAgentechCode(code, robotModel);
  if (validationErrors.length) {
    return NextResponse.json({ error: validationErrors.join(" ") }, { status: 400 });
  }

  if (robotModel === "Master") {
    return NextResponse.json({
      error: "Master upper-body code passed static validation. This route has no qualified Master physics simulation; use Code Certification and the scheduled gateway's runtime checks.",
      errorCode: "MASTER_SIMULATION_UNAVAILABLE", staticValidationPassed: true,
      simulationPassed: false, physicalQualified: false, runtimeChecksRequired: true,
    }, { status: 422 });
  }

  const simulatorCode = robotModel === "Navi" ? code : normalizeCanonicalTurnsForMuJoCo(code);
  const cacheKey = crypto
    .createHash("sha1")
    .update(`agentech-sim-v15:${robotModel}:${simulatorCode}`)
    .digest("hex");
  const cached = simulationCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < cacheTtlMs) {
    return NextResponse.json({ ...(cached.payload as object), cached: true });
  }

  if (remoteSimulatorUrl) {
    try {
      const payload = await runRemoteSimulator(simulatorCode, robotModel);
      if (payload !== null) {
        simulationCache.set(cacheKey, { createdAt: Date.now(), payload });
        return NextResponse.json(payload);
      }
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Remote simulator failed." },
        { status: 502 }
      );
    }
  }

  const localSimulator = localSimulators[robotModel];
  const simulatorRoot = localSimulator.root;
  const simulatorScript = path.join(simulatorRoot, localSimulator.adapter);
  if (!fs.existsSync(simulatorScript)) {
    return NextResponse.json(
      {
        error: `${robotModel} MuJoCo runtime is missing from simulators/${robotModel === "Navi" ? "navi" : "aegis"}.`
      },
      { status: 503 }
    );
  }

  const result = await new Promise<{ status: number; stdout: string; stderr: string; timedOut?: boolean }>((resolve) => {
    const child = spawn(simulatorPython, [path.relative(simulatorRoot, simulatorScript)], {
      cwd: simulatorRoot,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (status: number, timedOut = false) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({ status, stdout, stderr, timedOut });
    };
    const timeout = setTimeout(() => {
      stderr += `Simulation timed out after ${localSimulator.timeoutMs / 1000}s.`;
      child.kill("SIGKILL");
      finish(124, true);
    }, localSimulator.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      stderr += error.message;
      finish(1);
    });
    child.on("close", (status) => {
      finish(status ?? 1);
    });
    child.stdin.end(JSON.stringify({
      code: simulatorCode,
      robot_model: robotModel,
      max_render_frames: 32,
      render_width: 480,
      render_height: 320
    }));
  });

  if (result.status !== 0) {
    return NextResponse.json(
      { error: result.stderr || result.stdout || "Simulation failed." },
      { status: result.timedOut ? 504 : 500 }
    );
  }

  try {
    const payload = JSON.parse(result.stdout);
    simulationCache.set(cacheKey, { createdAt: Date.now(), payload });
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: "Simulation returned invalid output." }, { status: 500 });
  }
}
