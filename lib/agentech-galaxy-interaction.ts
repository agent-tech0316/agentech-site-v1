export type GalaxyPerformanceTier = "phone" | "tablet" | "desktop" | "reduced";

export type GalaxyPerformanceProfile = {
  tier: GalaxyPerformanceTier;
  dpr: number;
  particleCount: number;
};

export type GalaxyInteractionPhase =
  | "idle"
  | "assembling"
  | "assembled"
  | "releasing"
  | "reduced";

export type GalaxyInteractionSnapshot = {
  progress: number;
  phase: GalaxyInteractionPhase;
};

export type GalaxyPointerRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type GalaxyPointerEllipse = {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
};

export type GalaxyPointerIntent = "assemble" | "release";

const ASSEMBLE_DURATION_MS = 2_200;
const RELEASE_DURATION_MS = 1_400;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function isPointInsideRect(
  point: { x: number; y: number },
  rect: GalaxyPointerRect,
  tolerance: number,
) {
  const padding = Math.max(0, tolerance);
  return (
    point.x >= rect.left - padding
    && point.x <= rect.right + padding
    && point.y >= rect.top - padding
    && point.y <= rect.bottom + padding
  );
}

export function isPointInsideGalaxyPointerEllipse(
  point: { x: number; y: number },
  ellipse: GalaxyPointerEllipse,
  tolerance = 0,
) {
  const padding = Math.max(0, tolerance);
  const radiusX = Math.max(1, ellipse.radiusX + padding);
  const radiusY = Math.max(1, ellipse.radiusY + padding);
  const dx = point.x - ellipse.centerX;
  const dy = point.y - ellipse.centerY;
  const cosine = Math.cos(ellipse.rotation);
  const sine = Math.sin(ellipse.rotation);
  const localX = dx * cosine + dy * sine;
  const localY = -dx * sine + dy * cosine;
  return (localX * localX) / (radiusX * radiusX) + (localY * localY) / (radiusY * radiusY) <= 1;
}

export function getGalaxyPointerIntent({
  point,
  initialBounds,
  formationBounds,
  galaxyBounds,
  galaxyEntryArmed = false,
  phase,
  progress,
  tolerance = 0,
}: {
  point: { x: number; y: number };
  initialBounds: GalaxyPointerRect;
  formationBounds: GalaxyPointerRect;
  galaxyBounds?: GalaxyPointerEllipse;
  galaxyEntryArmed?: boolean;
  phase: GalaxyInteractionPhase;
  progress: number;
  tolerance?: number;
}): GalaxyPointerIntent {
  const insideInitial = isPointInsideRect(point, initialBounds, tolerance);
  const insideFormation = isPointInsideRect(point, formationBounds, tolerance);
  const insideGalaxy = galaxyBounds
    ? isPointInsideGalaxyPointerEllipse(point, galaxyBounds, tolerance)
    : false;

  if (phase === "idle" || progress <= 0) {
    return insideInitial || (galaxyEntryArmed && insideGalaxy) ? "assemble" : "release";
  }
  if (phase === "assembling") return insideInitial || insideFormation || insideGalaxy ? "assemble" : "release";
  if (phase === "releasing") return insideFormation ? "assemble" : "release";
  return insideFormation ? "assemble" : "release";
}

export function getGalaxyPerformanceProfile({
  width,
  devicePixelRatio,
  reducedMotion,
}: {
  width: number;
  height: number;
  devicePixelRatio: number;
  reducedMotion: boolean;
}): GalaxyPerformanceProfile {
  if (reducedMotion) {
    return { tier: "reduced", dpr: 1.5, particleCount: 2400 };
  }

  if (width <= 430) {
    return {
      tier: "phone",
      dpr: Math.min(Math.max(devicePixelRatio, 1), 2),
      particleCount: 3_600,
    };
  }

  if (width < 1024) {
    return {
      tier: "tablet",
      dpr: Math.min(Math.max(devicePixelRatio, 1), 1.75),
      particleCount: 5_200,
    };
  }

  return {
    tier: "desktop",
    dpr: Math.min(Math.max(devicePixelRatio, 1), 1.75),
    particleCount: 7_200,
  };
}

export function createGalaxyInteractionController({
  now,
  reducedMotion = false,
}: {
  now: () => number;
  reducedMotion?: boolean;
}) {
  let progress = 0;
  let phase: GalaxyInteractionPhase = reducedMotion ? "reduced" : "idle";
  let transitionStartedAt = 0;
  let transitionDuration = 1;
  let transitionFrom = 0;
  let transitionTo = 0;

  const snapshot = (): GalaxyInteractionSnapshot => ({ progress, phase });

  const advance = (currentTime: number) => {
    if (phase !== "assembling" && phase !== "releasing") return;

    const elapsed = currentTime - transitionStartedAt;
    const transitionProgress = smoothstep(elapsed / transitionDuration);
    progress = transitionFrom + (transitionTo - transitionFrom) * transitionProgress;

    if (elapsed < transitionDuration) return;
    progress = transitionTo;
    phase = transitionTo === 1 ? "assembled" : "idle";
  };

  return {
    snapshot,

    enterHover() {
      if (reducedMotion) {
        progress = 1;
        phase = "reduced";
        return snapshot();
      }

      const currentTime = now();
      advance(currentTime);
      if (progress >= 1) {
        phase = "assembled";
        return snapshot();
      }

      transitionFrom = progress;
      transitionTo = 1;
      transitionStartedAt = currentTime;
      transitionDuration = Math.max(1, ASSEMBLE_DURATION_MS * (1 - progress));
      phase = "assembling";
      return snapshot();
    },

    leaveHover() {
      if (reducedMotion) {
        progress = 0;
        phase = "reduced";
        return snapshot();
      }

      const currentTime = now();
      advance(currentTime);
      if (progress <= 0) {
        phase = "idle";
        return snapshot();
      }

      transitionFrom = progress;
      transitionTo = 0;
      transitionStartedAt = currentTime;
      transitionDuration = Math.max(1, RELEASE_DURATION_MS * progress);
      phase = "releasing";
      return snapshot();
    },

    tick() {
      advance(now());
      return snapshot();
    },
  };
}

export function createGalaxyFrameLoop({
  requestFrame,
  cancelFrame,
  onFrame,
  reducedMotion = false,
}: {
  requestFrame: (callback: (time: number) => void) => number;
  cancelFrame: (id: number) => void;
  onFrame: (time: number) => void;
  reducedMotion?: boolean;
}) {
  let frameId = 0;
  let running = false;
  let disposed = false;

  const schedule = () => {
    if (!running || disposed || reducedMotion || frameId) return;
    frameId = requestFrame((time) => {
      frameId = 0;
      if (!running || disposed) return;
      onFrame(time);
      schedule();
    });
  };

  const pause = () => {
    running = false;
    if (frameId) {
      cancelFrame(frameId);
      frameId = 0;
    }
  };

  return {
    start() {
      if (disposed || running) return;
      if (reducedMotion) {
        onFrame(0);
        return;
      }
      running = true;
      schedule();
    },
    pause,
    resume() {
      if (disposed || running || reducedMotion) return;
      running = true;
      schedule();
    },
    dispose() {
      if (disposed) return;
      pause();
      disposed = true;
    },
  };
}
