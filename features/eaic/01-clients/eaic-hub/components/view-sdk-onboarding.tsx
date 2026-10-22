"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useContext,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import {
  createInitialViewSdkOnboardingState,
  loadViewSdkOnboardingState,
  persistViewSdkOnboardingState,
  reduceViewSdkOnboarding,
  selectFirstIncompleteViewSdkStep,
  selectViewSdkOnboardingProgress,
  type SdkRobot,
  type ViewSdkNextAction,
  type ViewSdkOnboardingAction,
  type ViewSdkOnboardingProgress,
  type ViewSdkOnboardingStateV1,
  type ViewSdkOnboardingStep,
  type ViewSdkOnboardingStorage,
  type ViewSdkOnboardingStorageMode,
} from "@/features/eaic/01-clients/eaic-hub/contracts/view-sdk-onboarding";
import {
  eaicHubPath,
  getEaicHubTaskPath,
} from "@/features/eaic/01-clients/eaic-hub/contracts/eaic-hub";

export type ViewSdkOnboardingAnchor =
  | "choose-robot"
  | "explore-commands"
  | "set-up-sdk"
  | "next-action";

export type ViewSdkOnboardingController = Readonly<{
  state: ViewSdkOnboardingStateV1;
  hydrated: boolean;
  storageMode: ViewSdkOnboardingStorageMode;
  selectedStep: ViewSdkOnboardingStep;
  coachOpen: boolean;
  progress: ViewSdkOnboardingProgress;
  selectStep(step: ViewSdkOnboardingStep): void;
  registerAnchor(name: ViewSdkOnboardingAnchor, node: HTMLElement | null): void;
  recordRobotSelected(robot: SdkRobot): void;
  recordFunctionDetailViewed(robot: SdkRobot, functionName: string): void;
  recordSetupReviewed(robot: SdkRobot): void;
  recordSetupCopied(robot: SdkRobot): void;
  recordNextAction(robot: SdkRobot, destination: ViewSdkNextAction): void;
  skipTour(): void;
  finishTour(): void;
  restartTour(): void;
}>;

const STEP_ANCHORS: Readonly<Record<ViewSdkOnboardingStep, ViewSdkOnboardingAnchor>> = Object.freeze({
  choose: "choose-robot",
  explore: "explore-commands",
  setup: "set-up-sdk",
  next: "next-action",
});

type SurfaceInternals = Readonly<{
  registerStepControl(step: ViewSdkOnboardingStep, node: HTMLButtonElement | null): void;
}>;

type CoachPlacement = Readonly<{
  coach: CSSProperties;
  halo: CSSProperties | null;
  targetAvailable: boolean;
}>;

