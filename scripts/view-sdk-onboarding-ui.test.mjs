import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workbenchPath = "features/eaic/01-clients/eaic-hub/components/agentech-library-workbench.tsx";
const onboardingPath = "features/eaic/01-clients/eaic-hub/components/view-sdk-onboarding.tsx";

function copyControlSource() {
  const source = fs.readFileSync(workbenchPath, "utf8");
  const start = source.indexOf("function CopyCodeButton(");
  const end = source.indexOf("\n\nfunction MasterSimulationPreviewPanel", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return source.slice(start, end);
}

test("copy fallback rejects a false execCommand result before invoking success", () => {
  const source = copyControlSource();
  assert.match(source, /const\s+copied\s*=\s*document\.execCommand\("copy"\)/);
  assert.match(source, /if\s*\(!copied\)\s*\{?\s*throw\s+new\s+Error/);
  assert.ok(source.indexOf("if (!copied)") < source.indexOf("onCopied?.()"));
  assert.match(source, /finally\s*\{\s*textarea\.remove\(\)/);
  assert.match(source, /Copy failed\. Select and copy the code manually\./);
});

test("copy control preserves the existing 44px target and success/error live message", () => {
  const source = copyControlSource();
  assert.match(source, /className={`grid h-11 w-11/);
  assert.match(source, /aria-label="Copy code"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /Code copied\./);
  assert.match(source, /Copy failed\. Select and copy the code manually\./);
});

test("coordinator starts neutral, hydrates once, and never records evidence from mount or selectedRobot changes", () => {
  const source = fs.readFileSync(onboardingPath, "utf8");
  assert.match(source, /useState\(false\)/);
  assert.match(source, /loadViewSdkOnboardingState\(storageRef\.current\)/);
  assert.equal(source.match(/loadViewSdkOnboardingState\(/g)?.length, 1);
  assert.match(source, /if \(!hydrated[^)]*\) return/);

  const effects = [...source.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[([^\]]*)\]\);/g)];
  assert.ok(effects.some(([, body, dependencies]) => body.includes("loadViewSdkOnboardingState") && dependencies.trim() === ""));
  for (const [, body] of effects) {
    assert.doesNotMatch(body, /ROBOT_SELECTED|FUNCTION_DETAIL_VIEWED/);
  }
});

test("controller dispatch computes and persists the next reducer state synchronously", () => {
  const source = fs.readFileSync(onboardingPath, "utf8");
  assert.match(source, /stateRef\s*=\s*useRef/);
  assert.match(source, /const nextState = reduceViewSdkOnboarding\(stateRef\.current, action\)/);
  assert.match(source, /stateRef\.current = nextState/);
  assert.match(source, /persistViewSdkOnboardingState\(storageRef\.current, nextState\)/);
  assert.ok(source.indexOf("stateRef.current = nextState") < source.indexOf("persistViewSdkOnboardingState(storageRef.current, nextState)"));
});

test("coordinator owns no URL parser, fetch, premium, simulator, analytics, cookie, or session fallback", () => {
  const source = fs.readFileSync(onboardingPath, "utf8");
  for (const forbidden of [
    /useSearchParams/,
    /fetch\s*\(/,
    /premium/i,
    /simulator/i,
    /analytics/i,
    /document\.cookie/,
    /sessionStorage/,
    /MutationObserver/,
    /querySelector/,
    /STEP_COMPLETED/,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});

test("surface exposes the four named steps, neutral hydration, one current step, and truthful progress", () => {
  const source = fs.readFileSync(onboardingPath, "utf8");
  for (const label of ["Choose Robot", "Explore Commands", "Set Up SDK", "Next Action"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /aria-label="View SDK getting started steps"/);
  assert.match(source, /data-eaic-sdk-onboarding="true"/);
  assert.match(source, /data-eaic-sdk-onboarding-step=/);
  assert.match(source, /data-eaic-sdk-onboarding-step-state=/);
  assert.match(source, /aria-busy=\{!controller\.hydrated\}/);
  assert.match(source, /disabled=\{!controller\.hydrated\}/);
  assert.match(source, /\$\{controller\.progress\.completed\} of 4 complete/);
  assert.match(source, /aria-current=\{isCurrent \? "step" : undefined\}/);
  assert.match(source, />To do</);
  assert.match(source, />Complete</);
});

test("setup status requires review and copy as two visible subchecks", () => {
  const source = fs.readFileSync(onboardingPath, "utf8");
  assert.match(source, /Instructions reviewed/);
  assert.match(source, /Setup code copied/);
  assert.match(source, /setupReviewed/);
  assert.match(source, /setupCopied/);
  assert.match(source, /Review this robot's setup instructions and copy the setup code\. Copying does not install or run it\./);
  assert.doesNotMatch(source, /review(?:ed)?\s+(?:means|completes).*setup|cop(?:y|ied)\s+(?:means|completes).*setup/i);
});

test("next prompt contains only the three allowlisted real links and truthful helper text", () => {
  const source = fs.readFileSync(onboardingPath, "utf8");
  assert.equal(source.match(/<Link\b/g)?.length, 3);
  assert.match(source, /getEaicHubTaskPath\("software-check"\)/);
  assert.match(source, /getEaicHubTaskPath\("start-coding"\)/);
  assert.match(source, /href=\{eaicHubPath\}/);
  assert.match(source, /Code Certification/);
  assert.match(source, /Start Coding/);
  assert.match(source, /EAIC Hub/);
  assert.match(source, /Navigation does not certify, install, connect, or run code\./);
  assert.match(source, /Next action chosen:/);
  assert.doesNotMatch(source, /Live Stream|Schedule/);
});

test("checklist navigation changes presentation only", () => {
  const source = fs.readFileSync(onboardingPath, "utf8");
  const start = source.indexOf("const selectStep = useCallback");
  const end = source.indexOf("\n\n  const skipTour", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const selection = source.slice(start, end);
  assert.match(selection, /setSelectedStep\(step\)/);
  assert.match(selection, /scrollIntoView\(\{ behavior: "auto", block: "center" \}\)/);
  assert.doesNotMatch(selection, /dispatch\(|ROBOT_SELECTED|FUNCTION_DETAIL_VIEWED|SETUP_|NEXT_ACTION_CHOSEN/);
  assert.doesNotMatch(source, /locked|overflow-x-auto/);
});

test("coach is non-modal and leaves the target operable", () => {
  const source = fs.readFileSync(onboardingPath, "utf8");
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-labelledby="view-sdk-coach-heading"/);
  assert.match(source, /aria-describedby="view-sdk-coach-description"/);
  assert.match(source, /data-eaic-sdk-onboarding-coach=\{selectedStep\}/);
  assert.match(source, /pointer-events-none/);
  for (const forbidden of [/aria-modal/, /createPortal/, /backdrop/i, /\binert\b/, /body\.style/, /focusTrap/i, /tabIndex=\{?[1-9]/]) {
    assert.doesNotMatch(source, forbidden);
  }
});

test("coach controls preserve evidence and expose Finish only on Step 4", () => {
  const source = fs.readFileSync(onboardingPath, "utf8");
  assert.match(source, /disabled=\{selectedStep === "choose"\}/);
  assert.match(source, /selectedStep !== "next"[\s\S]*?>\s*Next\s*</);
  assert.match(source, /selectedStep === "next"[\s\S]*?onClick=\{finishTour\}[\s\S]*?>\s*Finish\s*</);
  assert.match(source, /onClick=\{skipTour\}[\s\S]*?>\s*Skip\s*</);
  const moveStart = source.indexOf("const moveCoachStep");
  const moveEnd = source.indexOf("\n\n", moveStart);
  assert.doesNotMatch(source.slice(moveStart, moveEnd), /dispatch\(|record[A-Z]|SETUP_|NEXT_ACTION_CHOSEN/);
  assert.match(source, /restartTour[\s\S]*?TOUR_RESTARTED/);
});

test("coach focus and Escape are scoped", () => {
  const source = fs.readFileSync(onboardingPath, "utf8");
  assert.match(source, /focusHeadingAfterRenderRef/);
  assert.match(source, /headingRef\.current\?\.focus\(\)/);
  assert.match(source, /stepControlRefs\.current\.get\(selectedStep\)\?\.focus\(\)/);
  assert.match(source, /onKeyDown=\{handleCoachKeyDown\}/);
  assert.match(source, /event\.key !== "Escape"/);
  assert.doesNotMatch(source, /(?:document|window)\.addEventListener\("keydown"/);
  const autoOpen = source.slice(source.indexOf("if (!hydrated"), source.indexOf("const dispatch"));
  assert.doesNotMatch(autoOpen, /\.focus\(/);
});

test("placement recomputes only while open and honors viewport modes", () => {
  const source = fs.readFileSync(onboardingPath, "utf8");
  assert.match(source, /if \(!coachOpen\) return/);
  assert.match(source, /getBoundingClientRect\(\)/);
  assert.match(source, /viewportWidth >= 1024/);
  assert.match(source, /viewportWidth < 768/);
  assert.match(source, /scrollIntoView\(\{ behavior: "auto", block: "center" \}\)/);
  assert.match(source, /window\.addEventListener\("resize", updatePlacement\)/);
  assert.match(source, /window\.addEventListener\("scroll", updatePlacement, true\)/);
  assert.match(source, /visualViewport\?\.addEventListener\("resize", updatePlacement\)/);
  assert.match(source, /visualViewport\?\.addEventListener\("scroll", updatePlacement\)/);
  assert.match(source, /window\.removeEventListener\("resize", updatePlacement\)/);
  assert.match(source, /window\.removeEventListener\("scroll", updatePlacement, true\)/);
  assert.match(source, /visualViewport\?\.removeEventListener\("resize", updatePlacement\)/);
  assert.match(source, /visualViewport\?\.removeEventListener\("scroll", updatePlacement\)/);
  assert.doesNotMatch(source, /MutationObserver|setInterval\s*\(/);
  assert.match(source, /max-w-\[360px\]/);
  assert.match(source, /motion-reduce:transition-none/);
});

test("Workbench mounts one coordinator only inside the allowed View SDK section", () => {
  const source = fs.readFileSync(workbenchPath, "utf8");
  const focusedStart = source.indexOf("function FocusedBrowseFunctionsSection()");
  const focusedEnd = source.indexOf("\nfunction HardwareSimulationMedia", focusedStart);
  const focused = source.slice(focusedStart, focusedEnd);
  assert.equal(source.match(/<ViewSdkOnboardingCoordinator\b/g)?.length, 1);
  assert.equal(source.match(/<ViewSdkOnboardingSurface\b/g)?.length, 1);
  assert.match(focused, /<ViewSdkOnboardingCoordinator selectedRobot=\{selectedRobot\}>/);
  assert.match(focused, /<ViewSdkOnboardingSurface selectedRobot=\{selectedRobot\} controller=\{onboarding\}/);
  assert.equal(source.slice(0, focusedStart).includes("data-eaic-sdk-onboarding"), false);
  assert.match(source, /showFocusedBrowseFunctions \? <FocusedBrowseFunctionsSection \/>/);
});

test("explicit same-robot activation records Choose without an extra history push", () => {
  const source = fs.readFileSync(workbenchPath, "utf8");
  const start = source.indexOf("function selectRobot(robot: SdkRobot)");
  const end = source.indexOf("\n  }", start) + 4;
  const selection = source.slice(start, end);
  assert.match(selection, /recordRobotSelected\(robot\)/);
  assert.ok(selection.indexOf("recordRobotSelected(robot)") < selection.indexOf("if (robot === selectedRobot) return"));
  assert.match(selection, /if \(robot === selectedRobot\) return/);
  assert.match(selection, /router\.push/);
  assert.match(source, /data-sdk-robot-selector="true"/);
  assert.match(source, /data-sdk-robot-option=\{robot\}/);
});

test("setup review and copy evidence belong only to the selected setup panel", () => {
  const source = fs.readFileSync(workbenchPath, "utf8");
  assert.match(source, /data-sdk-setup-panel=\{selectedRobot\}/);
  assert.match(source, /data-sdk-setup-review=\{selectedRobot\}/);
  assert.match(source, /aria-label="I reviewed these setup instructions"/);
  assert.match(source, /aria-pressed=\{onboarding\.state\.robots\[selectedRobot\]\.setupReviewed\}/);
  assert.match(source, /recordSetupReviewed\(selectedRobot\)/);
  assert.match(source, /data-sdk-setup-copy=\{selectedRobot\}[\s\S]*?<CopyCodeButton[\s\S]*?value=\{selectedStarterCode\}[\s\S]*?onCopied=\{\(\) => onboarding\.recordSetupCopied\(selectedRobot\)\}/);
  assert.equal(source.match(/onCopied=\{/g)?.length, 1);
});

test("only approved links report Next Action", () => {
  const workbench = fs.readFileSync(workbenchPath, "utf8");
  const onboarding = fs.readFileSync(onboardingPath, "utf8");
  assert.match(workbench, /href=\{getEaicHubTaskPath\("software-check"\)\}[\s\S]*?recordNextAction\(selectedRobot, "software-check"\)/);
  assert.equal((workbench + onboarding).match(/recordNextAction\(/g)?.length, 5);
  for (const destination of ["software-check", "start-coding", "hub"]) {
    assert.match(onboarding, new RegExp(`recordNextAction\\(selectedRobot, "${destination}"\\)`));
  }
});

test("all four anchors use typed React refs, not DOM queries", () => {
  const workbench = fs.readFileSync(workbenchPath, "utf8");
  const onboarding = fs.readFileSync(onboardingPath, "utf8");
  assert.match(workbench, /chooseRobotAnchorRef/);
  assert.match(workbench, /setupAnchorRef/);
  assert.match(workbench, /exploreAnchorRef/);
  assert.match(onboarding, /nextActionRef/);
  for (const hook of ["data-sdk-robot-selector", "data-sdk-setup-panel", "data-sdk-documentation-region", "data-sdk-next-actions"]) {
    assert.match(workbench + onboarding, new RegExp(hook));
  }
  assert.doesNotMatch(workbench.slice(workbench.indexOf("function FocusedBrowseFunctionsSection()")), /querySelector|MutationObserver/);
});

test("Navi reports Common Task and row opens but not URL hydration, close, or cleanup", () => {
  const source = fs.readFileSync("features/eaic/01-clients/eaic-hub/components/navi-sdk-explorer.tsx", "utf8");
  assert.match(source, /export type NaviFunctionDetailViewedInput/);
  assert.match(source, /onFunctionDetailViewed\?: \(input: NaviFunctionDetailViewedInput\) => void/);
  const commonStart = source.indexOf("function activateCommonTask");
  const commonEnd = source.indexOf("\n  }", commonStart) + 4;
  assert.match(source.slice(commonStart, commonEnd), /onFunctionDetailViewed\?\.\(\{ robot: "navi", functionName: name \}\)/);
  const toggleStart = source.indexOf("function toggleReference");
  const toggleEnd = source.indexOf("\n  }", toggleStart) + 4;
  const toggle = source.slice(toggleStart, toggleEnd);
  assert.match(toggle, /const opening = openReferenceName !== name/);
  assert.match(toggle, /if \(opening\) onFunctionDetailViewed\?\.\(\{ robot: "navi", functionName: name \}\)/);
  const closeStart = source.indexOf("function closeReference");
  const closeEnd = source.indexOf("\n  }", closeStart) + 4;
  assert.doesNotMatch(source.slice(closeStart, closeEnd), /onFunctionDetailViewed/);
  const effects = [...source.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[[^\]]*\]\);/g)];
  for (const [, body] of effects) assert.doesNotMatch(body, /onFunctionDetailViewed/);
});

test("Aegis and Master report native user-opened function details but never categories", () => {
  const source = fs.readFileSync(workbenchPath, "utf8");
  assert.match(source, /functionDetailIntentRef/);
  assert.match(source, /event\.isTrusted/);
  assert.match(source, /functionDetailIntentRef\.current\.add\(item\.name\)/);
  assert.match(source, /onToggle=\{\(event\) => \{/);
  assert.match(source, /functionDetailIntentRef\.current\.delete\(item\.name\)/);
  assert.match(source, /event\.currentTarget\.open && intended/);
  assert.match(source, /recordFunctionDetailViewed\(selectedRobot, item\.name\)/);
  const categoryStart = source.indexOf("<details\n              key={group.category}");
  const categorySummary = source.indexOf("</summary>", categoryStart);
  assert.doesNotMatch(source.slice(categoryStart, categorySummary), /onToggle|functionDetailIntentRef|recordFunctionDetailViewed/);
});
