export const VIEW_SDK_ONBOARDING_STORAGE_KEY =
  "agentech:eaic:view-sdk-onboarding:v1" as const;

export type SdkRobot = "master" | "aegis" | "navi";
export type ViewSdkNextAction = "software-check" | "start-coding" | "hub";
export type ViewSdkOnboardingStep = "choose" | "explore" | "setup" | "next";

export type RobotOnboardingEvidence = Readonly<{
  robotSelected: boolean;
  functionDetailViewed: boolean;
  setupReviewed: boolean;
  setupCopied: boolean;
  nextAction: ViewSdkNextAction | null;
}>;

export type ViewSdkOnboardingStateV1 = Readonly<{
  version: 1;
  lastExplicitlySelectedRobot: SdkRobot | null;
  robots: Readonly<Record<SdkRobot, RobotOnboardingEvidence>>;
  tour: Readonly<{ dismissed: boolean; finished: boolean }>;
}>;

export type ViewSdkOnboardingAction =
  | { type: "ROBOT_SELECTED"; robot: SdkRobot }
  | { type: "FUNCTION_DETAIL_VIEWED"; robot: SdkRobot; functionName: string }
  | { type: "SETUP_REVIEWED"; robot: SdkRobot }
  | { type: "SETUP_COPIED"; robot: SdkRobot }
  | { type: "NEXT_ACTION_CHOSEN"; robot: SdkRobot; destination: ViewSdkNextAction }
  | { type: "TOUR_SKIPPED" }
  | { type: "TOUR_FINISHED" }
  | { type: "TOUR_RESTARTED" }
  | { type: "STORAGE_HYDRATED"; state: ViewSdkOnboardingStateV1 };

export type ViewSdkOnboardingProgress = Readonly<{
  steps: Readonly<Record<ViewSdkOnboardingStep, boolean>>;
  completed: number;
  total: 4;
  allComplete: boolean;
}>;

export type ViewSdkOnboardingStorage = Readonly<{
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}>;

export type ViewSdkOnboardingStorageMode = "persistent" | "memory-only";

const ROBOTS: readonly SdkRobot[] = Object.freeze(["master", "aegis", "navi"]);
const DESTINATIONS: readonly ViewSdkNextAction[] = Object.freeze([
  "software-check",
  "start-coding",
  "hub",
]);

function freezeEvidence(evidence: RobotOnboardingEvidence): RobotOnboardingEvidence {
  return Object.freeze({ ...evidence });
}

function freezeState(state: ViewSdkOnboardingStateV1): ViewSdkOnboardingStateV1 {
  return Object.freeze({
    version: 1,
    lastExplicitlySelectedRobot: state.lastExplicitlySelectedRobot,
    robots: Object.freeze({
      master: freezeEvidence(state.robots.master),
      aegis: freezeEvidence(state.robots.aegis),
      navi: freezeEvidence(state.robots.navi),
    }),
    tour: Object.freeze({ ...state.tour }),
  });
}

function emptyEvidence(): RobotOnboardingEvidence {
  return freezeEvidence({
    robotSelected: false,
    functionDetailViewed: false,
    setupReviewed: false,
    setupCopied: false,
    nextAction: null,
  });
}

export function createInitialViewSdkOnboardingState(): ViewSdkOnboardingStateV1 {
  return freezeState({
    version: 1,
    lastExplicitlySelectedRobot: null,
    robots: {
      master: emptyEvidence(),
      aegis: emptyEvidence(),
      navi: emptyEvidence(),
    },
    tour: { dismissed: false, finished: false },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isRobot(value: unknown): value is SdkRobot {
  return typeof value === "string" && ROBOTS.includes(value as SdkRobot);
}

function isDestination(value: unknown): value is ViewSdkNextAction {
  return typeof value === "string" && DESTINATIONS.includes(value as ViewSdkNextAction);
}

function parseEvidence(value: unknown): RobotOnboardingEvidence | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "robotSelected",
    "functionDetailViewed",
    "setupReviewed",
    "setupCopied",
    "nextAction",
  ])) return null;
  if (
    typeof value.robotSelected !== "boolean"
    || typeof value.functionDetailViewed !== "boolean"
    || typeof value.setupReviewed !== "boolean"
    || typeof value.setupCopied !== "boolean"
    || (value.nextAction !== null && !isDestination(value.nextAction))
  ) return null;
  return freezeEvidence({
    robotSelected: value.robotSelected,
    functionDetailViewed: value.functionDetailViewed,
    setupReviewed: value.setupReviewed,
    setupCopied: value.setupCopied,
    nextAction: value.nextAction,
  });
}

export function parseViewSdkOnboardingState(raw: string | null): ViewSdkOnboardingStateV1 | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !hasExactKeys(value, [
      "version",
      "lastExplicitlySelectedRobot",
      "robots",
      "tour",
    ])) return null;
    if (value.version !== 1) return null;
    if (value.lastExplicitlySelectedRobot !== null && !isRobot(value.lastExplicitlySelectedRobot)) return null;
    if (!isRecord(value.robots) || !hasExactKeys(value.robots, ROBOTS)) return null;
    if (!isRecord(value.tour) || !hasExactKeys(value.tour, ["dismissed", "finished"])) return null;
    if (typeof value.tour.dismissed !== "boolean" || typeof value.tour.finished !== "boolean") return null;
    const master = parseEvidence(value.robots.master);
    const aegis = parseEvidence(value.robots.aegis);
    const navi = parseEvidence(value.robots.navi);
    if (!master || !aegis || !navi) return null;
    return freezeState({
      version: 1,
      lastExplicitlySelectedRobot: value.lastExplicitlySelectedRobot,
      robots: { master, aegis, navi },
      tour: { dismissed: value.tour.dismissed, finished: value.tour.finished },
    });
  } catch {
    return null;
  }
}