const SurfaceInternalsContext = createContext<SurfaceInternals | null>(null);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function getBrowserStorage(): ViewSdkOnboardingStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function ViewSdkOnboardingCoordinator({
  selectedRobot,
  children,
}: Readonly<{
  selectedRobot: SdkRobot;
  children(controller: ViewSdkOnboardingController): ReactNode;
}>): React.JSX.Element {
  const [state, setState] = useState(createInitialViewSdkOnboardingState);
  const [hydrated, setHydrated] = useState(false);
  const [storageMode, setStorageMode] = useState<ViewSdkOnboardingStorageMode>("persistent");
  const [selectedStep, setSelectedStep] = useState<ViewSdkOnboardingStep>("choose");
  const [coachOpen, setCoachOpen] = useState(false);
  const [anchorRevision, setAnchorRevision] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [placement, setPlacement] = useState<CoachPlacement | null>(null);
  const stateRef = useRef<ViewSdkOnboardingStateV1>(state);
  const storageRef = useRef<ViewSdkOnboardingStorage | null>(null);
  const anchorsRef = useRef(new Map<ViewSdkOnboardingAnchor, HTMLElement>());
  const stepControlRefs = useRef(new Map<ViewSdkOnboardingStep, HTMLButtonElement>());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const coachRef = useRef<HTMLDivElement>(null);
  const focusHeadingAfterRenderRef = useRef(false);
  const autoOpenedRef = useRef(false);
  const selectionInitializedRef = useRef(false);

  useEffect(() => {
    storageRef.current = getBrowserStorage();
    const loaded = loadViewSdkOnboardingState(storageRef.current);
    stateRef.current = loaded.state;
    setState(loaded.state);
    setStorageMode(loaded.storageMode);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || selectionInitializedRef.current) return;
    selectionInitializedRef.current = true;
    setSelectedStep(selectFirstIncompleteViewSdkStep(state, selectedRobot));
  }, [hydrated, selectedRobot, state]);

  useEffect(() => {
    if (!hydrated || autoOpenedRef.current) return;
    if (state.tour.dismissed || state.tour.finished) return;
    if (!anchorsRef.current.has("choose-robot")) return;
    autoOpenedRef.current = true;
    const openingStep = selectFirstIncompleteViewSdkStep(state, selectedRobot);
    setSelectedStep(openingStep);
    setCoachOpen(true);
    const stepNumber = STEP_CONTENT.findIndex((item) => item.step === openingStep) + 1;
    setAnnouncement(`Getting started guide opened. Step ${stepNumber} of 4.`);
  }, [anchorRevision, hydrated, selectedRobot, state]);

  const dispatch = useCallback((action: ViewSdkOnboardingAction) => {
    const previousState = stateRef.current;
    const nextState = reduceViewSdkOnboarding(stateRef.current, action);
    stateRef.current = nextState;
    setState(nextState);
    setStorageMode(persistViewSdkOnboardingState(storageRef.current, nextState));
    if (nextState !== previousState) {
      const message = action.type === "ROBOT_SELECTED" ? "Robot choice saved."
        : action.type === "FUNCTION_DETAIL_VIEWED" ? "Command exploration saved."
          : action.type === "SETUP_REVIEWED" ? "Setup review saved."
            : action.type === "SETUP_COPIED" ? "Setup copy saved."
              : action.type === "NEXT_ACTION_CHOSEN" ? "Next action choice saved."
                : "Getting started guide updated.";
      setAnnouncement(message);
    }
    return nextState;
  }, []);

  const registerAnchor = useCallback((name: ViewSdkOnboardingAnchor, node: HTMLElement | null) => {
    const previous = anchorsRef.current.get(name) ?? null;
    if (previous === node) return;
    if (node) anchorsRef.current.set(name, node);
    else anchorsRef.current.delete(name);
    setAnchorRevision((revision) => revision + 1);
  }, []);

  const registerStepControl = useCallback((step: ViewSdkOnboardingStep, node: HTMLButtonElement | null) => {
    if (node) stepControlRefs.current.set(step, node);
    else stepControlRefs.current.delete(step);
  }, []);

  const selectStep = useCallback((step: ViewSdkOnboardingStep) => {
    focusHeadingAfterRenderRef.current = true;
    setSelectedStep(step);
    setCoachOpen(true);
    anchorsRef.current.get(STEP_ANCHORS[step])?.scrollIntoView({ behavior: "auto", block: "center" });
  }, []);

  const returnFocusToSelectedStep = useCallback(() => {
    window.requestAnimationFrame(() => {
      stepControlRefs.current.get(selectedStep)?.focus();
    });
  }, [selectedStep]);

  const skipTour = useCallback(() => {
    dispatch({ type: "TOUR_SKIPPED" });
    setCoachOpen(false);
    returnFocusToSelectedStep();
  }, [dispatch, returnFocusToSelectedStep]);

  const finishTour = useCallback(() => {
    dispatch({ type: "TOUR_FINISHED" });
    setCoachOpen(false);
    returnFocusToSelectedStep();
  }, [dispatch, returnFocusToSelectedStep]);

  const restartTour = useCallback(() => {
    dispatch({ type: "TOUR_RESTARTED" });
    focusHeadingAfterRenderRef.current = true;
    setSelectedStep("choose");
    setCoachOpen(true);
    anchorsRef.current.get("choose-robot")?.scrollIntoView({ behavior: "auto", block: "center" });
  }, [dispatch]);

  useEffect(() => {
    if (!coachOpen || !focusHeadingAfterRenderRef.current) return;
    focusHeadingAfterRenderRef.current = false;
    headingRef.current?.focus();
  }, [coachOpen, selectedStep]);

  const updatePlacement = useCallback(() => {
    if (!coachOpen) return;
    void anchorRevision;
    void selectedRobot;
    const visualViewport = window.visualViewport;
    const viewportWidth = visualViewport?.width ?? window.innerWidth;
    const viewportHeight = visualViewport?.height ?? window.innerHeight;
    const viewportLeft = visualViewport?.offsetLeft ?? 0;
    const viewportTop = visualViewport?.offsetTop ?? 0;
    const target = anchorsRef.current.get(STEP_ANCHORS[selectedStep]);

    if (!target) {
      setPlacement({
        coach: {
          position: "fixed",
          left: 16,
          right: 16,
          bottom: 16,
          maxHeight: "min(65vh, 520px)",
        },
        halo: null,
        targetAvailable: false,
      });
      return;
    }

    const targetRect = target.getBoundingClientRect();
    const halo: CSSProperties = {
      position: "fixed",
      top: targetRect.top + viewportTop - 6,
      left: targetRect.left + viewportLeft - 6,
      width: targetRect.width + 12,
      height: targetRect.height + 12,
    };

    if (viewportWidth < 768) {
      setPlacement({
        coach: {
          position: "fixed",
          left: viewportLeft + 16,
          width: Math.max(0, viewportWidth - 32),
          bottom: 16,
          maxHeight: "min(65vh, 520px)",
        },
        halo,
        targetAvailable: true,
      });
      return;
    }

    const gutter = 16;
    const gap = 14;
    const coachWidth = Math.min(360, viewportWidth - gutter * 2);
    const measuredHeight = coachRef.current?.getBoundingClientRect().height ?? 280;
    const coachHeight = Math.min(measuredHeight, viewportHeight - gutter * 2);
    const minLeft = viewportLeft + gutter;
    const maxLeft = viewportLeft + viewportWidth - coachWidth - gutter;
    const minTop = viewportTop + gutter;
    const maxTop = viewportTop + viewportHeight - coachHeight - gutter;
    const centeredLeft = clamp(targetRect.left + targetRect.width / 2 - coachWidth / 2, minLeft, maxLeft);
    const centeredTop = clamp(targetRect.top + targetRect.height / 2 - coachHeight / 2, minTop, maxTop);
    const below = { left: centeredLeft, top: targetRect.bottom + gap };
    const above = { left: centeredLeft, top: targetRect.top - coachHeight - gap };
    const right = { left: targetRect.right + gap, top: centeredTop };
    const left = { left: targetRect.left - coachWidth - gap, top: centeredTop };
    const candidates = viewportWidth >= 1024 ? [right, left, below, above] : [below, above];
    const fitting = candidates.find((candidate) => (
      candidate.left >= minLeft
      && candidate.left <= maxLeft
      && candidate.top >= minTop
      && candidate.top <= maxTop
    ));
    const fallback = fitting ?? candidates[0];

    setPlacement({
      coach: {
        position: "fixed",
        left: clamp(fallback.left, minLeft, maxLeft),
        top: clamp(fallback.top, minTop, maxTop),
        width: coachWidth,
        maxHeight: viewportHeight - gutter * 2,
      },
      halo,
      targetAvailable: true,
    });
  }, [anchorRevision, coachOpen, selectedRobot, selectedStep]);

  useEffect(() => {
    if (!coachOpen) return;
    const visualViewport = window.visualViewport;
    const frame = window.requestAnimationFrame(updatePlacement);
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    visualViewport?.addEventListener("resize", updatePlacement);
    visualViewport?.addEventListener("scroll", updatePlacement);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
      visualViewport?.removeEventListener("resize", updatePlacement);
      visualViewport?.removeEventListener("scroll", updatePlacement);
    };
  }, [coachOpen, updatePlacement]);

  const moveCoachStep = useCallback((direction: -1 | 1) => {
    const currentIndex = STEP_CONTENT.findIndex((item) => item.step === selectedStep);
    const nextItem = STEP_CONTENT[clamp(currentIndex + direction, 0, STEP_CONTENT.length - 1)];
    selectStep(nextItem.step);
  }, [selectStep, selectedStep]);

  const handleCoachKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    skipTour();
  }, [skipTour]);

  const progress = useMemo(
    () => selectViewSdkOnboardingProgress(state, selectedRobot),
    [selectedRobot, state],
  );

  const controller = useMemo<ViewSdkOnboardingController>(() => ({
    state,
    hydrated,
    storageMode,
    selectedStep,
    coachOpen,
    progress,
    selectStep,
    registerAnchor,
    recordRobotSelected: (robot) => { dispatch({ type: "ROBOT_SELECTED", robot }); },
    recordFunctionDetailViewed: (robot, functionName) => {
      dispatch({ type: "FUNCTION_DETAIL_VIEWED", robot, functionName });
    },
    recordSetupReviewed: (robot) => { dispatch({ type: "SETUP_REVIEWED", robot }); },
    recordSetupCopied: (robot) => { dispatch({ type: "SETUP_COPIED", robot }); },
    recordNextAction: (robot, destination) => {
      dispatch({ type: "NEXT_ACTION_CHOSEN", robot, destination });
    },
    skipTour,
    finishTour,
    restartTour,
  }), [
    state,
    hydrated,
    storageMode,
    selectedStep,
    coachOpen,
    progress,
    selectStep,
    registerAnchor,
    dispatch,
    skipTour,
    finishTour,
    restartTour,
  ]);

  const selectedContent = STEP_CONTENT.find((item) => item.step === selectedStep) ?? STEP_CONTENT[0];
  const selectedIndex = STEP_CONTENT.indexOf(selectedContent);
  const internals = useMemo<SurfaceInternals>(() => ({ registerStepControl }), [registerStepControl]);

  return (
    <SurfaceInternalsContext.Provider value={internals}>
      {children(controller)}
      <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
      {hydrated && coachOpen ? (
        <>
          {placement?.halo ? (
            <span
              aria-hidden="true"
              data-eaic-sdk-onboarding-halo="true"
              className="pointer-events-none fixed z-40 rounded-[16px] ring-2 ring-[#1a73e8] ring-offset-2 transition motion-reduce:transition-none"
              style={placement.halo}
            />
          ) : null}
          <div
            ref={coachRef}
            role="dialog"
            aria-labelledby="view-sdk-coach-heading"
            aria-describedby="view-sdk-coach-description"
            data-eaic-sdk-onboarding-coach={selectedStep}
            onKeyDown={handleCoachKeyDown}
            className="fixed z-50 max-w-[360px] overflow-y-auto rounded-[16px] border border-[#bdc8d9] bg-white p-5 text-[#20242b] shadow-[0_18px_48px_rgba(25,32,44,0.18)] transition motion-reduce:transition-none"
            style={placement?.coach ?? { left: 16, right: 16, bottom: 16 }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1a73e8]">
              Step {selectedIndex + 1} of 4
            </p>
            <h3
              ref={headingRef}
              id="view-sdk-coach-heading"
              tabIndex={-1}
              className="mt-1 text-lg font-semibold tracking-[-0.02em] outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8]"
            >
              {selectedContent.label}
            </h3>
            <p id="view-sdk-coach-description" className="mt-2 text-sm leading-6 text-[#5d6470]">
              {placement?.targetAvailable === false ? "Loading section…" : selectedContent.instruction}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={selectedStep === "choose"}
                onClick={() => moveCoachStep(-1)}
                className="min-h-11 rounded-full border border-[#b8c0cc] px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45"
              >
                Back
              </button>
              {selectedStep !== "next" ? (
                <button
                  type="button"
                  onClick={() => moveCoachStep(1)}
                  className="min-h-11 rounded-full bg-[#1a73e8] px-4 text-sm font-semibold text-white"
                >
                  Next
                </button>
              ) : null}
              {selectedStep === "next" ? (
                <button
                  type="button"
                  onClick={finishTour}
                  className="min-h-11 rounded-full bg-[#1a73e8] px-4 text-sm font-semibold text-white"
                >
                  Finish
                </button>
              ) : null}
              <button
                type="button"
                onClick={skipTour}
                className="ml-auto min-h-11 rounded-full px-3 text-sm font-semibold text-[#4f5866] underline decoration-[#9ca8ba] underline-offset-4"
              >
                Skip
              </button>
            </div>
          </div>
        </>
      ) : null}
    </SurfaceInternalsContext.Provider>
  );
}

const STEP_CONTENT: readonly Readonly<{
  step: ViewSdkOnboardingStep;
  number: number;
  label: string;
  instruction: string;
  completeSummary: string;
}>[] = Object.freeze([
  {
    step: "choose",
    number: 1,
    label: "Choose Robot",
    instruction: "Choose the robot you are building for.",
    completeSummary: "Robot chosen",
  },
  {
    step: "explore",
    number: 2,
    label: "Explore Commands",
    instruction: "Open one command to see its exact public reference.",
    completeSummary: "Command reference opened",
  },
  {
    step: "setup",
    number: 3,
    label: "Set Up SDK",
    instruction: "Review this robot's setup instructions and copy the setup code. Copying does not install or run it.",
    completeSummary: "Instructions reviewed and setup code copied",
  },
  {
    step: "next",
    number: 4,
    label: "Next Action",
    instruction: "Choose what to do next.",
    completeSummary: "Next action chosen",
  },
]);

const NEXT_ACTION_LABELS: Readonly<Record<ViewSdkNextAction, string>> = Object.freeze({
  "software-check": "Code Certification",
  "start-coding": "Start Coding",
  hub: "EAIC Hub",
});

export function ViewSdkOnboardingSurface({
  selectedRobot,
  controller,
}: Readonly<{
  selectedRobot: SdkRobot;
  controller: ViewSdkOnboardingController;
}>): React.JSX.Element {
  const evidence = controller.state.robots[selectedRobot];
  const internals = useContext(SurfaceInternalsContext);
  const { registerAnchor } = controller;
  const nextActionRef = useCallback((node: HTMLDivElement | null) => {
    registerAnchor("next-action", node);
  }, [registerAnchor]);

  return (
    <section
      data-eaic-sdk-onboarding="true"
      data-eaic-sdk-onboarding-hydrated={controller.hydrated ? "true" : "false"}
      data-eaic-sdk-onboarding-storage={controller.storageMode}
      className="mb-6 border-b border-[#d8d5cc] pb-6"
      aria-labelledby="view-sdk-onboarding-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a73e8]">View SDK guide</p>
          <h2 id="view-sdk-onboarding-heading" className="mt-1 text-xl font-semibold tracking-[-0.025em] text-[#17191d]">
            Get started with View SDK
          </h2>
          <p className="mt-1 text-sm text-[#62666d]" aria-live="polite">
            {controller.hydrated
              ? `${controller.progress.completed} of 4 complete`
              : "Loading progress…"}
            {controller.hydrated ? (
              <span className="ml-2">
                · {controller.storageMode === "persistent" ? "Saved in this browser" : "Available for this visit"}
              </span>
            ) : null}
          </p>
        </div>
        {controller.hydrated && (controller.state.tour.dismissed || controller.state.tour.finished) ? (
          <button
            type="button"
            onClick={controller.restartTour}
            className="min-h-11 rounded-full border border-[#c8c4ba] px-4 text-sm font-semibold text-[#303238] transition hover:border-[#1a73e8] hover:text-[#1a73e8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-2"
          >
            Restart tour
          </button>
        ) : null}
      </div>

      <div
        role="group"
        aria-label="View SDK getting started steps"
        aria-busy={!controller.hydrated}
        className="mt-5 grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {STEP_CONTENT.map((item) => {
          const complete = controller.progress.steps[item.step];
          const isCurrent = controller.hydrated && controller.selectedStep === item.step;
          const state = isCurrent ? "current" : complete ? "complete" : "incomplete";
          return (
            <button
              key={item.step}
              ref={(node) => internals?.registerStepControl(item.step, node)}
              type="button"
              disabled={!controller.hydrated}
              onClick={() => controller.selectStep(item.step)}
              aria-current={isCurrent ? "step" : undefined}
              data-eaic-sdk-onboarding-step={item.step}
              data-eaic-sdk-onboarding-step-state={state}
              className="flex min-h-[116px] flex-col justify-start rounded-[14px] border border-[#d8d5cc] bg-[#f5f4f1] p-3 text-left transition hover:border-[#1a73e8]/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-65 data-[eaic-sdk-onboarding-step-state=current]:border-[#1a73e8] data-[eaic-sdk-onboarding-step-state=current]:ring-1 data-[eaic-sdk-onboarding-step-state=current]:ring-[#1a73e8]"
            >
              <span className="flex items-center gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-current text-xs font-bold" aria-hidden="true">
                  {complete ? "✓" : item.number}
                </span>
                <span className="text-sm font-semibold text-[#24262b]">{item.label}</span>
              </span>
              <span className="mt-2 block text-xs leading-5 text-[#62666d]">
                {!controller.hydrated ? "Loading section…" : isCurrent
                  ? complete ? item.completeSummary : item.instruction
                  : complete ? <span>Complete</span> : <span>To do</span>}
              </span>
              {item.step === "setup" && controller.hydrated ? (
                <span className="mt-2 grid gap-1 text-[11px] text-[#62666d]">
                  <span aria-label={`Instructions reviewed: ${evidence.setupReviewed ? "yes" : "no"}`}>
                    {evidence.setupReviewed ? "✓" : "○"} Instructions reviewed
                  </span>
                  <span aria-label={`Setup code copied: ${evidence.setupCopied ? "yes" : "no"}`}>
                    {evidence.setupCopied ? "✓" : "○"} Setup code copied
                  </span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {controller.hydrated && controller.selectedStep === "next" ? (
        <div
          ref={nextActionRef}
          data-sdk-next-actions="true"
          className="mt-4 rounded-[14px] border border-[#cfd8e8] bg-[#eef5ff] p-4"
        >
          <p className="text-sm font-semibold text-[#20242b]">Choose what to do next.</p>
          <p className="mt-1 text-sm leading-6 text-[#5d6470]">
            Continue from the setup you reviewed and choose the workflow that fits your next goal.
          </p>
          {evidence.nextAction ? (
            <p className="mt-2 text-xs font-semibold text-[#41536b]">
              Next action chosen: {NEXT_ACTION_LABELS[evidence.nextAction]}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={getEaicHubTaskPath("software-check")}
              onClick={() => controller.recordNextAction(selectedRobot, "software-check")}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#1a73e8] px-5 text-sm font-semibold text-white transition hover:bg-[#155fc0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-2"
            >
              Code Certification
            </Link>
            <Link
              href={getEaicHubTaskPath("start-coding")}
              onClick={() => controller.recordNextAction(selectedRobot, "start-coding")}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#9ca8ba] bg-white px-5 text-sm font-semibold text-[#28364a] transition hover:border-[#1a73e8] hover:text-[#1a73e8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-2"
            >
              Start Coding
            </Link>
            <Link
              href={eaicHubPath}
              onClick={() => controller.recordNextAction(selectedRobot, "hub")}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#9ca8ba] bg-white px-5 text-sm font-semibold text-[#28364a] transition hover:border-[#1a73e8] hover:text-[#1a73e8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-2"
            >
              EAIC Hub
            </Link>
          </div>
          <p className="mt-3 text-xs leading-5 text-[#62666d]">
            Navigation does not certify, install, connect, or run code.
          </p>
        </div>
      ) : null}
    </section>
  );
}