export function serializeViewSdkOnboardingState(state: ViewSdkOnboardingStateV1): string {
  return JSON.stringify({
    version: 1,
    lastExplicitlySelectedRobot: state.lastExplicitlySelectedRobot,
    robots: {
      master: state.robots.master,
      aegis: state.robots.aegis,
      navi: state.robots.navi,
    },
    tour: state.tour,
  });
}

function updateRobot(
  state: ViewSdkOnboardingStateV1,
  robot: SdkRobot,
  update: Partial<RobotOnboardingEvidence>,
): ViewSdkOnboardingStateV1 {
  const current = state.robots[robot];
  const changed = Object.entries(update).some(([key, value]) => current[key as keyof RobotOnboardingEvidence] !== value);
  if (!changed) return state;
  return freezeState({
    ...state,
    robots: { ...state.robots, [robot]: { ...current, ...update } },
  });
}

function updateTour(
  state: ViewSdkOnboardingStateV1,
  tour: ViewSdkOnboardingStateV1["tour"],
): ViewSdkOnboardingStateV1 {
  if (state.tour.dismissed === tour.dismissed && state.tour.finished === tour.finished) return state;
  return freezeState({ ...state, tour });
}

export function reduceViewSdkOnboarding(
  state: ViewSdkOnboardingStateV1,
  action: ViewSdkOnboardingAction,
): ViewSdkOnboardingStateV1 {
  switch (action.type) {
    case "ROBOT_SELECTED": {
      const selected = updateRobot(state, action.robot, { robotSelected: true });
      if (selected.lastExplicitlySelectedRobot === action.robot) return selected;
      return freezeState({ ...selected, lastExplicitlySelectedRobot: action.robot });
    }
    case "FUNCTION_DETAIL_VIEWED":
      return updateRobot(state, action.robot, { functionDetailViewed: true });
    case "SETUP_REVIEWED":
      return updateRobot(state, action.robot, { setupReviewed: true });
    case "SETUP_COPIED":
      return updateRobot(state, action.robot, { setupCopied: true });
    case "NEXT_ACTION_CHOSEN": {
      const withDestination = updateRobot(state, action.robot, { nextAction: action.destination });
      return updateTour(withDestination, { dismissed: false, finished: true });
    }
    case "TOUR_SKIPPED":
      return updateTour(state, { dismissed: true, finished: false });
    case "TOUR_FINISHED":
      return updateTour(state, { dismissed: false, finished: true });
    case "TOUR_RESTARTED":
      return updateTour(state, { dismissed: false, finished: false });
    case "STORAGE_HYDRATED":
      return action.state;
  }
}

export function selectViewSdkOnboardingProgress(
  state: ViewSdkOnboardingStateV1,
  robot: SdkRobot,
): ViewSdkOnboardingProgress {
  const evidence = state.robots[robot];
  const steps = Object.freeze({
    choose: evidence.robotSelected,
    explore: evidence.functionDetailViewed,
    setup: evidence.setupReviewed && evidence.setupCopied,
    next: evidence.nextAction !== null,
  });
  const completed = Object.values(steps).filter(Boolean).length;
  return Object.freeze({ steps, completed, total: 4, allComplete: completed === 4 });
}

export function selectFirstIncompleteViewSdkStep(
  state: ViewSdkOnboardingStateV1,
  robot: SdkRobot,
): ViewSdkOnboardingStep {
  const steps = selectViewSdkOnboardingProgress(state, robot).steps;
  if (!steps.choose) return "choose";
  if (!steps.explore) return "explore";
  if (!steps.setup) return "setup";
  return "next";
}

export function loadViewSdkOnboardingState(
  storage: ViewSdkOnboardingStorage | null,
): Readonly<{ state: ViewSdkOnboardingStateV1; storageMode: ViewSdkOnboardingStorageMode }> {
  if (!storage) {
    return Object.freeze({ state: createInitialViewSdkOnboardingState(), storageMode: "memory-only" });
  }
  try {
    const stored = parseViewSdkOnboardingState(storage.getItem(VIEW_SDK_ONBOARDING_STORAGE_KEY));
    return Object.freeze({
      state: stored ?? createInitialViewSdkOnboardingState(),
      storageMode: "persistent",
    });
  } catch {
    return Object.freeze({ state: createInitialViewSdkOnboardingState(), storageMode: "memory-only" });
  }
}

export function persistViewSdkOnboardingState(
  storage: ViewSdkOnboardingStorage | null,
  state: ViewSdkOnboardingStateV1,
): ViewSdkOnboardingStorageMode {
  if (!storage) return "memory-only";
  try {
    storage.setItem(VIEW_SDK_ONBOARDING_STORAGE_KEY, serializeViewSdkOnboardingState(state));
    return "persistent";
  } catch {
    return "memory-only";
  }
}
