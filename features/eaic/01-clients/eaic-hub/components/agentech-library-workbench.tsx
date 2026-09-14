"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { aegisFunctions, aegisStarterCode, type AgentechFunction } from "@/features/eaic/02-unified-api/projects-validation/aegis-sdk-reference";
import { naviFunctions, naviSafetyLimits, naviStarterCode } from "@/features/eaic/02-unified-api/projects-validation/navi-sdk-reference";
import { masterFunctions, masterReferenceCategories, masterSafetyLimits, masterStarterCode } from "@/features/eaic/02-unified-api/projects-validation/master-sdk-reference";
import { masterSimulationPreviews, resolveMasterSimulationVariant } from "@/lib/master-simulation-previews";
import { agentechLibraryTasks, getAgentechLibraryTask, type AgentechLibraryTaskSlug } from "@/features/eaic/01-clients/eaic-hub/contracts/agentech-library-tasks";
import { eaicHubPath, getEaicHubTaskPath } from "@/features/eaic/01-clients/eaic-hub/contracts/eaic-hub";
import { evaluateAgentechMovementSafety, type AgentechMovementSafety } from "@/lib/agentech-motion-safety";
import { normalizeAgentechRobotModel, robotModelOptions, type AgentechRobotModel } from "@/features/eaic/02-unified-api/resources-runs/agentech-robot-model";
import { LiveRobotCamera } from "@/features/eaic/05-delivery/live-results/components/live-robot-camera";
import { MasterMotorMap } from "@/features/eaic/01-clients/eaic-hub/components/master-motor-map";
import { MasterJointMotionGuide } from "@/features/eaic/01-clients/eaic-hub/components/master-joint-motion-guide";
import { MasterHeartbeat } from "@/features/eaic/01-clients/eaic-hub/components/master-heartbeat";
import { HistoryBackButton } from "@/components/history-back-button";
import {
  buildMasterLiveTestPayload,
  getCodeCheckingRobotOptions,
  isMasterLiveSessionActive,
  masterLiveTestPresentation,
  millisecondsUntilMasterLiveTestExpiry,
  selectCodeCheckingRobotModel,
} from "@/lib/master-live-test-ui";

const categories = ["All", "Movement", "Posture", "Safety", "Sensing"] as const;
const naviReferenceCategories: AgentechFunction["category"][] = [
  "Movement",
  "Athletics",
  "Actions",
  "Posture",
  "Safety",
  "Sensing",
  "Configuration"
];
type Category = (typeof categories)[number];
type SimFrame = { x: number; y: number; z: number; yaw: number; pitch?: number };
type AgentechLibraryWorkbenchProps = {
  task?: AgentechLibraryTaskSlug;
};
type HardwareChecklistItem = {
  name: string;
  status: "PASS" | "WARNING" | "FAIL";
  detail: string;
};
type HardwareSimulationClip = {
  command: string;
  label: string;
  asset: string;
  sourceLine: string;
};
type HardwareResult = {
  status: "PASS" | "WARNING" | "FAIL";
  resultId: string;
  robotModel: string;
  fileName: string;
  commandCount: number;
  checklist: HardwareChecklistItem[];
  motionPlan: string[];
  simulationClips: HardwareSimulationClip[];
  simulationError: string;
  finalHint: string;
  movementSafety: AgentechMovementSafety;
};
type ApprovedCodeFile = {
  code: string;
  downloadFileName: string;
  sourceFileName: string;
  source: "uploaded" | "editor";
  editedOnWebsite: boolean;
};
type CachedPhysicalReview = {
  id: string;
  developerName?: string;
  robotModel?: string;
  code: string;
  originalCode?: string;
  uploadedFileName?: string | null;
  downloadFileName?: string;
  editedOnWebsite?: boolean;
  physicalSafetyStatus: string;
  aiSecurityStatus: string;
};
type PremiumFeatureStatus = {
  feature?: { name: string };
  access?: { allowed: boolean; source: "subscription" | "purchase" | "internal" | "none" };
  priceCents?: number | null;
  error?: string;
};
const robotSchedulingPath = getEaicHubTaskPath("schedule-time");
const useRealMuJoCoPreview = true;
const simulatorPreviewRoot = "/assets/products/agentech-library/simulator-previews";
const previewAsset = (name: string) => `${simulatorPreviewRoot}/aegis/${name}.gif?v=squat-half-height-20260715`;

function PremiumFeaturePanel({ item }: { item: AgentechFunction }) {
  const [status, setStatus] = useState<PremiumFeatureStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const access = item.access;

  useEffect(() => {
    if (!access) return;
    let active = true;
    fetch("/api/premium-features/return-to-home", { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json().catch(() => null) as PremiumFeatureStatus | null }))
      .then(({ response, payload }) => {
        if (!active) return;
        setStatus(payload ?? { error: response.status === 401 ? "Sign in to check access." : "Unable to check access." });
      })
      .catch(() => active && setStatus({ error: "Unable to check access." }));
    return () => { active = false; };
  }, [access]);

  if (!access) return null;

  const purchase = async () => {
    setBusy(true);
    const response = await fetch("/api/premium-features/return-to-home", { method: "POST" });
    const payload = await response.json().catch(() => null) as (PremiumFeatureStatus & { checkoutUrl?: string; alreadyEntitled?: boolean }) | null;
    if (payload?.checkoutUrl) {
      window.location.href = payload.checkoutUrl;
      return;
    }
    if (payload?.alreadyEntitled) {
      window.location.reload();
      return;
    }
    setStatus(payload ?? { error: "Unable to start checkout." });
    setBusy(false);
  };

  const price = typeof status?.priceCents === "number"
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(status.priceCents / 100)
    : null;

  return (
    <div className="mt-3 border border-[#7c5ce7] bg-[#f5f1ff] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5b35c8]">Premium function</p>
          <p className="mt-1 text-xs leading-5 text-[#3c2875]">
            Included with an active monthly subscription. Non-subscribers can purchase a lifetime unlock for this function only.
          </p>
          <p className="mt-2 text-xs font-semibold text-[#3c2875]">
            {status?.access?.allowed
              ? status.access.source === "subscription"
                ? "Unlocked by monthly subscription"
                : status.access.source === "purchase"
                  ? "Lifetime feature unlocked"
                  : "Internal access enabled"
              : status?.error || (price ? `One-time unlock: ${price}` : "Checking access…")}
          </p>
        </div>
        {!status?.access?.allowed ? (
          <button
            type="button"
            disabled={busy || status?.priceCents == null}
            onClick={purchase}
            className="border border-[#5b35c8] bg-[#5b35c8] px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Opening checkout…" : price ? `Unlock for ${price}` : "Price coming soon"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
const localPreviewAssets: Record<string, string> = {
  forward: previewAsset("forward"),
  backward: previewAsset("backward"),
  lateral_left: previewAsset("lateral_left"),
  lateral_right: previewAsset("lateral_right"),
  diagonal_left: previewAsset("diagonal_left"),
  diagonal_right: previewAsset("diagonal_right"),
  turn_left: previewAsset("turn_left"),
  turn_right: previewAsset("turn_right"),
  twist_left: previewAsset("twist_left"),
  twist_right: previewAsset("twist_right"),
  pitch_up: previewAsset("look_up"),
  pitch_down: previewAsset("look_down"),
  roll: previewAsset("roll"),
  squat: previewAsset("squat"),
  backflip: previewAsset("backflip"),
  jump: previewAsset("jump"),
  stand: previewAsset("stand"),
  sit: previewAsset("sit"),
  stop: previewAsset("stop"),
  emergency_stop: previewAsset("emergency_stop"),
  get_battery_status: previewAsset("battery_status")
};
const commandsWithoutReferencePreview = new Set(["stay", "squat_forward", "squat_backward", "squat_lateral", "squat_diagonal", "squat_turn", "get_battery_status", "get_body_state", "capture_image"]);
type SdkRobot = "aegis" | "navi" | "master";

function shouldHideReferencePreview(item: AgentechFunction, selectedRobot: SdkRobot) {
  const hasMasterPreview = selectedRobot === "master" && Boolean(masterSimulationPreviews[item.name]);

  return (commandsWithoutReferencePreview.has(item.name) && !hasMasterPreview)
    || (selectedRobot === "master" && !masterSimulationPreviews[item.name])
    || (selectedRobot === "navi" && (item.name === "stop" || item.name === "recovery_stand" || item.category === "Sensing" || item.category === "Configuration"));
}
const naviSimulationAssets: Partial<Record<string, string>> = {
  backward: "/assets/products/agentech-library/simulator-previews/navi/backward/navi-walk-backward.mp4?v=local-approval-20260720",
  forward: "/assets/products/agentech-library/simulator-previews/navi/forward/navi-walk-forward.mp4?v=local-approval-20260720",
  lateral_left: "/assets/products/agentech-library/simulator-previews/navi/lateral-left/navi-lateral-left.mp4?v=local-approval-20260720d",
  lateral_right: "/assets/products/agentech-library/simulator-previews/navi/lateral-right/navi-lateral-right.mp4?v=local-approval-20260720",
  diagonal_left: "/assets/products/agentech-library/simulator-previews/navi/diagonal-left/navi-diagonal-left.mp4?v=local-approval-20260720",
  diagonal_right: "/assets/products/agentech-library/simulator-previews/navi/diagonal-right/navi-diagonal-right.mp4?v=local-approval-20260720",
  turn_left: "/assets/products/agentech-library/simulator-previews/navi/turn-left/navi-turn-left.mp4?v=local-approval-20260720",
  turn_right: "/assets/products/agentech-library/simulator-previews/navi/turn-right/navi-turn-right.mp4?v=local-approval-20260720",
  return_to_home: "/assets/products/agentech-library/simulator-previews/navi/return-to-home/navi-return-to-home.mp4?v=20260722-1",
  sway: "/assets/products/agentech-library/simulator-previews/navi/actions/sway/navi-sway-standing.mp4?v=20260720-1",
  pee: "/assets/products/agentech-library/simulator-previews/navi/actions/pee/navi-pee-back-left-v2.mp4?v=20260720-2",
  knock: "/assets/products/agentech-library/simulator-previews/navi/actions/knock/navi-knock-higher-v2.mp4?v=20260721-3",
  shake_hand: "/assets/products/agentech-library/simulator-previews/navi/actions/shake-hand/navi-shake-hand-one-second.mp4?v=20260721-4",
  hip_shake: "/assets/products/agentech-library/simulator-previews/navi/actions/hip-shake/navi-hip-shake-rear-down.mp4?v=20260721-2",
  wave_hand: "/assets/products/agentech-library/simulator-previews/navi/actions/wave-hand/navi-wave-hand-forward-up.mp4?v=20260721-5",
  bow: "/assets/products/agentech-library/simulator-previews/navi/actions/bow/navi-reference-bow.gif?v=20260723-1",
  wag_rear: "/assets/products/agentech-library/simulator-previews/navi/actions/wag-rear/navi-wag-rear-planted.mp4?v=20260721-2",
  bark: "/assets/products/agentech-library/simulator-previews/navi/actions/bark/navi-reference-bark.gif?v=20260723-1",
  clap_hand: "/assets/products/agentech-library/simulator-previews/navi/actions/clap-hand/navi-reference-clap-hand.gif?v=20260723-1",
  rub_eyes: "/assets/products/agentech-library/simulator-previews/navi/actions/rub-eyes/navi-reference-rub-eyes.gif?v=20260723-1",
  nod_head: "/assets/products/agentech-library/simulator-previews/navi/actions/nod-head/navi-nod-head-sequential.mp4?v=20260721-4",
  shake_head: "/assets/products/agentech-library/simulator-previews/navi/actions/shake-head/navi-shake-head-twist.mp4?v=20260721-1",
  confused: "/assets/products/agentech-library/simulator-previews/navi/actions/confused/navi-confused-asymmetric-legs.mp4?v=20260721-4",
  show_affection: "/assets/products/agentech-library/simulator-previews/navi/actions/show-affection/navi-show-affection-from-cute.mp4?v=20260721-4",
  draw_heart: "/assets/products/agentech-library/simulator-previews/navi/actions/draw-heart/navi-draw-heart-reference.mp4?v=20260721-3",
  cute: "/assets/products/agentech-library/simulator-previews/navi/actions/cute/navi-cute-reference.mp4?v=20260721-5",
  ask_for_play: "/assets/products/agentech-library/simulator-previews/navi/actions/ask-for-play/navi-ask-for-play-reference.mp4?v=20260721-4",
  enjoy_touch: "/assets/products/agentech-library/simulator-previews/navi/actions/enjoy-touch/navi-enjoy-touch-reference.mp4?v=20260721-5",
  sniff_ahead: "/assets/products/agentech-library/simulator-previews/navi/actions/sniff-ahead/navi-sniff-ahead.mp4?v=20260721-1",
  sniff_left: "/assets/products/agentech-library/simulator-previews/navi/actions/sniff-left/navi-sniff-left.mp4?v=20260721-1",
  sniff_right: "/assets/products/agentech-library/simulator-previews/navi/actions/sniff-right/navi-sniff-right.mp4?v=20260721-1",
  front_stretch: "/assets/products/agentech-library/simulator-previews/navi/actions/front-stretch/navi-front-stretch.mp4?v=20260721-2",
  full_body_stretch: "/assets/products/agentech-library/simulator-previews/navi/actions/full-body-stretch/navi-full-body-stretch.mp4?v=20260721-2",
  look_around: "/assets/products/agentech-library/simulator-previews/navi/actions/look-around/navi-look-around.mp4?v=20260721-1",
  squat: "/assets/products/agentech-library/simulator-previews/navi/posture/squat/navi-reference-squat.gif?v=20260723-1",
  sit: "/assets/products/agentech-library/simulator-previews/navi/posture/sit/navi-sit.mp4?v=20260721-1",
  lie_down: "/assets/products/agentech-library/simulator-previews/navi/posture/lie-down/navi-lie-down.mp4?v=20260721-1",
  lie_on_elbows: "/assets/products/agentech-library/simulator-previews/navi/posture/lie-on-elbows/navi-lie-on-elbows.mp4?v=20260721-1",
  prostrate: "/assets/products/agentech-library/simulator-previews/navi/posture/prostrate/navi-prostrate.mp4?v=20260721-1",
  sphinx_lie: "/assets/products/agentech-library/simulator-previews/navi/posture/sphinx-lie/navi-sphinx-lie.mp4?v=20260721-1",
  sphinx_left_lie: "/assets/products/agentech-library/simulator-previews/navi/posture/sphinx-left-lie/navi-sphinx-left-lie.mp4?v=20260721-1",
  sphinx_right_lie: "/assets/products/agentech-library/simulator-previews/navi/posture/sphinx-right-lie/navi-sphinx-right-lie.mp4?v=20260721-1",
  stand_high: "/assets/products/agentech-library/simulator-previews/navi/posture/stand-high/navi-stand-high.mp4?v=20260721-1",
  stand_at_ease: "/assets/products/agentech-library/simulator-previews/navi/posture/stand-at-ease/navi-stand-at-ease.mp4?v=20260721-1",
  stand_at_attention: "/assets/products/agentech-library/simulator-previews/navi/posture/stand-at-attention/navi-stand-at-attention.mp4?v=20260721-1",
  rear_puff: "/assets/products/agentech-library/simulator-previews/navi/actions/long-fart/navi-long-fart.mp4?v=20260721-1",
  head_up_down: "/assets/products/agentech-library/simulator-previews/navi/actions/head-up-down/navi-head-up-down.mp4?v=20260721-1",
  look_down: "/assets/products/agentech-library/simulator-previews/navi/actions/look-down/navi-look-down.mp4?v=20260721-1",
  nod_with_beats: "/assets/products/agentech-library/simulator-previews/navi/actions/nod-with-beats/navi-nod-with-beats.mp4?v=20260721-1",
  eat: "/assets/products/agentech-library/simulator-previews/navi/actions/eat/navi-eat.mp4?v=20260721-7",
  excited: "/assets/products/agentech-library/simulator-previews/navi/actions/excited/navi-excited.mp4?v=20260721-1",
  nod_off: "/assets/products/agentech-library/simulator-previews/navi/actions/nod-off/navi-nod-off.mp4?v=20260721-2",
  dance: "/assets/products/agentech-library/simulator-previews/navi/actions/dance-shoulder/navi-dance-shoulder.mp4?v=20260721-2",
  dramatic_listen: "/assets/products/agentech-library/simulator-previews/navi/actions/dramatic-listen/navi-dramatic-listen.mp4?v=20260721-2",
  act_shy: "/assets/products/agentech-library/simulator-previews/navi/actions/act-shy/navi-reference-act-shy.gif?v=20260723-1",
  be_sleepy: "/assets/products/agentech-library/simulator-previews/navi/actions/be-sleepy/navi-reference-be-sleepy.gif?v=20260723-1",
  body_tag_search: "/assets/products/agentech-library/simulator-previews/navi/actions/body-tag-search/navi-reference-body-tag-search.gif?v=20260723-1",
  bored_half_sit: "/assets/products/agentech-library/simulator-previews/navi/actions/bored-half-sit/navi-reference-bored-half-sit.gif?v=20260723-1",
  brush_teeth: "/assets/products/agentech-library/simulator-previews/navi/actions/brush-teeth/navi-reference-brush-teeth.gif?v=20260723-1",
  smell_food: "/assets/products/agentech-library/simulator-previews/navi/actions/smell-food/navi-smell-food-live-telemetry.mp4?v=20260805-grounded-1",
  look_at_food: "/assets/products/agentech-library/simulator-previews/navi/actions/look-at-food/navi-look-at-food-live-telemetry.mp4?v=20260805-grounded-1",
  eat_yellow: "/assets/products/agentech-library/simulator-previews/navi/actions/eat-yellow/navi-eat-yellow-live-telemetry.mp4?v=20260805-grounded-1",
  drink: "/assets/products/agentech-library/simulator-previews/navi/actions/drink/navi-drink-live-telemetry.mp4?v=20260805-grounded-1",
  enjoy_eating: "/assets/products/agentech-library/simulator-previews/navi/actions/enjoy-eating/navi-enjoy-eating-live-telemetry.mp4?v=20260805-recapture-2",
  finish_eating: "/assets/products/agentech-library/simulator-previews/navi/actions/finish-eating/navi-finish-eating-live-telemetry.mp4?v=20260805-recapture-2",
  apply_toothpaste: "/assets/products/agentech-library/simulator-previews/navi/actions/apply-toothpaste/navi-apply-toothpaste-live-telemetry.mp4?v=20260805-grounded-1",
  main_brush: "/assets/products/agentech-library/simulator-previews/navi/actions/main-brush/navi-main-brush-live-telemetry.mp4?v=20260805-grounded-1",
  gargle: "/assets/products/agentech-library/simulator-previews/navi/actions/gargle/navi-gargle-live-telemetry.mp4?v=20260805-grounded-1",
  brush_teeth_horizontal_30s: "/assets/products/agentech-library/simulator-previews/navi/actions/brush-teeth-horizontal-30s/navi-brush-teeth-horizontal-30s-live-telemetry.mp4?v=20260805-grounded-1",
  brush_teeth_back_and_forth_30s: "/assets/products/agentech-library/simulator-previews/navi/actions/brush-teeth-back-and-forth-30s/navi-brush-teeth-back-and-forth-30s-live-telemetry.mp4?v=20260805-grounded-1",
  brush_teeth_horizontal_23s: "/assets/products/agentech-library/simulator-previews/navi/actions/brush-teeth-horizontal-23s/navi-brush-teeth-horizontal-23s-live-telemetry.mp4?v=20260805-grounded-1",
  raise_camera: "/assets/products/agentech-library/simulator-previews/navi/actions/raise-camera/navi-raise-camera-live-telemetry.mp4?v=20260805-recapture-2",
  brush_teeth_vertical_30s: "/assets/products/agentech-library/simulator-previews/navi/actions/brush-teeth-vertical-30s/navi-brush-teeth-vertical-30s-live-telemetry.mp4?v=20260805-grounded-1",
  chat: "/assets/products/agentech-library/simulator-previews/navi/actions/chat/navi-reference-chat.gif?v=20260723-1",
  cooking: "/assets/products/agentech-library/simulator-previews/navi/actions/cooking/navi-reference-cooking.gif?v=20260723-1",
  duck_walk: "/assets/products/agentech-library/simulator-previews/navi/actions/duck-walk/navi-reference-duck-walk.gif?v=20260723-1",
  eager: "/assets/products/agentech-library/simulator-previews/navi/actions/eager/navi-reference-eager.gif?v=20260723-1",
  explore_new_home: "/assets/products/agentech-library/simulator-previews/navi/actions/explore-new-home/navi-reference-explore-new-home.gif?v=20260723-1",
  explore_road: "/assets/products/agentech-library/simulator-previews/navi/actions/explore-road/navi-reference-explore-road.gif?v=20260723-1",
  fast_rotate: "/assets/products/agentech-library/simulator-previews/navi/actions/fast-rotate/navi-reference-fast-rotate.gif?v=20260723-1",
  joy_walk: "/assets/products/agentech-library/simulator-previews/navi/actions/joy-walk/navi-reference-joy-walk.gif?v=20260723-1",
  listen: "/assets/products/agentech-library/simulator-previews/navi/actions/listen/navi-reference-listen.gif?v=20260723-1",
  observe: "/assets/products/agentech-library/simulator-previews/navi/actions/observe/navi-reference-observe.gif?v=20260723-1",
  push_up: "/assets/products/agentech-library/simulator-previews/navi/actions/push-up/navi-reference-push-up.gif?v=20260723-2",
  rear_stretch: "/assets/products/agentech-library/simulator-previews/navi/actions/rear-stretch/navi-reference-rear-stretch.gif?v=20260723-1",
  rest: "/assets/products/agentech-library/simulator-previews/navi/actions/rest/navi-reference-rest.gif?v=20260723-1",
  search_environment: "/assets/products/agentech-library/simulator-previews/navi/actions/search-environment/navi-reference-search-environment.gif?v=20260723-1",
  search_tag: "/assets/products/agentech-library/simulator-previews/navi/actions/search-tag/navi-reference-search-tag.gif?v=20260723-1",
  shake_self: "/assets/products/agentech-library/simulator-previews/navi/actions/shake-self/navi-reference-shake-self.gif?v=20260723-1",
  sniff_up: "/assets/products/agentech-library/simulator-previews/navi/actions/sniff-up/navi-reference-sniff-up.gif?v=20260723-1",
  snuggle: "/assets/products/agentech-library/simulator-previews/navi/actions/snuggle/navi-reference-snuggle.gif?v=20260723-1",
  step: "/assets/products/agentech-library/simulator-previews/navi/actions/step/navi-reference-step.gif?v=20260723-1",
  step_idle: "/assets/products/agentech-library/simulator-previews/navi/actions/step-idle/navi-reference-step-idle.gif?v=20260723-1",
  sway_front_back: "/assets/products/agentech-library/simulator-previews/navi/actions/sway-front-back/navi-reference-sway-front-back.gif?v=20260723-1",
  think: "/assets/products/agentech-library/simulator-previews/navi/actions/think/navi-reference-think.gif?v=20260723-1",
  toilet_pose: "/assets/products/agentech-library/simulator-previews/navi/actions/toilet-pose/navi-reference-toilet-pose.gif?v=20260723-1",
  toss: "/assets/products/agentech-library/simulator-previews/navi/actions/toss/navi-reference-toss.gif?v=20260723-1",
  yawn: "/assets/products/agentech-library/simulator-previews/navi/actions/yawn/navi-reference-yawn.gif?v=20260723-1",
  swim: "/assets/products/agentech-library/simulator-previews/navi/actions/swim/navi-swim.mp4?v=20260722-4",
  point_to_sky: "/assets/products/agentech-library/simulator-previews/navi/actions/point-to-sky/navi-point-to-sky-left.mp4?v=20260722-2",
  wait_for_praise: "/assets/products/agentech-library/simulator-previews/navi/actions/wait-for-praise/navi-wait-for-praise-planted-feet.mp4?v=20260722-1",
  lucky_cat: "/assets/products/agentech-library/simulator-previews/navi/actions/lucky-cat/navi-lucky-cat-floor-safe.mp4?v=20260722-1",
  jingle: "/assets/products/agentech-library/simulator-previews/navi/actions/jingle/navi-jingle-fast-three-times.mp4?v=20260722-1",
  flex_muscles: "/assets/products/agentech-library/simulator-previews/navi/actions/flex-muscles/navi-flex-muscles-live-joints.mp4?v=20260722-1",
  good_night_wave: "/assets/products/agentech-library/simulator-previews/navi/actions/good-night-wave/navi-good-night-wave-front-camera.mp4?v=20260722-1",
  cry: "/assets/products/agentech-library/simulator-previews/navi/actions/cry/navi-cry-live-joints.mp4?v=20260722-2",
  encourage: "/assets/products/agentech-library/simulator-previews/navi/actions/encourage/navi-encourage-clean-return.mp4?v=20260722-1",
  playful_greeting: "/assets/products/agentech-library/simulator-previews/navi/actions/playful-greeting/navi-playful-greeting-shoulder-dips.webp?v=20260722-5",
  push_ahead: "/assets/products/agentech-library/simulator-previews/navi/actions/push-ahead/navi-push-ahead-knee-forward.webp?v=20260722-4",
  brace: "/assets/products/agentech-library/simulator-previews/navi/actions/brace/navi-brace-live-joints.mp4?v=20260722-2",
  shake_hand_quick: "/assets/products/agentech-library/simulator-previews/navi/actions/shake-hand-quick/navi-shake-hand-quick-live-joints.mp4?v=20260722-2",
  pee_quick: "/assets/products/agentech-library/simulator-previews/navi/actions/pee-quick/navi-pee-quick-live-joints.mp4?v=20260722-2",
  emergency_stop: "/assets/products/agentech-library/simulator-previews/navi/safety/emergency-stop/navi-emergency-stop.mp4?v=20260722-1",
  jump: "/assets/products/agentech-library/simulator-previews/navi/athletics/jump/navi-reference-jump.mp4?v=20260721-2",
  jump_round: "/assets/products/agentech-library/simulator-previews/navi/athletics/jump-round/navi-reference-jump-round.gif?v=20260723-1",
  kick: "/assets/products/agentech-library/simulator-previews/navi/athletics/kick/navi-reference-kick.mp4?v=20260721-2",
  frontflip: "/assets/products/agentech-library/simulator-previews/navi/athletics/frontflip/navi-reference-frontflip.mp4?v=20260721-2",
  jump_forward: "/assets/products/agentech-library/simulator-previews/navi/athletics/jump-forward/navi-reference-jump-forward.mp4?v=20260721-2",
  sideflip: "/assets/products/agentech-library/simulator-previews/navi/athletics/sideflip-right/navi-reference-sideflip-right.mp4?v=20260721-2",
  stand: "/assets/products/agentech-library/simulator-previews/navi/stand/navi-stand-up.mp4?v=approved-20260720"
};
const naviPreviewAliases: Partial<Record<string, string[]>> = {
  diagonal: ["diagonal_left", "diagonal_right"],
  lateral: ["lateral_left", "lateral_right"],
  turn: ["turn_left", "turn_right"]
};
const naviPreviewCategories = new Set(["Movement", "Athletics", "Actions", "Posture"]);
const missingNaviSimulationAssets = naviFunctions
  .filter((item) =>
    item.status !== "development"
    && item.status !== "unsupported"
    && naviPreviewCategories.has(item.category)
    && item.name !== "recovery_stand"
  )
  .flatMap((item) => naviPreviewAliases[item.name] ?? [item.name])
  .filter((command) => !naviSimulationAssets[command]);

if (missingNaviSimulationAssets.length) {
  throw new Error(`Missing Navi simulation previews: ${missingNaviSimulationAssets.join(", ")}`);
}

const naviSimulationReplayStart: Partial<Record<string, number>> = {
  bow: 0,
  bark: 0,
  hip_shake: 0,
  nod_head: 0,
  shake_head: 0,
  confused: 0,
  show_affection: 13.8,
  draw_heart: 14.3,
  cute: 0,
  ask_for_play: 0,
  enjoy_touch: 0,
  knock: 14.5,
  shake_hand: 2.65,
  wave_hand: 0,
  wag_rear: 0,
  pee: 6.25,
  sway: 4.9
};
const localPreviewFallback = previewAsset("stand");
const protectedStandLine = "Agentech.stand()";
const commandsRequiringStand = new Set([
  "forward",
  "backward",
  "lateral",
  "lateral_left",
  "lateral_right",
  "diagonal",
  "turn",
  "turn_left",
  "turn_right",
  "u_turn",
  "yaw",
  "pitch",
  "roll",
  "pitch_up",
  "pitch_down",
  "twist",
  "twist_left",
  "twist_right",
  "backflip",
  "jump"
]);
const lowGaitMovementCommands = new Set(["squat_forward", "squat_backward", "squat_lateral", "squat_diagonal", "squat_turn"]);
const motionCommands = new Set([...commandsRequiringStand, ...lowGaitMovementCommands]);

function previewDirection(args: string) {
  return args.match(/\bdirection\s*=\s*(["'])(left|right|up|down)\1/i)?.[2]?.toLowerCase() ?? "";
}

function profileSyntaxWithPlaceholders(syntax: string) {
  return syntax.split(/(\bx\b|[-+]?(?:\d+(?:\.\d*)?|\.\d+))/g).map((part, index) =>
    /^(?:x|[-+]?(?:\d+(?:\.\d*)?|\.\d+))$/.test(part)
      ? <span key={`${part}-${index}`} className="font-normal text-[#4c1d95]">x</span>
      : part
  );
}

function compactFunctionSignature(signature: string) {
  return signature.replace(/\([^)]*\)/g, "()");
}

function resolvePreviewCommand(command: string, args = "") {
  if (command === "u_turn") return "turn_left";
  if (command === "yaw") {
    const position = args.match(/\bposition_(?:rad|deg)\s*=\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+))/);
    return !position || Number(position[1]) > 0 ? "twist_right" : "twist_left";
  }
  if (command === "pitch") {
    const position = args.match(/\bposition_(?:rad|deg)\s*=\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+))/);
    return position && Number(position[1]) < 0 ? "pitch_down" : "pitch_up";
  }
  if (command === "roll") return "roll";
  if (command === "diagonal") {
    const x = args.match(/\bx_m\s*=\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+))/);
    const angle = args.match(/\bangle_deg\s*=\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+))/);
    const pointsRight = x ? Number(x[1]) > 0 : !angle || Number(angle[1]) > 0;
    return pointsRight ? "diagonal_right" : "diagonal_left";
  }
  if (command === "stay") return "stand";
  if (command === "turn") {
    const signedNames = ["angle_rad", "angle_deg", "rate_percentage", "turn_level", "turn_rate_deg_s", "turn_rate_rad_s"];
    for (const name of signedNames) {
      const value = args.match(new RegExp(`\\b${name}\\s*=\\s*([-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))`));
      if (value) return Number(value[1]) < 0 ? "turn_left" : "turn_right";
    }
  }
  if (command === "lateral" || command === "turn" || command === "twist") {
    const direction = previewDirection(args);
    const defaultDirections: Record<string, string> = {
      lateral: "left",
      turn: "right",
      twist: "left"
    };
    const directedCommand = `${command}_${direction || defaultDirections[command]}`;
    if (directedCommand && localPreviewAssets[directedCommand]) {
      return directedCommand;
    }
  }

  return command;
}

function detectPrimaryPreviewCommand(code: string) {
  const lines = code.split(/\r?\n/);
  let fallbackCommand = "stand";
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = line.match(/(?:Agentech|dog)\.(\w+)\((.*)\)/);
    if (!match) {
      continue;
    }
    const [, rawCommand, args] = match;
    const command = resolvePreviewCommand(rawCommand, args);
    if (localPreviewAssets[command]) {
      if (command === "stand") {
        fallbackCommand = "stand";
        continue;
      }
      return command;
    }
  }
  return fallbackCommand;
}

function codeUsesStandRequiredCommand(code: string) {
  const pattern = /(?:Agentech|dog)\.(\w+)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(code)) !== null) {
    if (commandsRequiringStand.has(match[1])) {
      return true;
    }
  }
  return false;
}

function codeHasStandCommand(code: string) {
  return /(?:Agentech|dog)\.stand\s*\(/.test(code);
}

function ensureRequiredStand(code: string) {
  if (!codeUsesStandRequiredCommand(code) || codeHasStandCommand(code)) {
    return code;
  }

  const lines = code.split(/\r?\n/);
  const importIndex = lines.findIndex((line) => line.trim() === "from agentech import Agentech");
  if (importIndex >= 0) {
    const nextLines = [...lines];
    nextLines.splice(importIndex + 1, 0, "", protectedStandLine);
    return nextLines.join("\n");
  }

  return `from agentech import Agentech\n\n${protectedStandLine}\n${code.trimStart()}`;
}

function prepareMuJoCoCode(code: string) {
  const hasMovement = codeUsesStandRequiredCommand(code);
  if (!hasMovement) {
    return code;
  }

  return code
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:Agentech|dog)\.stand\s*\(\s*\)\s*;?\s*$/.test(line))
    .join("\n");
}

function previewAssetForCode(code: string, preferredCommand?: string) {
  const command = preferredCommand && localPreviewAssets[preferredCommand] ? preferredCommand : detectPrimaryPreviewCommand(code);
  return {
    command,
    gif: localPreviewAssets[command] ?? localPreviewFallback
  };
}

function previewCommandLabel(command: string) {
  const labels: Record<string, string> = {
    forward: "Forward",
    backward: "Backward",
    lateral_left: "Lateral Left",
    lateral_right: "Lateral Right",
    diagonal_left: "Diagonal Left",
    diagonal_right: "Diagonal Right",
    turn_left: "Turn Left",
    turn_right: "Turn Right",
    twist_left: "Yaw Left",
    twist_right: "Yaw Right",
    pitch_up: "Pitch Up",
    pitch_down: "Pitch Down",
    roll: "Roll Right",
    backflip: "Backflip",
    jump: "Jump",
    stand: "Stand",
    squat: "Squat",
    sit: "Sit",
    stop: "Stop",
    emergency_stop: "Emergency Stop",
    get_battery_status: "Battery Status"
  };
  return labels[command] ?? command;
}

function simulationClipsForMotionPlan(
  motionPlan: string[],
  robotModel: AgentechRobotModel
): HardwareSimulationClip[] {
  const assets = robotModel === "Navi" ? naviSimulationAssets : localPreviewAssets;
  const clips = motionPlan
    .map((line) => {
      const match = line.match(/^([a-zA-Z_][\w]*)\s*\((.*)\)$/);
      const command = match ? resolvePreviewCommand(match[1], match[2]) : "";
      const asset = assets[command];
      if (!command || !asset) {
        return null;
      }

      return {
        command,
        label: previewCommandLabel(command),
        asset,
        sourceLine: line
      };
    })
    .filter((clip): clip is HardwareSimulationClip => Boolean(clip));

  if (clips.length) {
    return clips;
  }

  return [
    {
      command: "stand",
      label: "Stand",
      asset: robotModel === "Navi"
        ? naviSimulationAssets.stand ?? "/assets/robotics/ff-navi-white.jpg"
        : localPreviewFallback,
      sourceLine: "No renderable Agentech movement command found."
    }
  ];
}

function defaultMovementSafety(status: "PASS" | "WARNING" | "FAIL", detail?: string): AgentechMovementSafety {
  return {
    level: status,
    submitReady: status !== "FAIL",
    maxDistanceMeters: 0,
    maxDxMeters: 0,
    maxDyMeters: 0,
    detail: detail || "Movement safety was not measured."
  };
}

function approvedDownloadFileName(fileName: string) {
  const baseName = fileName
    .replace(/^.*[\\/]/, "")
    .replace(/\.(?:py|txt)$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${baseName || "agentech_submission"}-approved.py`;
}

function masterViewOnlyHardwareResult(resultId: string, fileName: string): HardwareResult {
  const movementSafety = defaultMovementSafety("PASS", "No movement is evaluated because submitted text is never executed on Master.");
  return {
    status: "PASS",
    resultId,
    robotModel: "Master",
    fileName,
    commandCount: 0,
    checklist: [
      {
        name: "View-only authorization",
        status: "PASS",
        detail: "This approval opens only the Master livestream for the active 3-minute test window.",
      },
      {
        name: "Robot execution isolation",
        status: "PASS",
        detail: "Submitted text is stored as an audit artifact with zero executable commands.",
      },
    ],
    motionPlan: [],
    simulationClips: [],
    simulationError: "",
    finalHint: "View-only test approved. Open the Master Live Stream; this text will not run on the robot.",
    movementSafety,
  };
}

function buildHardwareChecklist(status: "PASS" | "WARNING" | "FAIL", failureReason = "", movementSafety = defaultMovementSafety(status, failureReason), robotModel: AgentechRobotModel = "Aegies"): HardwareChecklistItem[] {
  const failDetail = failureReason || "Fix the checklist items before simulation can run.";
  const blocked = status === "FAIL";
  return [
    {
      name: "SDK-only usage check",
      status: blocked ? "FAIL" : "PASS",
      detail: !blocked ? "Submitted code uses the documented Agentech SDK interface." : failDetail
    },
    {
      name: "Logic safety check",
      status: blocked ? "FAIL" : "PASS",
      detail: !blocked ? "No blocked file, private Python, dynamic execution, or unsafe control structure was detected." : "Hardware validation stopped before simulation."
    },
    {
      name: "Agentech command check",
      status: blocked ? "FAIL" : "PASS",
      detail: !blocked ? "Documented robot commands were found and can be inspected." : "Requires a documented Agentech command from the command library."
    },
    {
      name: "SDK parameter requirement check",
      status: blocked ? "FAIL" : "PASS",
      detail: !blocked ? "Movement commands use required keyword parameters and safe numeric ranges." : "Movement commands must include required keyword parameters and stay inside safe numeric ranges."
    },
    {
      name: "Movement safety box check",
      status: movementSafety.level,
      detail: movementSafety.detail
    },
    {
      name: "Real robot translation check",
      status: blocked ? "FAIL" : "PASS",
      detail: !blocked ? "Submitted code can be treated as a real-robot command package without exposing translated code." : "Translation stays blocked until the submitted code passes validation."
    },
    {
      name: robotModel === "Navi" ? "Navi SDK compatibility check" : "MuJoCo simulation check",
      status: blocked ? "FAIL" : "PASS",
      detail: !blocked
        ? robotModel === "Navi"
          ? "Every command and named parameter matches the latest reviewed Navi SDK surface."
          : "Approved command sequence is ready for the simulation/result view."
        : robotModel === "Navi"
          ? "Navi execution is blocked because SDK validation failed."
          : "Simulation blocked because validation failed."
    }
  ];
}

const categoryExamples: Record<Category, { activeName: string; code: string }> = {
  All: {
    activeName: "stand",
    code: `from agentech import Agentech

Agentech.stand()
Agentech.squat()
Agentech.forward(speed_mps=0.3, duration_s=1)
Agentech.backward(speed_mps=0.2, duration_s=1)
Agentech.lateral_left(speed_mps=0.5, duration_s=2.0)
Agentech.lateral_right(speed_mps=0.5, duration_s=2.0)
Agentech.diagonal(angle_deg=45, speed_mps=0.5, duration_s=2.0)
Agentech.squat_forward(speed_mps=0.5, duration_s=1.0)
Agentech.squat_backward(speed_mps=0.5, duration_s=1.0)
Agentech.squat_lateral(direction="left", speed_mps=0.5, duration_s=1.0)
Agentech.squat_diagonal(angle_deg=45, speed_mps=0.5, duration_s=1.0)
Agentech.turn(angle_deg=-45, turn_rate_deg_s=-22.5)
Agentech.turn(angle_deg=45, turn_rate_deg_s=22.5)
Agentech.yaw(speed_rad_s=0.4, position_rad=0.4426)
Agentech.pitch(speed_rad_s=0.4, position_rad=0.4)
Agentech.roll(speed_rad_s=0.4, position_rad=-0.463)
Agentech.stay(duration_s=1.0)
Agentech.backflip()
Agentech.jump()
battery = Agentech.get_battery_status()
Agentech.stop()`
  },
  Movement: {
    activeName: "forward",
    code: `from agentech import Agentech

Agentech.stand()
Agentech.forward(speed_mps=0.3, duration_s=1)
Agentech.backward(speed_mps=0.2, duration_s=1)
Agentech.lateral_left(speed_mps=0.5, duration_s=2.0)
Agentech.lateral_right(speed_mps=0.5, duration_s=2.0)
Agentech.diagonal(x_m=0.5, y_m=1.0, duration_s=2.0)
Agentech.squat_forward(speed_mps=0.5, duration_s=1.0)
Agentech.squat_backward(speed_mps=0.5, duration_s=1.0)
Agentech.squat_lateral(direction="right", speed_mps=0.5, duration_s=1.0)
Agentech.squat_diagonal(angle_deg=45, speed_mps=0.5, duration_s=1.0)
Agentech.turn(angle_deg=-45, turn_rate_deg_s=-22.5)
Agentech.turn(angle_deg=45, turn_rate_deg_s=22.5)
Agentech.backflip()
Agentech.jump()`
  },
  Posture: {
    activeName: "stand",
    code: `from agentech import Agentech

Agentech.stand()
Agentech.squat()
Agentech.yaw(speed_rad_s=0.4, position_rad=0.4426)
Agentech.pitch(speed_rad_s=0.4, position_rad=0.4)
Agentech.roll(speed_rad_s=0.4, position_rad=-0.463)
Agentech.stay(duration_s=1.0)
Agentech.sit()`
  },
  Safety: {
    activeName: "emergency_stop",
    code: `from agentech import Agentech

Agentech.stop()
Agentech.emergency_stop()`
  },
  Sensing: {
    activeName: "get_battery_status",
    code: `from agentech import Agentech

battery = Agentech.get_battery_status()`
  }
};

const naviFixedTurnCommands = ["turn_left", "turn_right", "u_turn"];
const naviHardwareCommands = new Set([
  ...naviFunctions
    .filter((item) => item.status !== "development" && item.status !== "unsupported")
    .flatMap((item) => item.name === "lateral" ? ["lateral_left", "lateral_right"] : [item.name]),
  ...naviFixedTurnCommands
]);
const naviMotionCommands = new Set([
  ...naviFunctions
    .filter((item) => item.status !== "development" && item.status !== "unsupported" && ["Movement", "Athletics", "Actions", "Posture"].includes(item.category))
    .flatMap((item) => item.name === "lateral" ? ["lateral_left", "lateral_right"] : [item.name]),
  ...naviFixedTurnCommands
]);

function commandPlan(code: string, robotModel: AgentechRobotModel = "Aegies") {
  const trace: string[] = [];
  const lines = code.split(/\r?\n/);
  const aegisCommands = new Set([
    "forward", "backward", "lateral", "lateral_left", "lateral_right", "diagonal", "squat_forward", "squat_backward", "squat_lateral", "squat_diagonal", "squat_turn", "turn", "turn_right", "turn_left", "u_turn",
    "yaw", "pitch", "roll", "stay", "twist_left", "twist_right", "backflip", "jump", "stand", "squat", "sit", "stop", "emergency_stop",
    "get_battery_status", "get_body_state", "capture_image"
  ]);
  const supportedCommands = robotModel === "Navi" ? naviHardwareCommands : aegisCommands;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = line.match(/^(?:(?:[A-Za-z_]\w*)\.)?([A-Za-z_]\w*)\s*\((.*)\)\s*;?$/);
    if (!match || !supportedCommands.has(match[1])) {
      continue;
    }

    const [, command, args] = match;
    const displayArgs = args.trim() ? `(${args.trim()})` : "()";
    trace.push(`${command}${displayArgs}`);
  }

  return {
    trace,
    motionCount: trace.filter((line) => {
      const match = line.match(/^([a-zA-Z_][\w]*)\s*\((.*)\)$/);
      const command = match?.[1] ?? "";
      return robotModel === "Navi" ? naviMotionCommands.has(command) : motionCommands.has(command);
    }).length
  };
}

function CopyCodeButton({ value, className = "" }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copyCode}
      className={`grid h-9 w-9 place-items-center rounded-[10px] border border-[#1a73e8]/35 bg-white/80 text-[#1a73e8] shadow-sm transition hover:border-[#1a73e8] hover:bg-[#1a73e8] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] focus-visible:ring-offset-2 ${className}`}
      aria-label="Copy code"
      title={copied ? "Copied" : "Copy code"}
    >
      {copied ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="8" y="8" width="11" height="11" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

function NaviSimulationPreview({ command }: { command: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const animatedImageRef = useRef<HTMLDivElement>(null);
  const autoPlayedSourceRef = useRef<string | null>(null);
  const [animatedImageVisible, setAnimatedImageVisible] = useState(false);
  const [animatedImageRun, setAnimatedImageRun] = useState(0);
  const videoSource = naviSimulationAssets[command];
  const isGifImage = Boolean(videoSource && /\.gif(?:[?#]|$)/i.test(videoSource));
  const isAnimatedImage = Boolean(videoSource && /\.(?:gif|webp)(?:[?#]|$)/i.test(videoSource));

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSource || isAnimatedImage) {
      return;
    }

    if (autoPlayedSourceRef.current !== videoSource) {
      autoPlayedSourceRef.current = null;
    }

    const playFromStart = () => {
      const replayStart = naviSimulationReplayStart[command] ?? 0;
      const startPlayback = () => {
        video.pause();
        video.currentTime = replayStart;
        void video.play().catch(() => undefined);
      };
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        startPlayback();
        return;
      }
      video.addEventListener("loadedmetadata", startPlayback, { once: true });
      video.load();
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || autoPlayedSourceRef.current === videoSource) {
          return;
        }
        autoPlayedSourceRef.current = videoSource;
        playFromStart();
      },
      { threshold: 0.35 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [command, isAnimatedImage, videoSource]);

  useEffect(() => {
    const container = animatedImageRef.current;
    if (!container || !videoSource || !isAnimatedImage) {
      return;
    }
    setAnimatedImageVisible(false);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) {
          return;
        }
        setAnimatedImageVisible(true);
        observer.disconnect();
      },
      { threshold: 0.35 }
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [isAnimatedImage, videoSource]);

  if (!videoSource) {
    return (
      <div>
        <Image
          src="/assets/robotics/ff-navi-white.jpg"
          alt={`FF Navi robot for Agentech.${command}`}
          width={1200}
          height={675}
          className="aspect-video w-full border border-[#dce7f2] bg-white object-contain"
        />
        <p className="mt-3 text-xs leading-5 text-[#526174]">Simulation preview coming soon</p>
      </div>
    );
  }

  function replay() {
    if (isAnimatedImage) {
      setAnimatedImageVisible(true);
      setAnimatedImageRun((run) => run + 1);
      return;
    }
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const replayStart = naviSimulationReplayStart[command] ?? 0;
    const playFromStart = () => {
      video.currentTime = replayStart;
      void video.play().catch(() => undefined);
    };
    video.pause();
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      playFromStart();
      return;
    }
    video.addEventListener("loadedmetadata", playFromStart, { once: true });
    video.load();
  }

  return (
    <div>
      {isAnimatedImage ? (
        <div
          ref={animatedImageRef}
          className={isGifImage ? "w-full" : "aspect-video w-full border border-[#dce7f2] bg-black"}
        >
          {animatedImageVisible ? (
            <Image
              key={animatedImageRun}
              src={`${videoSource}&replay=${animatedImageRun}`}
              alt={`Approved Navi MuJoCo simulation for Agentech.${command}`}
              width={isGifImage ? 720 : 640}
              height={isGifImage ? 540 : 360}
              unoptimized
              className={isGifImage
                ? "h-auto w-full border border-[#dce7f2] object-contain"
                : "aspect-video h-full w-full object-contain"}
            />
          ) : null}
        </div>
      ) : (
        <video
          ref={videoRef}
          src={videoSource}
          muted
          playsInline
          preload="metadata"
          aria-label={`Approved Navi MuJoCo simulation for Agentech.${command}`}
          className="aspect-video w-full border border-[#dce7f2] bg-black object-contain"
        />
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs leading-5 text-[#526174]">Approved Navi MuJoCo simulation</p>
        <button
          type="button"
          onClick={replay}
          className="border border-[#005bd6] bg-[#eef6ff] px-3 py-2 text-xs font-semibold text-[#0053bd] transition hover:bg-[#005bd6] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#005bd6] focus-visible:ring-offset-2"
        >
          Replay simulation
        </button>
      </div>
    </div>
  );
}

function MasterSimulationPreviewPanel({ command }: { command: string }) {
  const previewEntry = masterSimulationPreviews[command];
  const [selectedVariant, setSelectedVariant] = useState(previewEntry?.defaultVariant ?? "fixed");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setSelectedVariant(previewEntry?.defaultVariant ?? "fixed");
  }, [command, previewEntry?.defaultVariant]);

  const activeVariant = resolveMasterSimulationVariant(command, selectedVariant);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVariant) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        video.currentTime = 0;
        void video.play().catch(() => undefined);
      },
      { threshold: 0.35 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [activeVariant]);

  if (!previewEntry || !activeVariant) return null;

  const accessibleVariant = activeVariant.value === "fixed"
    ? ""
    : ` using ${activeVariant.label.toLowerCase()}`;

  return (
    <div>
      {previewEntry.variants.length > 1 ? (
        <div
          className="mb-3 inline-flex border border-[#93bce8] bg-[#eef6ff] p-1"
          role="group"
          aria-label={`Select ${command} simulation variant`}
        >
          {previewEntry.variants.map((variantOption) => {
            const selected = variantOption.value === activeVariant.value;
            return (
              <button
                key={variantOption.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setSelectedVariant(variantOption.value)}
                className={`min-w-20 px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#005bd6] ${selected ? "bg-[#005bd6] text-white" : "bg-white text-[#17436f] hover:bg-[#e5f1ff]"}`}
              >
                {variantOption.label}
              </button>
            );
          })}
        </div>
      ) : null}
      <video
        key={activeVariant.asset}
        ref={videoRef}
        src={activeVariant.asset}
        aria-label={`Master MuJoCo simulation for ${command}${accessibleVariant}`}
        autoPlay
        muted
        loop
        playsInline
        controls
        preload="metadata"
        className="aspect-video w-full border border-[#dce7f2] bg-black object-contain"
      />
      <p className="mt-3 text-xs leading-5 text-[#526174]">
        Prerecorded Master MuJoCo simulation{activeVariant.value === "fixed" ? "" : ` · ${activeVariant.label} variant`}
      </p>
    </div>
  );
}

function FunctionReference({ item }: { item: AgentechFunction }) {
  return (
    <div className="border border-[#2a3440] bg-[#11151b]">
      <div className="border-b border-[#2a3440] bg-[#181d24] px-4 py-3">
        <p className="font-mono text-sm text-[#8fdc8f]">{item.signature}</p>
      </div>
      <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          <p className="text-sm leading-6 text-[#cdd6df]">{item.summary}</p>
          <div className="mt-4 overflow-hidden border border-[#2a3440]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0d1117] text-xs uppercase tracking-[0.14em] text-[#7f8c99]">
                <tr>
                  <th className="px-3 py-2">Parameter</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Default</th>
                  <th className="px-3 py-2">Meaning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a3440] text-[#cdd6df]">
                {item.params.length ? (
                  item.params.map((param) => (
                    <tr key={param.name}>
                      <td className="px-3 py-2 font-mono text-[#8fdc8f]">{param.name}</td>
                      <td className="px-3 py-2 font-mono text-[#93c5fd]">{param.type}</td>
                      <td className="px-3 py-2 font-mono text-[#f5d06f]">{param.defaultValue ?? "—"}</td>
                      <td className="px-3 py-2 text-[#aeb8c2]">{param.description}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-3 text-[#aeb8c2]" colSpan={4}>
                      No parameters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-3">
          <div className="border border-[#2a3440] bg-[#0d1117] p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Student Call</p>
            <p className="mt-2 font-mono text-sm text-[#8fdc8f]">{item.signature}</p>
          </div>
          <pre className="overflow-x-auto border border-[#2a3440] bg-[#0d1117] p-3 font-mono text-xs leading-5 text-[#e5edf5]">
            {item.example}
          </pre>
        </div>
      </div>
    </div>
  );
}

function DocsOverview() {
  const groupedFunctions = categories
    .filter((category) => category !== "All")
    .map((category) => ({
      category,
      items: aegisFunctions.filter((item) => item.category === category)
    }));

  return (
    <section className="border-b border-[#2a3440] bg-[#0f1318]">
      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8fdc8f]">Library Documentation</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">Start here: install, import, call one function.</h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[#b8c2cc]">
              This page is the documentation. Students can learn the public Agentech API, see every beginner function, preview approved motion GIFs, and upload code for robot review without leaving this screen.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a href="#agentech-docs" className="border border-[#8fdc8f] bg-[#17351f] px-4 py-2 text-sm font-semibold text-[#dfffe0] transition hover:bg-[#8fdc8f] hover:text-[#08100a]">
                Read Full Docs
              </a>
              <a href="#complete-function-reference" className="border border-[#93c5fd] bg-[#101d2e] px-4 py-2 text-sm font-semibold text-[#dbeafe] transition hover:bg-[#93c5fd] hover:text-[#07111f]">
                Function Reference
              </a>
              <a href="#code-workbench" className="border border-[#2a3440] bg-[#0d1117] px-4 py-2 text-sm font-semibold text-[#cdd6df] transition hover:border-[#8fdc8f] hover:text-white">
                Try Code
              </a>
            </div>
          </div>
          <div className="border border-[#2a3440] bg-[#0d1117] p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Quick Start</p>
            <pre className="mt-3 overflow-x-auto font-mono text-xs leading-6 text-[#e5edf5]">{`pip install git+https://github.com/agent-tech0316/agentech_sdk.git

from agentech import Agentech

Agentech.stand()
Agentech.forward(speed_mps=0.3, duration_s=1)
Agentech.backward(speed_mps=0.2, duration_s=1)
Agentech.lateral_left(speed_mps=0.5, duration_s=2.0)
Agentech.lateral_right(speed_mps=0.5, duration_s=2.0)`}</pre>
          </div>
        </div>

        <div className="mt-6 grid gap-px overflow-hidden border border-[#2a3440] bg-[#2a3440] md:grid-cols-2 lg:grid-cols-3">
          {groupedFunctions.map((group) => (
            <div key={group.category} className="bg-[#0d1117] p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">{group.category}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {group.items.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => {
                      setTimeout(() => {
                        document.getElementById("code-workbench")?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }, 0);
                    }}
                    className="border border-[#2a3440] bg-[#11151b] px-2 py-1 font-mono text-xs text-[#cdd6df]"
                    title={item.summary}
                  >
                    {item.name}()
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DocsSection() {
  const beginnerFunctions = aegisFunctions.filter((item) =>
    [
      "forward",
      "backward",
      "lateral",
      "diagonal",
      "squat_forward",
      "squat_backward",
      "squat_lateral",
      "squat_diagonal",
      "squat_turn",
      "turn",
      "yaw",
      "pitch",
      "roll",
      "stay",
      "backflip",
      "jump",
      "stand",
      "squat",
      "sit",
      "stop",
      "emergency_stop",
      "get_battery_status",
      "get_body_state",
      "capture_image"
    ].includes(item.name)
  );
  const workflowExample = `from agentech import Agentech

with Agentech.robot(dry_run=True) as dog:
    dog.stand()
    dog.squat()
    dog.forward(speed_mps=0.25, duration_s=1)
    dog.backward(speed_mps=0.2, duration_s=1)
    dog.lateral_left(speed_mps=0.5, duration_s=2.0)
    dog.lateral_right(speed_mps=0.5, duration_s=2.0)
    dog.squat_forward(speed_mps=0.5, duration_s=1.0)
    dog.squat_backward(speed_mps=0.5, duration_s=1.0)
    dog.squat_lateral(direction="left", speed_mps=0.5, duration_s=1.0)
    dog.squat_diagonal(angle_deg=45, speed_mps=0.5, duration_s=1.0)
    dog.turn(angle_deg=-45, turn_rate_deg_s=-22.5)
    dog.yaw(speed_rad_s=0.4, position_rad=0.4426)
    dog.pitch(speed_rad_s=0.4, position_rad=0.4)
    dog.roll(speed_rad_s=0.4, position_rad=-0.463)
    dog.stay(duration_s=1.0)
    dog.backflip()
    dog.jump()
    dog.stop()`;
  const submitExample = `# Option 1: paste code into this page
Agentech.stand()
Agentech.forward()
Agentech.lateral_left(speed_mps=0.5, duration_s=2.0)

# Option 2: upload a Python file on this page
file = "submission_code.py"`; 
  const robotRunnerExample = `# student_forward.py
from agentech import Agentech

Agentech.stand()
Agentech.forward()

# After review, the scheduled robot session sends approved code
# to the Raspberry Pi bridge connected to the robot hotspot.`;
  const liveRunExample = `Student code -> Website submission -> Human review -> Scheduled slot
Scheduled slot -> Pi bridge -> Robot hotspot -> Aegis dog executes
Live camera -> Website viewer -> Student watches the run`;

  return (
    <section id="agentech-docs" className="border-t border-[#2a3440] bg-[#0f1318]">
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8fdc8f]">Agentech Docs</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">One page to install, write, preview, and submit robot dog code.</h2>
          <p className="mt-4 text-sm leading-7 text-[#b8c2cc]">
            These docs are written for students and developers who need to move the Aegis robot quickly using the public Agentech API. The common path is simple: install the package, import Agentech, write one-line commands, preview approved action clips, then upload code for a reviewed robot session.
          </p>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <div className="border border-[#2a3440] bg-[#0d1117] p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">1. Install</p>
            <pre className="mt-3 overflow-x-auto font-mono text-xs leading-6 text-[#8fdc8f]">pip install git+https://github.com/agent-tech0316/agentech_sdk.git</pre>
            <p className="mt-3 text-sm leading-6 text-[#aeb8c2]">Use this GitHub install now. Later, after PyPI publishing, the target command becomes `pip install agentech`.</p>
          </div>
          <div className="border border-[#2a3440] bg-[#0d1117] p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">2. Import</p>
            <pre className="mt-3 overflow-x-auto font-mono text-xs leading-6 text-[#e5edf5]">from agentech import Agentech</pre>
            <p className="mt-3 text-sm leading-6 text-[#aeb8c2]">Everything students and developer profiles need starts from this one class. The method names are intentionally plain English.</p>
          </div>
          <div className="border border-[#2a3440] bg-[#0d1117] p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">3. Run Safely</p>
            <pre className="mt-3 overflow-x-auto font-mono text-xs leading-6 text-[#e5edf5]">with Agentech.robot(dry_run=True) as dog:</pre>
            <p className="mt-3 text-sm leading-6 text-[#aeb8c2]">Use dry-run on laptops. Use a supervised robot session before allowing real hardware movement.</p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="border border-[#2a3440] bg-[#0d1117]">
            <div className="border-b border-[#2a3440] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Beginner API</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-[#11151b] text-xs uppercase tracking-[0.14em] text-[#7f8c99]">
                  <tr>
                    <th className="px-4 py-3">Function</th>
                    <th className="px-4 py-3">Use it for</th>
                    <th className="px-4 py-3">Easy parameters</th>
                    <th className="px-4 py-3">Example</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a3440] text-[#cdd6df]">
                  {beginnerFunctions.map((item) => (
                    <tr key={item.name}>
                      <td className="px-4 py-3 font-mono text-[#8fdc8f]">{item.signature}</td>
                      <td className="px-4 py-3 text-[#aeb8c2]">{item.summary}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#f5d06f]">
                        {item.params.length ? item.params.map((param) => param.defaultValue ? `${param.name}=${param.defaultValue}` : param.name).join(", ") : "none"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#93c5fd]">{item.example}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <div className="border border-[#2a3440] bg-[#0d1117] p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Safety Limits</p>
              <div className="mt-3 space-y-2 text-sm leading-6 text-[#cdd6df]">
                <p>Linear speed is capped at 2.37 m/s.</p>
                <p>Backward speed is capped at 2.365 m/s.</p>
                <p>Lateral speed benchmark is 0.78 m/s.</p>
                <p>Yaw rate is capped at +/-3 rad/s. Negative values turn left; positive values turn right.</p>
                <p>`Agentech.get_battery_status()` returns the current battery status without changing body mode.</p>
                <p>Roll benchmark limit is 28 degrees.</p>
                <p>Pitch velocity is capped at +/-0.5 rad/s.</p>
                <p>Linear acceleration benchmark is about 2.5 m/s^2.</p>
                <p>Motion commands are capped at 10 seconds.</p>
                <p>`Agentech.stop()` stops normal motion. `Agentech.emergency_stop()` enters damping mode.</p>
              </div>
            </div>
            <div className="border border-[#2a3440] bg-[#0d1117] p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Official Preview</p>
              <p className="mt-3 text-sm leading-6 text-[#cdd6df]">
                The official website shows approved GIF previews only. The preview is for learning and review; the real robot moves later during a scheduled supervised run.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="border border-[#2a3440] bg-[#0d1117]">
            <div className="border-b border-[#2a3440] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Real Example: Height Photos</p>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 text-[#e5edf5]">{workflowExample}</pre>
          </div>
          <div className="border border-[#2a3440] bg-[#0d1117]">
            <div className="border-b border-[#2a3440] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Review Workflow</p>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 text-[#e5edf5]">{submitExample}</pre>
            <div className="border-t border-[#2a3440] p-4 text-sm leading-6 text-[#aeb8c2]">
              Students can paste code directly into the editor or upload a Python file. The request is stored for review before any supervised live robot run.
            </div>
          </div>
          <div className="border border-[#2a3440] bg-[#0d1117] lg:col-span-2">
            <div className="border-b border-[#2a3440] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Scheduled Robot Run</p>
            </div>
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
              <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 text-[#e5edf5]">{robotRunnerExample}</pre>
              <div className="border-t border-[#2a3440] p-4 text-sm leading-6 text-[#aeb8c2] lg:border-l lg:border-t-0">
                The student file stays tiny. After Step 3 Physical Hardware Check, Step 4 Software Check, and scheduling, the website sends approved code to the Raspberry Pi bridge. The Pi is connected to the robot hotspot, runs the code on the robot, and the Step 5 Live Stream lets the student watch the result on the website.
              </div>
            </div>
          </div>
          <div className="border border-[#2a3440] bg-[#0d1117] lg:col-span-2">
            <div className="border-b border-[#2a3440] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">End-To-End Process</p>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 text-[#e5edf5]">{liveRunExample}</pre>
          </div>
        </div>

        <div id="complete-function-reference" className="mt-8 scroll-mt-6 border border-[#2a3440] bg-[#0d1117]">
          <div className="border-b border-[#2a3440] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Complete Function Reference</p>
          </div>
          <div className="grid gap-px bg-[#2a3440] md:grid-cols-2 xl:grid-cols-3">
            {aegisFunctions.map((item) => (
              <div key={item.name} className="bg-[#0d1117] p-4">
                <p className="font-mono text-sm text-[#8fdc8f]">{item.signature}</p>
                <p className="mt-2 min-h-12 text-sm leading-6 text-[#cdd6df]">{item.summary}</p>
                <div className="mt-4 border-t border-[#2a3440] pt-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Parameters</p>
                  {item.params.length ? (
                    <div className="mt-2 space-y-2">
                      {item.params.map((param) => (
                        <div key={param.name} className="border border-[#26313c] bg-[#090d12] p-2">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-mono text-xs text-[#8fdc8f]">{param.name}</span>
                            <span className="font-mono text-[11px] text-[#93c5fd]">{param.type}</span>
                            {param.defaultValue ? <span className="font-mono text-[11px] text-[#f5d06f]">default {param.defaultValue}</span> : null}
                          </div>
                          <p className="mt-1 text-xs leading-5 text-[#aeb8c2]">{param.description}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs leading-5 text-[#aeb8c2]">No parameters.</p>
                  )}
                </div>
                <p className="mt-3 text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Public API</p>
                <p className="mt-1 font-mono text-xs leading-5 text-[#93c5fd]">{item.signature}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const taskFeatureNotes: Record<AgentechLibraryTaskSlug, string> = {
  "start-coding": "Install commands, starter imports, and the beginner quick-start docs are collected here.",
  "view-sdk": "Choose Aegis, Navi, or Master, then browse exact functions, parameters, limits, examples, and reference images.",
  "physical-hardware-check": "Upload or paste one Python file, then run the physical hardware check before any software review.",
  "software-check": "Upload, paste, or type one file. Pass Hardware Safety first, then run Software Security on the exact same code.",
  "watch-live-run": "Live Stream opens only during an approved scheduled robot slot after the required checks pass."
};

function TaskDetailHeader({ task }: { task: NonNullable<ReturnType<typeof getAgentechLibraryTask>> }) {
  return (
    <section className="border-b border-black/8 bg-[#f5f4f1]">
      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8 lg:py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <HistoryBackButton
            fallbackHref={eaicHubPath}
            className="rounded-full border border-black/10 bg-white/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#111111] shadow-sm transition hover:border-[#1a73e8]/50 hover:text-[#1a73e8]"
          />
          <div className="flex flex-wrap gap-2">
            {agentechLibraryTasks.map((item) => (
              <Link
                key={item.slug}
                href={getEaicHubTaskPath(item.slug)}
                className={`rounded-[10px] border px-3 py-2 font-mono text-xs transition ${
                  item.slug === task.slug
                    ? "border-[#1a73e8]/45 bg-[#1a73e8] text-white shadow-[0_8px_20px_rgba(26,115,232,0.2)]"
                    : "border-black/10 bg-white/65 text-[#5f6368] hover:border-[#1a73e8]/45 hover:text-[#1a73e8]"
                }`}
              >
                {item.number}
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-7 grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end">
          <div
            data-task-number-badge="true"
            className="grid h-20 w-20 place-items-center rounded-full bg-[#111111] font-mono text-3xl font-medium text-white shadow-[0_14px_34px_rgba(17,17,17,0.14)]"
          >
            {Number.parseInt(task.number, 10)}
          </div>
          <div>
            <p className="font-interface text-xs font-semibold uppercase tracking-[0.18em] text-[#1a73e8]">Command Library Task</p>
            <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-[#111111] md:text-5xl">{task.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[#5f6368]">{taskFeatureNotes[task.slug]}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FocusedLiveRunSection() {
  return (
    <section className="bg-[#f5f4f1] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="overflow-hidden rounded-[22px] border border-black/8 bg-white/70 shadow-[0_28px_80px_rgba(17,17,17,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/8 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1a73e8]">Live Stream Camera</p>
              <p className="mt-1 text-xs leading-5 text-[#5f6368]">Live video appears here. Saved Aegies captures remain available for download.</p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href={robotSchedulingPath}
                className="rounded-full border border-[#1a73e8]/40 bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#1a73e8] transition hover:bg-[#1a73e8] hover:text-white"
              >
                Schedule Time
              </Link>
              <span className="h-3 w-3 rounded-full bg-[#9aa0a6]" aria-hidden="true" />
            </div>
          </div>
          <div className="border-b border-black/8 bg-[#faf9f6] px-5 py-4 text-sm leading-6 text-[#5f6368]">
            Aegies supports paid display captures and a persistent download archive. Navi sessions show live video only because the Navi SDK has no image-capture command.
          </div>
          <div className="bg-[#111111] p-4">
            <LiveRobotCamera roomName={process.env.NEXT_PUBLIC_LIVEKIT_ROOM_NAME || "aegis-lab-1"} />
          </div>
        </div>
      </div>
    </section>
  );
}

function LockedLiveRunPanel({ dark = false }: { dark?: boolean }) {
  return (
    <div className={dark ? "border border-[#2a3440] bg-[#0d1117] p-4" : "bg-white p-5"}>
      <div className={`grid min-h-64 place-items-center border ${dark ? "border-[#2a3440] bg-[#080b0f]" : "border-[#dce7f2] bg-[#f8fbff]"} px-5 py-8 text-center`}>
        <div className="max-w-xl">
          <div className={`mx-auto grid h-16 w-16 place-items-center rounded-[8px] border ${dark ? "border-[#8fdc8f] bg-[#102015] text-[#8fdc8f]" : "border-[#008a7a] bg-[#e6fbf6] text-[#007d6f]"}`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </div>
          <p className={`mt-5 text-xs font-semibold uppercase tracking-[0.16em] ${dark ? "text-[#8fdc8f]" : "text-[#008a7a]"}`}>Live View Locked</p>
          <h3 className={`mt-2 text-2xl font-semibold ${dark ? "text-white" : "text-[#07142e]"}`}>Schedule an approved robot slot first.</h3>
          <p className={`mt-3 text-sm leading-6 ${dark ? "text-[#aeb8c2]" : "text-[#334155]"}`}>
            Live camera access only opens during an active scheduled session. For custom-code runs, pass Step 3 Physical Hardware Check and Step 4 Software Check before scheduling.
          </p>
          <Link
            href={robotSchedulingPath}
            className={`mt-5 inline-flex border px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] transition ${
              dark
                ? "border-[#8fdc8f] bg-[#17351f] text-[#dfffe0] hover:bg-[#8fdc8f] hover:text-[#08100a]"
                : "border-[#008a7a] bg-[#e5fff7] text-[#006b5f] hover:bg-[#008a7a] hover:text-white"
            }`}
          >
            Schedule Time
          </Link>
        </div>
      </div>
    </div>
  );
}

function FocusedStartCodingSection() {
  const setupSteps = [
    {
      label: "01",
      title: "Install the SDK",
      body: "Run the GitHub package install in your terminal before writing robot commands.",
      code: "pip install git+https://github.com/agent-tech0316/agentech_sdk.git"
    },
    {
      label: "02",
      title: "Import Agentech",
      body: "Every beginner command starts from the same readable Python import.",
      code: "from agentech import Agentech"
    },
    {
      label: "03",
      title: "Stand first",
      body: "Movement examples begin with a stand command so the robot is ready before motion.",
      code: "Agentech.stand()"
    },
    {
      label: "04",
      title: "Move, then stop",
      body: "Keep early commands short. Preview first, then submit for review when the sequence is stable.",
      code: "Agentech.forward(speed_mps=0.3, duration_s=1)\nAgentech.stop()"
    }
  ];

  const recipes = [
    {
      title: "First Forward Step",
      code: `from agentech import Agentech

Agentech.stand()
Agentech.forward(speed_mps=0.3, duration_s=1)
Agentech.stop()`
    },
    {
      title: "Posture Check",
      code: `from agentech import Agentech

Agentech.stand()
Agentech.squat()
Agentech.sit()`
    },
    {
      title: "Battery Check",
      code: `from agentech import Agentech

print(Agentech.get_battery_status())`
    }
  ];

  return (
    <section className="bg-[#f5f4f1] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="overflow-hidden rounded-[22px] border border-black/8 bg-white/70 shadow-[0_28px_80px_rgba(17,17,17,0.08)]">
            <div className="relative h-72 overflow-hidden border-b border-black/8 bg-[#faf9f6]">
              <svg aria-hidden="true" focusable="false" width="0" height="0" className="absolute pointer-events-none">
                <defs>
                  <filter id="eaic-start-clean-blueprint" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
                    {/* Isolate blue ink from pale neutral extraction residue,
                        then preserve the original transparency and geometry. */}
                    <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3 0 3 0 -0.14" />
                    <feComponentTransfer result="blue-ink">
                      <feFuncA type="gamma" amplitude="1" exponent="0.65" offset="0" />
                    </feComponentTransfer>
                    <feComposite in="blue-ink" in2="SourceAlpha" operator="in" result="ink-mask" />
                    <feFlood floodColor="#91cffa" />
                    <feComposite in2="ink-mask" operator="in" />
                  </filter>
                </defs>
              </svg>
              <Image
                src="/assets/products/agentech-library/dog-blueprint-transparent-v4.png"
                alt="Aegis robot dog blueprint"
                data-eaic-start-blueprint="true"
                fill
                priority
                sizes="(min-width: 1024px) 520px, 100vw"
                className="object-contain p-3"
              />
            </div>
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1a73e8]">Beginner Path</p>
              <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#111111]">Your first Aegis script in four moves.</h2>
              <p className="mt-3 text-sm leading-7 text-[#5f6368]">
                Start with one safe motion. Keep the file small, preview the command, then move to review once the sequence is readable.
              </p>
              <div className="mt-5 grid gap-px overflow-hidden rounded-[14px] border border-black/8 bg-black/8 sm:grid-cols-3">
                {["Install", "Write", "Preview"].map((item) => (
                  <div key={item} className="font-interface bg-[#faf9f6] p-3 text-center text-xs font-semibold uppercase tracking-[0.12em] text-[#1a73e8]">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            {setupSteps.map((step) => (
              <div key={step.label} className="relative grid gap-4 rounded-[22px] border border-black/8 bg-white/70 p-4 pr-16 shadow-[0_20px_55px_rgba(17,17,17,0.06)] sm:grid-cols-[72px_minmax(0,1fr)]">
                <CopyCodeButton value={step.code} className="absolute right-4 top-4 z-10" />
                <div className="grid h-14 w-14 place-items-center rounded-[14px] bg-[#1a73e8] font-mono text-xl font-bold text-white shadow-[0_12px_30px_rgba(26,115,232,0.2)]">
                  {step.label}
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-xl font-semibold text-[#111111]">{step.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-[#5f6368]">{step.body}</p>
                  <pre className="mt-3 overflow-x-auto rounded-[12px] border border-black/8 bg-[#faf9f6] p-3 font-mono text-xs leading-6 text-[#303134]">{step.code}</pre>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <div key={recipe.title} className="overflow-hidden rounded-[22px] border border-black/8 bg-white/70 shadow-[0_20px_55px_rgba(17,17,17,0.06)]">
              <div className="border-b border-black/8 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1a73e8]">{recipe.title}</p>
              </div>
              <pre className="min-h-56 overflow-x-auto bg-[#faf9f6] p-4 font-mono text-xs leading-6 text-[#303134]">{recipe.code}</pre>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-[22px] border border-black/8 bg-white/70 p-5 shadow-[0_20px_55px_rgba(17,17,17,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1a73e8]">Starter Rules</p>
          <div className="mt-4 grid gap-px overflow-hidden rounded-[14px] border border-black/8 bg-black/8 md:grid-cols-4">
            {[
              "Use stand before motion",
              "Keep motion under 10 seconds",
              "Preview before review",
              "Stop at the end"
            ].map((rule) => (
              <div key={rule} className="bg-[#faf9f6] p-4 text-sm font-semibold leading-6 text-[#303134]">
                {rule}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SafetyLimitLabel({ label }: { label: string }) {
  const measurement = ["10s", "2 m x 2 m"].find((token) => label.includes(token));

  if (!measurement) {
    return label;
  }

  const [before, after] = label.split(measurement);
  return (
    <>
      {before}
      <code className="font-mono">{measurement}</code>
      {after}
    </>
  );
}

function FocusedBrowseFunctionsSection() {
  const [selectedRobot, setSelectedRobot] = useState<SdkRobot>("master");
  const publicNaviPlatformNotes = new Set([
    "jump",
    "jump_forward",
    "observe",
    "set_gait",
    "set_foot_height",
    "set_collision_protect",
    "set_friction",
    "set_jump_distance",
    "set_jump_angle"
  ]);
  const selectedFunctions = selectedRobot === "master"
    ? masterFunctions
    : selectedRobot === "navi"
      ? naviFunctions.map((item) => ({
          ...item,
          verification: undefined,
          platformNote: publicNaviPlatformNotes.has(item.name) ? item.platformNote : undefined,
          params: item.params.filter((param) => param.name !== "**connect_kwargs")
        }))
      : aegisFunctions;
  const selectedStarterCode = selectedRobot === "master"
    ? masterStarterCode
    : selectedRobot === "navi"
      ? naviStarterCode
      : aegisStarterCode;
  const selectedRobotLabel = selectedRobot === "master" ? "Master" : selectedRobot === "navi" ? "Navi" : "Aegis";
  const referenceCategories: AgentechFunction["category"][] = selectedRobot === "master"
    ? masterReferenceCategories
    : selectedRobot === "navi"
      ? naviReferenceCategories
      : categories.filter((category): category is Exclude<Category, "All"> => category !== "All");
  const groupedFunctions = referenceCategories
    .map((category) => ({
      category,
      items: selectedFunctions.filter((item) => item.category === category)
    }))
    .filter((group) => group.items.length > 0);
  const temporaryBoundaryLimit = {
    label: "Boundary: 2 m x 2 m safety box",
    detail: "Crossing this temporary boundary fails the Hardware Check.",
    temporary: true
  };
  const safetyLimits: { label: string; detail?: string; temporary?: boolean }[] = selectedRobot === "master"
    ? masterSafetyLimits.map((label) => ({ label }))
    : selectedRobot === "navi"
      ? [
          ...naviSafetyLimits.map((label) => ({ label })),
          temporaryBoundaryLimit
        ]
      : [
          { label: "Dry-run before hardware" },
          { label: "10s max per linear motion" },
          { label: "Speed caps enforced" },
          { label: "Emergency stop available" },
          temporaryBoundaryLimit
        ];
  const tutorialCards = [
    {
      title: "Read the signature",
      body: "Use the compact row for the function name. Open details for required inputs, profiles, and limits."
    },
    {
      title: "Open details",
      body: `Details reveal definitions, parameter meanings, examples, and ${
        selectedRobot === "master"
          ? "MuJoCo simulations and physical-verification notes"
          : selectedRobot === "navi"
            ? "approved simulations where available"
            : "GIF previews"
      }.`
    },
    {
      title: "Copy into Hardware Check",
      body: "Move working sequences to Step 3 after previewing the intended behavior."
    }
  ];

  return (
    <section className="bg-[#f5f4f1] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 rounded-[22px] border border-black/8 bg-white/70 p-5 shadow-[0_28px_80px_rgba(17,17,17,0.08)]">
          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1a73e8]">Robot SDK Reference</p>
              <h2 className="mt-2 text-3xl font-semibold text-[#111111]">Choose the robot. Use its real capabilities.</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5f6368]">
                The import and setup pattern stay the same. Each robot shows only the functions and limits its public SDK supports.
              </p>
              <div className="mt-5 inline-grid grid-cols-3 rounded-full border border-black/10 bg-[#efede8] p-1" role="group" aria-label="Select robot SDK">
                {(["master", "aegis", "navi"] as const).map((robot) => {
                  const selected = selectedRobot === robot;
                  return (
                    <button
                      key={robot}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedRobot(robot)}
                      className={`min-w-28 rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a73e8] ${selected ? "bg-[#1a73e8] text-white shadow-sm" : "text-[#5f6368] hover:bg-white/75 hover:text-[#111111]"}`}
                    >
                      {robot === "aegis" ? "Aegis" : robot === "navi" ? "Navi" : "Master"}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-[#1a73e8]/25 bg-[#eaf2fd] px-3 py-1.5 font-semibold text-[#1a73e8]">{selectedFunctions.length} reference cards</span>
                {selectedRobot === "navi" ? (
                  <span className="rounded-full border border-[#1a73e8]/25 bg-[#eaf2fd] px-3 py-1.5 font-semibold text-[#1a73e8]">Navi-specific API</span>
                ) : null}
                {selectedRobot === "master" ? (
                  <span className="rounded-full border border-[#1a73e8]/25 bg-[#eaf2fd] px-3 py-1.5 font-semibold text-[#1a73e8]">Standing upper-body API</span>
                ) : null}
              </div>
            </div>
            <div className="relative min-w-0 rounded-[16px] border border-black/8 bg-[#faf9f6] p-4 pr-14">
              <CopyCodeButton value={selectedStarterCode} className="absolute right-3 top-3" />
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1a73e8]">{selectedRobotLabel} setup</p>
              <pre className="mt-3 max-h-52 min-w-0 overflow-auto whitespace-pre-wrap font-mono text-xs leading-6 text-[#303134] [overflow-wrap:anywhere]">{selectedStarterCode}</pre>
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="rounded-[22px] border border-black/8 bg-white/70 p-5 shadow-[0_28px_80px_rgba(17,17,17,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1a73e8]">SDK Tutorial</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#111111]">Browse {selectedRobotLabel} commands and parameters.</h2>
            <div className="mt-5 grid gap-px overflow-hidden rounded-[14px] border border-black/8 bg-black/8 md:grid-cols-3">
              {tutorialCards.map((card) => (
                <div key={card.title} className="bg-[#faf9f6] p-4">
                  <p className="text-sm font-semibold text-[#111111]">{card.title}</p>
                  <p className="mt-2 text-xs leading-5 text-[#5f6368]">{card.body}</p>
                </div>
              ))}
            </div>
          </div>
          <div
            data-safety-limits-theme="engineering-yellow"
            className="rounded-[22px] border border-[#d8d3ca] bg-white/70 p-5 shadow-[0_28px_80px_rgba(17,17,17,0.08)]"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a6b12]">Safety Limits</p>
            <div className="mt-4 grid gap-2">
              {safetyLimits.map((limit) => {
                const emphasizesCompletionVerification = limit.label === "Every live gesture waits for completion and verifies stable standing again";

                return (
                  <div
                    key={limit.label}
                    data-safety-limit-kind={limit.temporary ? "temporary-boundary" : emphasizesCompletionVerification ? "completion-verification" : "standard"}
                    className={limit.temporary || emphasizesCompletionVerification
                      ? `border border-[#d1a832] bg-[#fff7d6] px-3 ${limit.temporary ? "py-2.5" : "py-2"} text-[#55430a] shadow-[inset_3px_0_0_#c99a00]`
                      : "border border-[#d8d3ca] bg-[#faf9f6] px-3 py-2 text-sm font-semibold text-[#31312f]"}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold">
                        {emphasizesCompletionVerification ? (
                          <strong data-safety-limit-emphasis="completion-verification" className="font-bold"><SafetyLimitLabel label={limit.label} /></strong>
                        ) : (
                          <SafetyLimitLabel label={limit.label} />
                        )}
                      </span>
                      {limit.temporary ? (
                        <code className="border border-[#d1a832] bg-[#fffdf2] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6d5200]">
                          Temporary
                        </code>
                      ) : null}
                    </div>
                    {limit.detail ? <p className="mt-1 text-xs font-medium leading-5 text-[#6a5620]">{limit.detail}</p> : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {selectedRobot === "master" ? (
          <>
            <MasterHeartbeat />
            <MasterMotorMap />
            <MasterJointMotionGuide />
          </>
        ) : null}

        <div
          data-sdk-overview-grid="true"
          data-sdk-overview-count={groupedFunctions.length}
          className={`mt-6 grid gap-px overflow-hidden rounded-[22px] border border-black/8 bg-black/8 shadow-[0_20px_55px_rgba(17,17,17,0.06)] ${selectedRobot === "master" ? "md:grid-cols-3" : "md:grid-cols-4"}`}
        >
          {groupedFunctions.map((group) => (
            <a key={group.category} href={`#function-${group.category.toLowerCase().replaceAll(" ", "-")}`} className="bg-white/75 p-4 transition hover:bg-white">
              <p className="text-xs uppercase tracking-[0.14em] text-[#5f6368]">{group.category}</p>
              <p className="mt-2 text-3xl font-semibold text-[#111111]">{group.items.length}</p>
              <p className="mt-1 text-xs leading-5 text-[#5f6368]">commands</p>
            </a>
          ))}
        </div>

        <div className="mt-6 space-y-4">
          {groupedFunctions.map((group) => (
            <details
              key={group.category}
              id={`function-${group.category.toLowerCase().replaceAll(" ", "-")}`}
              className="group/category min-w-0 scroll-mt-6 overflow-hidden rounded-[22px] border border-black/8 bg-white/70 shadow-[0_20px_55px_rgba(17,17,17,0.06)]"
            >
              <summary
                data-sdk-category-summary="true"
                className="grid cursor-pointer list-none grid-cols-[32px_minmax(0,1fr)] items-center gap-x-4 gap-y-4 px-5 py-4 outline-none transition hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-[#1a73e8]/25 [&::-webkit-details-marker]:hidden sm:grid-cols-[32px_minmax(0,1fr)_auto]"
              >
                <span
                  data-sdk-category-arrow="true"
                  aria-hidden="true"
                  className="grid h-8 w-8 place-items-center text-sm text-[#111111] transition-transform group-open/category:rotate-90"
                >
                  ▶
                </span>
                <div data-sdk-category-copy="true" className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.14em] text-[#1a73e8]">{group.category}</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[#111111]">{group.category === "Actions" ? "Action" : group.category === "Joint Adjustments" ? "Joint Adjustment" : group.category} Commands</h2>
                  {group.category === "Movement" ? (
                    <p className="mt-2 text-sm leading-6 text-[#526174]">All commands in this section move the robot by moving its four feet.</p>
                  ) : null}
                  {group.category === "Posture" ? (
                    <p className="mt-2 text-sm leading-6 text-[#526174]">
                      {selectedRobot === "navi"
                        ? "Commands in this section set, hold, lower, or recover Navi's body posture."
                        : "All commands in this section use a four-foot planted hold, with all four feet remaining planted on the ground."}
                    </p>
                  ) : null}
                  {group.category === "Athletics" ? (
                    <p className="mt-2 text-sm leading-6 text-[#526174]">Jumps, flips, and kicks that move Navi&apos;s whole body.</p>
                  ) : null}
                  {group.category === "Actions" ? (
                    <p className="mt-2 text-sm leading-6 text-[#526174]">
                      {selectedRobot === "master"
                        ? "Master's supported standing gestures and fixed standing poses."
                        : "Expressive gestures and coordinated body motions. Timed actions return to standing automatically."}
                    </p>
                  ) : null}
                  {group.category === "Joint Adjustments" ? (
                    <p className="mt-2 text-sm leading-6 text-[#526174]">Fine standing adjustments for Master&apos;s qualified right wrist, elbow, and shoulder joints.</p>
                  ) : null}
                  {group.category === "Configuration" ? (
                    <p className="mt-2 text-sm leading-6 text-[#526174]">Range-checked gait, foot, floor-grip, jump, and collision settings. Physical calibration remains under development.</p>
                  ) : null}
                  {group.category === "Safety" && selectedRobot === "navi" ? (
                    <p className="mt-2 text-sm leading-6 text-[#526174]">Stop active movement normally or trigger Navi&apos;s software emergency-stop posture.</p>
                  ) : null}
                </div>
                <div className="col-start-2 flex w-full shrink-0 items-center justify-between gap-3 sm:col-start-3 sm:row-start-1 sm:w-auto sm:justify-start">
                  <span className="font-mono text-sm text-[#1a73e8]">{group.items.length} functions</span>
                  <span className="font-interface rounded-full border border-black/10 px-3 py-1 text-xs text-[#5f6368] group-open/category:hidden">View functions</span>
                  <span className="font-interface hidden rounded-full border border-[#1a73e8]/35 bg-[#eaf2fd] px-3 py-1 text-xs text-[#1a73e8] group-open/category:inline">Hide functions</span>
                </div>
              </summary>
              <div className="divide-y divide-black/8">
                {group.items.map((item) => (
                  <details key={item.name} className="group min-w-0 bg-white/55">
                    <summary className="grid min-w-0 cursor-pointer list-none items-center gap-3 px-4 py-4 outline-none transition hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-[#1a73e8]/25 md:grid-cols-[minmax(220px,0.8fr)_minmax(0,1fr)_260px]">
                      <p
                        data-sdk-function-signature="true"
                        className="min-w-0 justify-self-start break-words text-left font-mono text-xs leading-5 text-[#1a73e8] [overflow-wrap:anywhere]"
                      >
                        {compactFunctionSignature(item.signature)}
                      </p>
                      <p className="min-w-0 text-sm leading-6 text-[#303134]">{item.summary}</p>
                      <div className="flex flex-wrap items-center gap-2 justify-self-start md:justify-self-end">
                        {item.status === "development" || item.params.some((param) => param.status === "development") ? (
                          <span className="border border-[#d99a00] bg-[#fff8df] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8a5b00]">Under development</span>
                        ) : null}
                        {item.creditUsage === "high" ? (
                          <span className="border border-[#d97706] bg-[#fff7e6] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9a4d00]">High credit usage</span>
                        ) : null}
                        <span className="font-interface rounded-full border border-black/10 px-3 py-1 text-xs text-[#1a73e8] group-open:border-[#1a73e8]/35">details</span>
                      </div>
                    </summary>
                    <div className={`grid gap-px border-t border-black/8 bg-black/8 ${shouldHideReferencePreview(item, selectedRobot) ? "" : "lg:grid-cols-[minmax(0,1fr)_360px]"}`}>
                      <div className="min-w-0 bg-[#faf9f6] p-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-[#5f6368]">Definition</p>
                        <p className="mt-2 text-sm leading-6 text-[#303134]">{item.summary}</p>
                        {item.verification ? (
                          <div className="mt-3 border border-[#9cc9be] bg-[#e8f7f3] p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#006a5c]">Verification</p>
                            <p className="mt-1 text-xs leading-5 text-[#174b42]">{item.verification}</p>
                          </div>
                        ) : null}
                        {item.platformNote ? (
                          <div className="mt-3 border border-[#e1ad32] bg-[#fff8df] p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8a5b00]">{item.platformNoteLabel ?? "Platform note"}</p>
                            <p className="mt-1 text-xs leading-5 text-[#704b00]">{item.platformNote}</p>
                          </div>
                        ) : null}
                        {item.access?.tier === "premium" ? <PremiumFeaturePanel item={item} /> : null}
                        {item.profiles?.length ? (
                          <div className="mt-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs uppercase tracking-[0.14em] text-[#334155]">Parameter profiles</p>
                              <span className="border border-[#c9d8e8] bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#526174]">Choose one profile only</span>
                            </div>
                            <div className="mt-2 grid gap-2">
                              {item.profiles.map((profile, profileIndex) => (
                                <div key={profile.name} className={`border p-3 ${profile.status === "development" ? "border-[#e1ad32] bg-[#fffaf0]" : "border-[#dce7f2] bg-white"}`}>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="grid h-5 w-5 place-items-center rounded-[6px] bg-[#eaf2fd] font-mono text-[10px] font-bold text-[#1a73e8]">{profile.number ?? profileIndex + 1}</span>
                                    <span className="text-xs font-semibold text-[#111111]">{profile.name}</span>
                                    {profile.status === "development" ? <span className="border border-[#d99a00] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8a5b00]">Under Development</span> : null}
                                  </div>
                                  <p className="mt-2 whitespace-pre-wrap overflow-x-auto font-mono text-xs leading-5 text-[#006a5c]">{profileSyntaxWithPlaceholders(profile.syntax)}</p>
                                  {profile.note ? (
                                    <p className="mt-3 border border-[#e1ad32] bg-[#fff8df] p-3 text-xs leading-5 text-[#704b00]">
                                      <span className="font-semibold">{profile.noteLabel ?? "Distance note"}:</span> {profile.note}
                                    </p>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                            <p className="mt-2 text-xs leading-5 text-[#526174]">Do not combine selectors from different profiles. Optional modifiers shown inside a profile belong only to that structure.</p>
                          </div>
                        ) : null}
                        <p className="mt-4 text-xs uppercase tracking-[0.14em] text-[#334155]">Parameters</p>
                        <div className="mt-2 grid gap-2">
                          {item.params.length ? (
                            item.params.map((param) => (
                              <details key={param.name} className={`group/param border ${param.status === "development" ? "border-[#e1ad32] bg-[#fffaf0]" : param.status === "unsupported" ? "border-[#d88b8b] bg-[#fff5f5]" : "border-[#dce7f2] bg-white"}`}>
                                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 p-3 outline-none transition hover:bg-[#f8fbff] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#005bd6]/25">
                                  <span className="font-mono text-xs text-[#006a5c]">{param.name}</span>
                                  <span className="font-mono text-xs text-[#1a73e8]">{param.type}</span>
                                  {param.defaultValue ? <span className="font-mono text-xs text-[#a35d00]">default {param.defaultValue}</span> : null}
                                  {param.status === "development" ? (
                                    <span className="border border-[#d99a00] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8a5b00]">Under Development</span>
                                  ) : param.status === "unsupported" ? (
                                    <span className="border border-[#c93434] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#a51f1f]">Not Supported</span>
                                  ) : (
                                    <span className="border border-[#008a7a] bg-[#e8f7f3] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#006a5c]">Available</span>
                                  )}
                                  <span className="font-interface ml-auto border border-[#c9d8e8] bg-white px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-[#005bd6] group-open/param:border-[#008a7a] group-open/param:text-[#006a5c]">
                                    <span className="group-open/param:hidden">Details</span>
                                    <span className="hidden group-open/param:inline">Hide</span>
                                  </span>
                                </summary>
                                <div className="border-t border-inherit px-3 py-3">
                                  <p className="text-xs leading-5 text-[#334155]">{param.description}</p>
                                </div>
                              </details>
                            ))
                          ) : (
                            <p className="border border-[#dce7f2] bg-white p-3 text-xs text-[#334155]">No parameters.</p>
                          )}
                        </div>
                        {item.name === "lateral" ? null : (
                          <>
                            <p className="mt-4 text-xs uppercase tracking-[0.14em] text-[#334155]">Example</p>
                            <div className="relative mt-2 rounded-[12px] border border-black/8 bg-white/70">
                              <CopyCodeButton value={item.example} className="absolute right-2 top-2 z-10" />
                              <pre className="min-h-14 overflow-x-auto p-3 pr-16 font-mono text-xs leading-6 text-[#303134]">{item.example}</pre>
                            </div>
                          </>
                        )}
                      </div>
                      {shouldHideReferencePreview(item, selectedRobot) ? null : (
                        <div className="min-w-0 bg-white/70 p-4">
                          <p className="mb-3 font-mono text-xs uppercase tracking-[0.12em] text-[#1a73e8]">
                            {selectedRobot === "navi" && item.name === "lateral" ? "lateral_left" : item.name} {selectedRobot === "navi" ? "on Navi" : "preview"}
                          </p>
                          {selectedRobot === "master" ? (
                            <MasterSimulationPreviewPanel command={item.name} />
                          ) : selectedRobot === "navi" ? (
                            <NaviSimulationPreview command={resolvePreviewCommand(item.name)} />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={previewAssetForCode(item.example).gif}
                              alt={`Aegis preview for ${previewCommandLabel(previewAssetForCode(item.example).command)}`}
                              loading="lazy"
                              className="aspect-video w-full border border-[#dce7f2] bg-black object-contain"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function HardwareSimulationMedia({
  clip,
  robotModel
}: {
  clip: HardwareSimulationClip;
  robotModel: AgentechRobotModel;
}) {
  const isVideo = /\.(?:mp4|webm)(?:[?#]|$)/i.test(clip.asset);
  const alt = `${robotModel} preview for ${clip.label}`;

  if (isVideo) {
    return (
      <video
        key={clip.asset}
        src={clip.asset}
        aria-label={alt}
        autoPlay
        muted
        playsInline
        loop
        className="aspect-video w-full object-contain"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={clip.asset}
      src={clip.asset}
      alt={alt}
      className="aspect-video w-full object-contain"
    />
  );
}

function HardwareResultPanel({ result }: { result: HardwareResult }) {
  const passed = result.status === "PASS";
  const warning = result.status === "WARNING";
  const selectedRobotModel = normalizeAgentechRobotModel(result.robotModel) ?? "Aegies";
  const isNavi = selectedRobotModel === "Navi";
  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const activeClip = result.simulationClips[Math.min(activeClipIndex, Math.max(result.simulationClips.length - 1, 0))];

  useEffect(() => {
    setActiveClipIndex(0);
  }, [result.resultId]);

  useEffect(() => {
    if (!passed || result.simulationClips.length <= 1) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveClipIndex((current) => (current >= result.simulationClips.length - 1 ? 0 : current + 1));
    }, 1800);

    return () => window.clearInterval(interval);
  }, [passed, result.resultId, result.simulationClips.length]);

  return (
    <section className="bg-[#f5f4f1] px-4 pb-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="rounded-[22px] border border-black/8 bg-white/70 p-5 shadow-[0_28px_80px_rgba(17,17,17,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1a73e8]">Validation Result</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#111111]">Validation Checklist</h2>
            </div>
            <span className={`px-3 py-1.5 text-sm font-bold ${
              passed ? "bg-[#e7f7ef] text-[#087a43]" : warning ? "bg-[#fff7d6] text-[#9a6700]" : "bg-[#fdeceb] text-[#b42318]"
            }`}>
              {result.status}
            </span>
          </div>

          <div className="mt-5 overflow-hidden rounded-[14px] border border-black/8">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#eef5fb] text-xs uppercase tracking-[0.14em] text-[#526174]">
                <tr>
                  <th className="px-3 py-3">Check</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Meaning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#dce7f2]">
                {result.checklist.map((item) => (
                  <tr key={item.name}>
                    <td className="px-3 py-3 font-semibold text-[#07142e]">{item.name}</td>
                    <td className="px-3 py-3">
                      <span className={`px-2.5 py-1 text-xs font-bold ${
                        item.status === "PASS" ? "bg-[#e7f7ef] text-[#087a43]" : item.status === "WARNING" ? "bg-[#fff7d6] text-[#9a6700]" : "bg-[#fdeceb] text-[#b42318]"
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 leading-6 text-[#334155]">{item.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-[22px] border border-black/8 bg-white/70 p-5 shadow-[0_28px_80px_rgba(17,17,17,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1a73e8]">{isNavi ? "Navi SDK Hardware Preview" : "MuJoCo Simulation Video"}</p>
            <p className="mt-2 text-sm leading-6 text-[#334155]">
              {isNavi
                ? "The app validates the submitted commands against the latest reviewed Navi SDK. Navi execution uses the exact SDK calls after scheduling."
                : "The app reads the uploaded Agentech commands and shows what the code does on the selected robot."}
            </p>
            {passed && activeClip ? (
              <div className="mt-4">
                <div className="border border-[#dce7f2] bg-black">
                  <HardwareSimulationMedia
                    key={`${result.resultId}-${activeClipIndex}-${activeClip.command}`}
                    clip={activeClip}
                    robotModel={selectedRobotModel}
                  />
                </div>
                <div className="border-x border-b border-[#dce7f2] bg-[#f8fbff] px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#005bd6]">
                      Playing {selectedRobotModel} preview {activeClipIndex + 1} / {result.simulationClips.length}: {activeClip.label}
                    </p>
                    <p className="font-mono text-xs text-[#526174]">{activeClip.sourceLine}</p>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {result.simulationClips.map((clip, index) => (
                      <button
                        key={`${clip.sourceLine}-${index}`}
                        type="button"
                        onClick={() => setActiveClipIndex(index)}
                        className={`border px-3 py-2 text-left font-mono text-xs transition ${
                          index === activeClipIndex
                            ? "border-[#008a7a] bg-[#e8f7f3] text-[#006a5c]"
                            : "border-[#dce7f2] bg-white text-[#334155] hover:border-[#008a7a]"
                        }`}
                      >
                        {index + 1}. {clip.sourceLine}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid min-h-72 place-items-center border border-[#f1b4ad] bg-[#fff4f2] text-center text-[#b42318]">
                <div className="p-6">
                  <div className="text-[118px] font-extrabold leading-none">X</div>
                  <p className="mt-2 text-base font-bold">{isNavi ? "Navi execution blocked because validation failed." : "Simulation blocked because validation failed."}</p>
                  <p className="mt-2 text-sm leading-6 text-[#7f1d1d]">{result.simulationError}</p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="rounded-[22px] border border-black/8 bg-white/70 p-5 shadow-[0_28px_80px_rgba(17,17,17,0.08)]">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1a73e8]">Selected Company Robot</p>
              <div className="mt-4 divide-y divide-[#dce7f2] border border-[#dce7f2] text-sm">
                <div className="grid grid-cols-[120px_minmax(0,1fr)]">
                  <div className="bg-[#f8fbff] px-3 py-3 font-semibold text-[#526174]">Robot</div>
                  <div className="px-3 py-3 text-[#07142e]">{result.robotModel}</div>
                </div>
                <div className="grid grid-cols-[120px_minmax(0,1fr)]">
                  <div className="bg-[#f8fbff] px-3 py-3 font-semibold text-[#526174]">Result ID</div>
                  <div className="break-all px-3 py-3 font-mono text-xs text-[#07142e]">{result.resultId}</div>
                </div>
              </div>
            </div>

            <div className="rounded-[22px] border border-black/8 bg-white/70 p-5 shadow-[0_28px_80px_rgba(17,17,17,0.08)]">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1a73e8]">Code Validation</p>
              <div className="mt-4 divide-y divide-[#dce7f2] border border-[#dce7f2] text-sm">
                <div className="grid grid-cols-[100px_minmax(0,1fr)] sm:grid-cols-[120px_minmax(0,1fr)]">
                  <div className="bg-[#f8fbff] px-3 py-3 font-semibold text-[#526174]">Source</div>
                  <div className="min-w-0 break-words px-3 py-3 text-[#07142e] [overflow-wrap:anywhere]">{result.fileName}</div>
                </div>
                <div className="grid grid-cols-[100px_minmax(0,1fr)] sm:grid-cols-[120px_minmax(0,1fr)]">
                  <div className="bg-[#f8fbff] px-3 py-3 font-semibold text-[#526174]">Commands</div>
                  <div className="min-w-0 px-3 py-3 text-[#07142e]">{result.commandCount}</div>
                </div>
                <div className="grid grid-cols-[100px_minmax(0,1fr)] sm:grid-cols-[120px_minmax(0,1fr)]">
                  <div className="bg-[#f8fbff] px-3 py-3 font-semibold text-[#526174]">SDK Rule</div>
                  <div className="min-w-0 break-words px-3 py-3 text-[#07142e]">Only Agentech SDK is allowed.</div>
                </div>
                <div className="grid grid-cols-[100px_minmax(0,1fr)] sm:grid-cols-[120px_minmax(0,1fr)]">
                  <div className="bg-[#f8fbff] px-3 py-3 font-semibold text-[#526174]">Move Box</div>
                  <div className="min-w-0 break-words px-3 py-3 text-[#07142e] [overflow-wrap:anywhere]">
                    {result.movementSafety.level}: max {result.movementSafety.maxDistanceMeters.toFixed(3)}m, dx {result.movementSafety.maxDxMeters.toFixed(3)}m, dy {result.movementSafety.maxDyMeters.toFixed(3)}m
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-[22px] border border-black/8 bg-white/70 p-5 shadow-[0_28px_80px_rgba(17,17,17,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1a73e8]">Agentech Movement List</p>
            <div className="mt-4 overflow-hidden border border-[#dce7f2]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#eef5fb] text-xs uppercase tracking-[0.14em] text-[#526174]">
                  <tr>
                    <th className="px-3 py-3">#</th>
                    <th className="px-3 py-3">Command</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dce7f2]">
                  {result.motionPlan.map((line, index) => (
                    <tr key={`${line}-${index}`}>
                      <td className="w-16 px-3 py-3 font-mono text-xs text-[#526174]">{index + 1}</td>
                      <td className="px-3 py-3 font-mono text-xs text-[#07142e]">{line}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[22px] border border-black/8 bg-white/70 p-5 shadow-[0_28px_80px_rgba(17,17,17,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1a73e8]">Final Status</p>
            <p className="mt-4">
              <span className={`px-3 py-1.5 text-sm font-bold ${
                passed ? "bg-[#e7f7ef] text-[#087a43]" : warning ? "bg-[#fff7d6] text-[#9a6700]" : "bg-[#fdeceb] text-[#b42318]"
              }`}>
                {result.status}
              </span>
            </p>
            <p className="mt-4 text-sm leading-6 text-[#334155]">{result.finalHint}</p>
            {passed ? (
              <button
                type="button"
                className="mt-4 w-full rounded-full border border-[#1a73e8] bg-[#1a73e8] px-4 py-3 text-sm font-semibold text-white"
              >
                Submit for Further Review
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="mt-4 w-full cursor-not-allowed rounded-full border border-black/10 bg-[#efede8] px-4 py-3 text-sm font-semibold text-[#7d8b9c]"
              >
                Submit for Further Review
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function AgentechLibraryWorkbench({ task }: AgentechLibraryWorkbenchProps = {}) {
  const [code, setCode] = useState(() => (task ? "from agentech import Agentech\n\n" : aegisStarterCode));
  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [activeName, setActiveName] = useState("stand");
  const [requestStatus, setRequestStatus] = useState("Ready for Code Certification. Run Hardware Safety first; Software Security unlocks after it passes.");
  const [reviewInputError, setReviewInputError] = useState("");
  const [isDraggingCodeFile, setIsDraggingCodeFile] = useState(false);
  const developerName = "Agentech developer";
  const [robotModel, setRobotModel] = useState<AgentechRobotModel>("Aegies");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploadedOriginalCode, setUploadedOriginalCode] = useState("");
  const [approvedCodeFile, setApprovedCodeFile] = useState<ApprovedCodeFile | null>(null);
  const [physicalSubmissionId, setPhysicalSubmissionId] = useState("");
  const [physicalSafetyPassed, setPhysicalSafetyPassed] = useState(false);
  const [isRunningPhysicalCheck, setIsRunningPhysicalCheck] = useState(false);
  const [isRunningSoftwareCheck, setIsRunningSoftwareCheck] = useState(false);
  const [isLoadingReviewGate, setIsLoadingReviewGate] = useState(task === "software-check");
  const [isInternalCompanyAccount, setIsInternalCompanyAccount] = useState(false);
  const [masterLiveTestAccess, setMasterLiveTestAccess] = useState(false);
  const [masterLiveTestSelected, setMasterLiveTestSelected] = useState(false);
  const [masterLiveTestExpiresAt, setMasterLiveTestExpiresAt] = useState("");
  const [canScheduleRobotSlot, setCanScheduleRobotSlot] = useState(false);
  const [softwareReviewStatus, setSoftwareReviewStatus] = useState<"locked" | "pending" | "passed" | "failed" | "error">("locked");
  const [submissionQuery, setSubmissionQuery] = useState({ ready: false, id: "" });
  const [reviewResetKey, setReviewResetKey] = useState(0);
  const [hardwareResult, setHardwareResult] = useState<HardwareResult | null>(null);
  const initialPreview = previewAssetForCode(aegisStarterCode, "stand");
  const [previewGif, setPreviewGif] = useState<string>(initialPreview.gif);
  const [previewCommand, setPreviewCommand] = useState<string>(initialPreview.command);
  const [previewStatus, setPreviewStatus] = useState(
    "MuJoCo simulator preview ready. Choose Aegies or Navi, then run your code."
  );
  const [isSimulating, setIsSimulating] = useState(false);
  const [simFrames, setSimFrames] = useState<SimFrame[]>([{ x: 0, y: 0, z: 0.37, yaw: 0, pitch: 0 }]);
  const [simFrameIndex, setSimFrameIndex] = useState(0);
  const [renderedFrames, setRenderedFrames] = useState<string[]>([]);
  const displayedRobotModel = masterLiveTestSelected ? "Master" : robotModel;
  const codeCheckingRobotOptions = getCodeCheckingRobotOptions(robotModelOptions, masterLiveTestAccess);
  const masterPresentation = masterLiveTestPresentation(masterLiveTestExpiresAt);

  const filteredFunctions = useMemo(
    () => aegisFunctions.filter((item) => activeCategory === "All" || item.category === activeCategory),
    [activeCategory]
  );

  const activeFunction = aegisFunctions.find((item) => item.name === activeName) ?? aegisFunctions[0];
  const plan = useMemo(() => commandPlan(code, robotModel), [code, robotModel]);
  const previewPlan = useMemo(() => commandPlan(prepareMuJoCoCode(code), robotModel), [code, robotModel]);
  const renderedFrame = renderedFrames[Math.min(simFrameIndex, renderedFrames.length - 1)];
  const previewFrameCount = renderedFrames.length || simFrames.length;
  const selectedTask = task ? getAgentechLibraryTask(task) : undefined;
  const runMode = masterLiveTestSelected
    ? "Master live stream test (view only)"
    : selectedTask?.slug === "software-check" ? "Code certification" : "Physical hardware limit and capability test";
  const runModeDescription =
    masterLiveTestSelected
      ? masterPresentation.viewOnlyNotice
      : selectedTask?.slug === "software-check"
      ? "Run Hardware Safety first. After it passes, click Run Software Security to scan the exact same file."
      : "Step 3 checks physical limits, robot capability, command duration, speed, angle, and risky movements.";
  const showHero = !selectedTask;
  const showOverview = !selectedTask;
  const showWorkbench = !selectedTask;
  const showFocusedReview = selectedTask?.slug === "software-check";
  const focusedReviewStep = masterLiveTestSelected
    ? "Master - View-Only Live Test"
    : selectedTask?.slug === "software-check" ? "Step 3 - Code Certification" : "Step 3 - Physical Hardware Check";
  const focusedReviewCopy =
    masterLiveTestSelected
      ? "Enter any test text, then create a 3-minute Master viewing session. The text is recorded only for audit and never executes on the robot."
      : selectedTask?.slug === "software-check"
      ? "Complete Hardware Safety first, then run Software Security. Passing both unlocks a robot time-slot request."
      : "Physical Hardware Check runs first. It protects the robot body by checking command limits, motion duration, model compatibility, and risky movements.";
  const hardwarePassed = physicalSafetyPassed && hardwareResult?.status === "PASS";
  const hardwareWarning = hardwareResult?.status === "WARNING";
  const hardwareFailed = hardwareResult?.status === "FAIL";
  const softwarePassed = canScheduleRobotSlot;
  const softwareFailed = softwareReviewStatus === "failed" || softwareReviewStatus === "error";
  const step3PanelClass = hardwarePassed
    ? "border-[#008a7a] bg-[#e8f7f3]"
    : hardwareWarning
      ? "border-[#d99a00] bg-[#fff8df]"
    : hardwareFailed
      ? "border-[#c93434] bg-[#fff1f1]"
      : "border-black/8 bg-[#faf9f6]";
  const step4PanelClass = softwarePassed
    ? "border-[#008a7a] bg-[#e8f7f3]"
    : softwareFailed
      ? "border-[#c93434] bg-[#fff1f1]"
    : hardwarePassed
      ? "border-[#008a7a] bg-white"
      : "border-black/8 bg-[#faf9f6]";
  const showFocusedStartCoding = selectedTask?.slug === "start-coding";
  const showFocusedBrowseFunctions = selectedTask?.slug === "view-sdk";
  const showFocusedLiveRun = selectedTask?.slug === "watch-live-run";
  const showDocs = !selectedTask;
  const useLightTaskPage = Boolean(selectedTask);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("submissionId")?.trim() ?? "";
    setSubmissionQuery({ ready: true, id });
  }, []);

  useEffect(() => {
    if (!showFocusedReview) {
      setIsLoadingReviewGate(false);
      return;
    }

    if (!submissionQuery.ready) {
      return;
    }

    const controller = new AbortController();
    let active = true;

    async function loadLatestReviewGate() {
      setIsLoadingReviewGate(selectedTask?.slug === "software-check" || Boolean(submissionQuery.id));
      try {
        const endpoint = submissionQuery.id
          ? `/api/agentech-code-submit?submissionId=${encodeURIComponent(submissionQuery.id)}`
          : "/api/agentech-code-submit";
        const response = await fetch(endpoint, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal
        });
        const payload = (await response.json().catch(() => ({ error: "The saved review result could not be read." }))) as {
          error?: string;
          internalAccount?: boolean;
          localPreview?: boolean;
          masterLiveTestAccess?: boolean;
          latestSubmission?: {
            id: string;
            developerName?: string;
            robotModel?: string;
            code: string;
            uploadedFileName?: string | null;
            physicalSafetyStatus: string;
            aiSecurityStatus: string;
          } | null;
        };

        if (!active) {
          return;
        }

        setIsInternalCompanyAccount(payload.internalAccount === true);
        setMasterLiveTestAccess(payload.masterLiveTestAccess === true);
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load the latest Physical Hardware Check.");
        }

        if (payload.masterLiveTestAccess === true) {
          const masterStatusResponse = await fetch("/api/master-live-test", {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          });
          const masterStatus = await masterStatusResponse.json().catch(() => ({ latestAudit: null, activeSession: null })) as {
            latestAudit?: {
              id: string;
              code: string;
              uploadedFileName?: string | null;
              physicalSafetyStatus?: string;
              aiSecurityStatus?: string;
            } | null;
            activeSession?: {
              robotModel?: string | null;
              scheduledStart?: string | null;
              scheduledEnd?: string | null;
            } | null;
          };
          const activeMasterSession = masterStatusResponse.ok && isMasterLiveSessionActive({
            active: Boolean(masterStatus.activeSession),
            session: masterStatus.activeSession,
          });
          if (
            activeMasterSession
            && masterStatus.latestAudit?.physicalSafetyStatus === "passed"
            && masterStatus.latestAudit.aiSecurityStatus === "passed"
          ) {
            const audit = masterStatus.latestAudit;
            setMasterLiveTestSelected(true);
            setCode(audit.code);
            setUploadedFileName(audit.uploadedFileName ?? "");
            setUploadedOriginalCode(audit.code);
            setApprovedCodeFile({
              code: audit.code,
              downloadFileName: "master-view-only-test.txt",
              sourceFileName: audit.uploadedFileName || "view-only-test.txt",
              source: audit.uploadedFileName ? "uploaded" : "editor",
              editedOnWebsite: false,
            });
            setPhysicalSubmissionId(audit.id);
            setPhysicalSafetyPassed(true);
            setSoftwareReviewStatus("passed");
            setCanScheduleRobotSlot(true);
            setMasterLiveTestExpiresAt(masterStatus.activeSession?.scheduledEnd ?? "");
            setHardwareResult(masterViewOnlyHardwareResult(audit.id, audit.uploadedFileName || "view-only test artifact"));
            setRequestStatus("Active Master view-only session restored from the dedicated Master status. Open Master Live Stream before it expires.");
            return;
          }
        }

        let cachedSubmission: CachedPhysicalReview | null = null;
        try {
          cachedSubmission = JSON.parse(window.sessionStorage.getItem("agentech-latest-physical-review") ?? "null");
        } catch {
          cachedSubmission = null;
        }

        let latestSubmission = payload.latestSubmission ?? null;
        if (!latestSubmission && payload.localPreview) {
          latestSubmission = cachedSubmission;
        }

        if (!latestSubmission || latestSubmission.physicalSafetyStatus !== "passed") {
          setRequestStatus("Run and pass Step 3 Physical Hardware Check before starting Step 4 Software Check.");
          return;
        }

        if (latestSubmission.robotModel === "Master") {
          if (payload.masterLiveTestAccess !== true) {
            setRequestStatus("This account does not have access to the Master live test.");
            return;
          }
          setMasterLiveTestSelected(true);
          setCode(latestSubmission.code);
          setUploadedFileName(latestSubmission.uploadedFileName ?? "");
          setUploadedOriginalCode(latestSubmission.code);
          setApprovedCodeFile({
            code: latestSubmission.code,
            downloadFileName: "master-view-only-test.txt",
            sourceFileName: latestSubmission.uploadedFileName || "view-only-test.txt",
            source: latestSubmission.uploadedFileName ? "uploaded" : "editor",
            editedOnWebsite: false,
          });
          setPhysicalSubmissionId(latestSubmission.id);
          setPhysicalSafetyPassed(true);
          const activeSessionResponse = await fetch("/api/agentech-live-session", {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          });
          const activeSessionPayload = await activeSessionResponse.json().catch(() => ({ active: false, session: null }));
          const masterSessionActive = activeSessionResponse.ok && isMasterLiveSessionActive(activeSessionPayload);
          const activeSessionEnd = masterSessionActive && typeof activeSessionPayload.session?.scheduledEnd === "string"
            ? activeSessionPayload.session.scheduledEnd
            : "";
          setSoftwareReviewStatus(masterSessionActive ? "passed" : "locked");
          setCanScheduleRobotSlot(masterSessionActive);
          setMasterLiveTestExpiresAt(activeSessionEnd);
          setHardwareResult(masterViewOnlyHardwareResult(latestSubmission.id, latestSubmission.uploadedFileName || "view-only test artifact"));
          setRequestStatus(
            masterSessionActive
              ? "Active Master view-only session restored. Open Master Live Stream before it expires. Submitted text will not execute."
              : "Master view-only audit restored, but there is no active session. Start a new 3-minute live test to unlock the cameras."
          );
          return;
        }

        const restoredRobotModel = normalizeAgentechRobotModel(latestSubmission.robotModel) ?? "Aegies";
        const restoredCode = ensureRequiredStand(latestSubmission.code);
        const restoredPlan = commandPlan(restoredCode, restoredRobotModel);
        const movementSafety = evaluateAgentechMovementSafety(restoredCode, restoredRobotModel);
        setRobotModel(restoredRobotModel);
        setCode(restoredCode);
        setUploadedFileName(latestSubmission.uploadedFileName ?? "");
        const cachedSubmissionMatches = cachedSubmission?.id === latestSubmission.id;
        const cachedReview = cachedSubmissionMatches ? cachedSubmission : null;
        const restoredSourceFileName = latestSubmission.uploadedFileName || "website-editor.py";
        setUploadedOriginalCode(
          cachedReview && typeof cachedReview.originalCode === "string"
            ? cachedReview.originalCode
            : restoredCode
        );
        setApprovedCodeFile({
          code: restoredCode,
          downloadFileName:
            cachedReview?.downloadFileName
              ? cachedReview.downloadFileName
              : approvedDownloadFileName(restoredSourceFileName),
          sourceFileName: restoredSourceFileName,
          source: latestSubmission.uploadedFileName ? "uploaded" : "editor",
          editedOnWebsite: cachedReview?.editedOnWebsite === true
        });
        setPhysicalSubmissionId(latestSubmission.id);
        setPhysicalSafetyPassed(true);
        setSoftwareReviewStatus(latestSubmission.aiSecurityStatus as "locked" | "pending" | "passed" | "failed" | "error");
        setCanScheduleRobotSlot(latestSubmission.aiSecurityStatus === "passed");
        setHardwareResult({
          status: "PASS",
          resultId: latestSubmission.id,
          robotModel: restoredRobotModel,
          fileName: latestSubmission.uploadedFileName || "pasted code",
          commandCount: restoredPlan.trace.length,
          checklist: buildHardwareChecklist("PASS", "", movementSafety, restoredRobotModel),
          motionPlan: restoredPlan.trace,
          simulationClips: simulationClipsForMotionPlan(restoredPlan.trace, restoredRobotModel),
          simulationError: "",
          finalHint: "The saved Physical Hardware Check passed. This submission is ready for Software Check.",
          movementSafety
        });
        setRequestStatus(
          latestSubmission.aiSecurityStatus === "passed"
            ? `Step 4 Software Check already passed for review ${latestSubmission.id}. Step 5 Live Stream scheduling is unlocked.`
            : latestSubmission.aiSecurityStatus === "locked"
              ? `Saved Step 3 Physical Hardware Check restored. Step 4 Software Check is unlocked. Review ID: ${latestSubmission.id}.`
              : `Saved submission restored. Its one Software Check has status: ${latestSubmission.aiSecurityStatus}. Review ID: ${latestSubmission.id}.`
        );
      } catch (error) {
        if (!active || (error instanceof Error && error.name === "AbortError")) {
          return;
        }
        const message = error instanceof Error ? error.message : "Unable to load the latest Physical Hardware Check.";
        setReviewInputError(message);
        setRequestStatus(message);
      } finally {
        if (active) {
          setIsLoadingReviewGate(false);
        }
      }
    }

    void loadLatestReviewGate();
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedTask?.slug, showFocusedReview, submissionQuery]);

  useEffect(() => {
    if (renderedFrames.length <= 1) {
      return;
    }

    setSimFrameIndex(0);
    const interval = window.setInterval(() => {
      setSimFrameIndex((current) => (current >= renderedFrames.length - 1 ? 0 : current + 1));
    }, 42);

    return () => window.clearInterval(interval);
  }, [renderedFrames]);

  useEffect(() => {
    if (!masterLiveTestSelected || !canScheduleRobotSlot || !masterLiveTestExpiresAt) return;

    const expireMasterLiveTest = () => {
      setCanScheduleRobotSlot(false);
      setSoftwareReviewStatus("locked");
      setRequestStatus("The 3-minute Master view-only session expired. Start a new test to unlock the livestream again.");
    };
    const remaining = millisecondsUntilMasterLiveTestExpiry(masterLiveTestExpiresAt);
    if (remaining === 0) {
      expireMasterLiveTest();
      return;
    }

    const timeout = window.setTimeout(expireMasterLiveTest, Math.min(remaining, 2_147_483_647));
    return () => window.clearTimeout(timeout);
  }, [canScheduleRobotSlot, masterLiveTestExpiresAt, masterLiveTestSelected]);

  function resetPreview(nextCode = code, preferredCommand?: string, selectedModel: AgentechRobotModel = robotModel) {
    const nextPreview = previewAssetForCode(nextCode, preferredCommand);
    setPreviewStatus(
      selectedModel === "Navi"
        ? "Navi MuJoCo simulator ready. The supplied translator will validate, translate, and render this code."
        : useRealMuJoCoPreview
          ? "Local simulator preview ready. Run your code to render the real Aegis model."
          : "Official GIF preview ready. Run your code to play a matching clip."
    );
    setPreviewGif(nextPreview.gif);
    setPreviewCommand(nextPreview.command);
    setRenderedFrames([]);
    setSimFrames([{ x: 0, y: 0, z: 0.37, yaw: 0, pitch: 0 }]);
    setSimFrameIndex(0);
  }

  function updateCode(nextCode: string, preferredCommand?: string, selectedModel: AgentechRobotModel = robotModel) {
    const normalizedCode = ensureRequiredStand(nextCode);
    setCode(normalizedCode);
    if (commandPlan(normalizedCode, selectedModel).trace.length) {
      setReviewInputError("");
    }
    setPhysicalSubmissionId("");
    setPhysicalSafetyPassed(false);
    setSoftwareReviewStatus("locked");
    setCanScheduleRobotSlot(false);
    setHardwareResult(null);
    setApprovedCodeFile(null);
    window.sessionStorage.removeItem("agentech-latest-physical-review");
    resetPreview(normalizedCode, preferredCommand, selectedModel);
  }

  function updateMasterLiveTestText(nextText: string) {
    setCode(nextText);
    setReviewInputError("");
    setPhysicalSubmissionId("");
    setPhysicalSafetyPassed(false);
    setSoftwareReviewStatus("locked");
    setCanScheduleRobotSlot(false);
    setHardwareResult(null);
    setApprovedCodeFile(null);
    setMasterLiveTestExpiresAt("");
    window.sessionStorage.removeItem("agentech-latest-physical-review");
    setRequestStatus(masterPresentation.viewOnlyNotice);
  }

  function changeRobotModel(value: string) {
    const nextModel = normalizeAgentechRobotModel(value);
    if (!nextModel || nextModel === robotModel) return;
    setRobotModel(nextModel);
    updateCode(code, undefined, nextModel);
    setRequestStatus(`Selected ${nextModel}. Run Hardware Safety again so this code is checked against the ${nextModel} SDK.`);
  }

  function changeCodeCheckingRobotModel(value: string) {
    const selection = selectCodeCheckingRobotModel(value, masterLiveTestAccess, robotModel);
    if (selection.masterLiveTestSelected) {
      setMasterLiveTestSelected(true);
      setMasterLiveTestExpiresAt("");
      setPhysicalSubmissionId("");
      setPhysicalSafetyPassed(false);
      setSoftwareReviewStatus("locked");
      setCanScheduleRobotSlot(false);
      setHardwareResult(null);
      setApprovedCodeFile(null);
      setReviewInputError("");
      setRequestStatus(masterPresentation.viewOnlyNotice);
      return;
    }

    const wasMasterLiveTestSelected = masterLiveTestSelected;
    setMasterLiveTestSelected(false);
    setMasterLiveTestExpiresAt("");
    if (wasMasterLiveTestSelected && selection.normalRobotModel === robotModel) {
      updateCode(code, undefined, robotModel);
      setRequestStatus(`Selected ${robotModel}. Run Hardware Safety again so this code is checked against the ${robotModel} SDK.`);
    } else {
      changeRobotModel(selection.normalRobotModel);
    }
  }

  function checkAnotherCode() {
    const nextCode = "from agentech import Agentech\n\n";
    setUploadedFileName("");
    setUploadedOriginalCode("");
    setReviewInputError("");
    setSubmissionQuery({ ready: false, id: "" });
    setIsLoadingReviewGate(false);
    setReviewResetKey((current) => current + 1);
    window.sessionStorage.removeItem("agentech-latest-physical-review");
    const url = new URL(window.location.href);
    url.searchParams.delete("submissionId");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    if (masterLiveTestSelected) {
      updateMasterLiveTestText("");
      setRequestStatus(masterPresentation.viewOnlyNotice);
    } else {
      updateCode(nextCode);
      setRequestStatus("Ready for another code submission. Upload a new file or paste code, then run Hardware Safety.");
    }
  }

  async function loadUploadedCodeFile(file: File | null) {
    if (softwarePassed) {
      return;
    }
    if (!file) {
      return;
    }

    if (!/\.(?:py|txt)$/i.test(file.name)) {
      const message = "Choose a Python (.py) or text (.txt) code file.";
      setReviewInputError(message);
      setRequestStatus(message);
      return;
    }

    const text = await file.text();
    setUploadedFileName(file.name);
    setUploadedOriginalCode(text);
    if (masterLiveTestSelected) {
      updateMasterLiveTestText(text);
      setRequestStatus(`${file.name} loaded as a view-only test artifact. Submitted text will not execute on Master.`);
      return;
    }
    updateCode(text);
    if (!text.trim()) {
      const message = `${file.name} is empty. Add at least one Agentech command before running the check.`;
      setReviewInputError(message);
      setRequestStatus(message);
      return;
    }

    setReviewInputError("");
    setRequestStatus(`${file.name} loaded. Run Step 3 Physical Hardware Check first.`);
  }

  function handleCodeFileDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDraggingCodeFile(false);
    void loadUploadedCodeFile(event.dataTransfer.files?.[0] ?? null);
  }

  function downloadApprovedCodeFile() {
    if (!approvedCodeFile) {
      return;
    }

    const contents = approvedCodeFile.code.endsWith("\n") ? approvedCodeFile.code : `${approvedCodeFile.code}\n`;
    const url = URL.createObjectURL(new Blob([contents], { type: "text/x-python;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = approvedCodeFile.downloadFileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function loadExample(item: AgentechFunction) {
    const nextCode = ensureRequiredStand(`from agentech import Agentech\n\n${item.example}`);
    setActiveName(item.name);
    updateCode(nextCode, item.name);
  }

  function loadCategory(category: Category) {
    const example = categoryExamples[category];
    setActiveCategory(category);
    setActiveName(example.activeName);
    updateCode(example.code, example.activeName);
  }

  async function runPreviewSimulation() {
    const runnableCode = prepareMuJoCoCode(code);
    setIsSimulating(true);
    const primary = detectPrimaryPreviewCommand(runnableCode);
    setPreviewCommand(primary);
    setPreviewGif(localPreviewAssets[primary] ?? localPreviewFallback);
    setRenderedFrames([]);
    setSimFrameIndex(0);

    if (!useRealMuJoCoPreview) {
      setPreviewStatus(`Playing official GIF preview for ${previewCommandLabel(primary)}.`);
      setIsSimulating(false);
      return;
    }

    setPreviewStatus(`Running ${robotModel} MuJoCo simulator preview...`);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 55_000);
    try {
      const response = await fetch("/api/agentech-simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: runnableCode, robotModel }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({ error: "Simulation returned an unreadable response." }));
      if (!response.ok) {
        throw new Error(payload.error ?? "Simulation failed");
      }
      const frames = Array.isArray(payload.frames) && payload.frames.length ? payload.frames : [];
      const rendered = Array.isArray(payload.rendered_frames) ? payload.rendered_frames : [];
      setSimFrames(frames.length ? frames : [{ x: 0, y: 0, z: 0.37, yaw: 0, pitch: 0 }]);
      setRenderedFrames(rendered);
      const pose = payload.final_pose ?? frames.at(-1) ?? {};
      const yaw = Number(pose.yaw ?? 0);
      const pitch = Number(pose.pitch ?? 0);
      setPreviewStatus(`${robotModel} MuJoCo rendered ${payload.steps ?? 0} steps. yaw=${yaw.toFixed(1)}deg, tilt=${pitch.toFixed(1)}deg.`);
    } catch (error) {
      setRenderedFrames([]);
      const fallback = robotModel === "Navi"
        ? "The Navi reference image remains available."
        : `Showing ${previewCommandLabel(primary)} GIF instead.`;
      setPreviewStatus(
        error instanceof Error && error.name === "AbortError"
          ? `${robotModel} simulator timed out. ${fallback}`
          : error instanceof Error
            ? `${error.message} ${fallback}`
            : `${robotModel} simulator failed. ${fallback}`
      );
    } finally {
      window.clearTimeout(timeout);
      setIsSimulating(false);
    }
  }

  async function runMasterLiveTest() {
    setReviewInputError("");
    setIsRunningPhysicalCheck(true);
    setRequestStatus("Creating a 3-minute view-only Master live test...");
    try {
      const response = await fetch("/api/master-live-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildMasterLiveTestPayload(code, uploadedFileName)),
      });
      const payload = await response.json().catch(() => ({
        error: "The Master live-test response could not be read.",
      }));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to start the Master live test.");
      }

      const expiresAt = typeof payload.expiresAt === "string" ? payload.expiresAt : "";
      const expirationTime = expiresAt ? new Date(expiresAt).toLocaleTimeString() : "the session end";
      setPhysicalSubmissionId(payload.submissionId);
      setPhysicalSafetyPassed(true);
      setSoftwareReviewStatus("passed");
      setCanScheduleRobotSlot(true);
      setMasterLiveTestExpiresAt(expiresAt);
      setApprovedCodeFile({
        code,
        downloadFileName: "master-view-only-test.txt",
        sourceFileName: uploadedFileName || "view-only-test.txt",
        source: uploadedFileName ? "uploaded" : "editor",
        editedOnWebsite: Boolean(uploadedFileName && code !== uploadedOriginalCode),
      });
      setHardwareResult(masterViewOnlyHardwareResult(payload.submissionId, uploadedFileName || "view-only test artifact"));
      setRequestStatus(`Master view-only test unlocked until ${expirationTime}. No submitted text will execute on the robot.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start the Master live test.";
      setReviewInputError(message);
      setRequestStatus(message);
    } finally {
      setIsRunningPhysicalCheck(false);
    }
  }

  async function runPhysicalSafetyCheck(continueToSoftware = false) {
    if (masterLiveTestSelected) {
      await runMasterLiveTest();
      return;
    }

    const reviewCode = ensureRequiredStand(code);
    if (reviewCode !== code) {
      setCode(reviewCode);
    }
    const reviewPlan = commandPlan(reviewCode, robotModel);
    if (!reviewCode.trim() || !reviewPlan.trace.length) {
      const message = "Add at least one supported Agentech command in the editor before running the check.";
      setPhysicalSubmissionId("");
      setPhysicalSafetyPassed(false);
      setSoftwareReviewStatus("locked");
      setCanScheduleRobotSlot(false);
      setHardwareResult(null);
      setReviewInputError(message);
      setRequestStatus(message);
      return;
    }

    const movementSafety = evaluateAgentechMovementSafety(reviewCode, robotModel);
    setReviewInputError("");
    setIsRunningPhysicalCheck(true);
    setPhysicalSubmissionId("");
    setPhysicalSafetyPassed(false);
    setSoftwareReviewStatus("locked");
    setCanScheduleRobotSlot(false);
    setHardwareResult(null);
    setApprovedCodeFile(null);
    setRequestStatus("Running Step 3 Physical Hardware Check...");
    try {
      if (!movementSafety.submitReady) {
        setHardwareResult({
          status: movementSafety.level,
          resultId: `blocked-${Date.now()}`,
          robotModel,
          fileName: uploadedFileName || "pasted code",
          commandCount: reviewPlan.motionCount,
          checklist: buildHardwareChecklist(movementSafety.level, movementSafety.detail, movementSafety, robotModel),
          motionPlan: reviewPlan.trace,
          simulationClips: [],
          simulationError: movementSafety.detail,
          finalHint: "Submission is locked when movement exceeds the 1.0m physical test boundary.",
          movementSafety
        });
        setRequestStatus(movementSafety.detail);
        return;
      }

      const response = await fetch("/api/agentech-code-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewStage: "physical",
          developerName,
          robotModel,
          runMode: "Physical hardware limit and capability test",
          code: reviewCode,
          uploadedFileName,
          commands: reviewPlan.trace
        })
      });
      const payload = await response.json().catch(() => ({
        error: "The review service returned an unreadable response. Please retry.",
        errorCode: "REVIEW_SERVICE_ERROR"
      }));
      if (!response.ok) {
        const message = payload.error ?? "Physical Hardware Check failed.";
        const requestErrorCodes = new Set(["AUTH_REQUIRED", "CODE_REQUIRED", "ACCOUNT_NOT_FOUND", "REVIEW_SERVICE_ERROR"]);
        if (requestErrorCodes.has(payload.errorCode) || response.status >= 500) {
          setHardwareResult(null);
          setReviewInputError(message);
          setRequestStatus(message);
          return;
        }

        const responseMovementSafety = payload.movementSafety as AgentechMovementSafety | undefined;
        const blockedSafety = responseMovementSafety ?? defaultMovementSafety("FAIL", "Movement safety was not evaluated because code validation failed.");
        setHardwareResult({
          status: blockedSafety.level,
          resultId: `blocked-${Date.now()}`,
          robotModel,
          fileName: uploadedFileName || "pasted code",
          commandCount: reviewPlan.motionCount,
          checklist: buildHardwareChecklist(blockedSafety.level, message, blockedSafety, robotModel),
          motionPlan: reviewPlan.trace,
          simulationClips: [],
          simulationError: message,
          finalHint: "Submission is locked until every checklist item passes and movement is no greater than 1.0m.",
          movementSafety: blockedSafety
        });
        setRequestStatus(message);
        return;
      }
      const sourceFileName = uploadedFileName || "website-editor.py";
      const approvedFile: ApprovedCodeFile = {
        code: reviewCode,
        downloadFileName: approvedDownloadFileName(sourceFileName),
        sourceFileName,
        source: uploadedFileName ? "uploaded" : "editor",
        editedOnWebsite: uploadedFileName ? reviewCode !== uploadedOriginalCode : true
      };
      setPhysicalSubmissionId(payload.id);
      setPhysicalSafetyPassed(true);
      setSoftwareReviewStatus("locked");
      setIsInternalCompanyAccount(payload.internalAccount === true);
      setApprovedCodeFile(approvedFile);
      setReviewInputError("");
      setHardwareResult({
        status: "PASS",
        resultId: payload.id ?? "local-hardware-result",
        robotModel,
        fileName: uploadedFileName || "pasted code",
        commandCount: Number(payload.commandCount ?? reviewPlan.trace.length),
        checklist: buildHardwareChecklist("PASS", "", movementSafety, robotModel),
        movementSafety,
        motionPlan: reviewPlan.trace,
        simulationClips: simulationClipsForMotionPlan(reviewPlan.trace, robotModel),
        simulationError: "",
        finalHint: "All checks passed. This result is ready to submit for further review."
      });
      window.sessionStorage.setItem("agentech-latest-physical-review", JSON.stringify({
        id: payload.id,
        developerName,
        robotModel,
        code: reviewCode,
        originalCode: uploadedOriginalCode,
        uploadedFileName: uploadedFileName || null,
        downloadFileName: approvedFile.downloadFileName,
        editedOnWebsite: approvedFile.editedOnWebsite,
        physicalSafetyStatus: "passed",
        aiSecurityStatus: "locked"
      }));
      setRequestStatus(
        continueToSoftware
          ? `Hardware safety passed for ${payload.commandCount} commands. Starting software security review...`
          : `Hardware safety passed for ${payload.commandCount} commands. You can now run Software Security.`
      );
      if (continueToSoftware) {
        await runSoftwareCheck({ submissionId: payload.id, approvedFile, reviewCode });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Physical Hardware Check failed.";
      setPhysicalSubmissionId("");
      setPhysicalSafetyPassed(false);
      setCanScheduleRobotSlot(false);
      setHardwareResult(null);
      setReviewInputError(message);
      setRequestStatus(message);
    } finally {
      setIsRunningPhysicalCheck(false);
    }
  }

  async function runSoftwareCheck(overrides?: { submissionId: string; approvedFile: ApprovedCodeFile; reviewCode: string }) {
    if (masterLiveTestSelected) {
      setRequestStatus("Master uses one view-only authorization action. Submitted text is never sent to the execution checker.");
      return;
    }

    const submissionId = overrides?.submissionId ?? physicalSubmissionId;
    if (!submissionId || (!physicalSafetyPassed && !overrides)) {
      setRequestStatus("Run and pass Step 3 Physical Hardware Check before starting Step 4 Software Check.");
      return;
    }

    if (softwareReviewStatus !== "locked") {
      setRequestStatus("Software Check can only run once for each submission. Save a new hardware-passed submission to run another check.");
      return;
    }

    const reviewCode = overrides?.reviewCode ?? approvedCodeFile?.code ?? ensureRequiredStand(code);
    const reviewFileName = overrides?.approvedFile.sourceFileName ?? approvedCodeFile?.sourceFileName ?? uploadedFileName;
    const reviewPlan = commandPlan(reviewCode, robotModel);
    setIsRunningSoftwareCheck(true);
    setSoftwareReviewStatus("pending");
    setCanScheduleRobotSlot(false);
    setRequestStatus("Running Software Check with OpenAI...");
    try {
      const response = await fetch("/api/agentech-code-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewStage: "software",
          submissionId,
          developerName,
          robotModel,
          runMode: "Software check",
          code: reviewCode,
          uploadedFileName: reviewFileName,
          commands: reviewPlan.trace
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        setSoftwareReviewStatus(payload.aiSecurityStatus === "locked" ? "locked" : payload.aiSecurityStatus || "error");
        const findings = Array.isArray(payload.findings) && payload.findings.length
          ? ` Findings: ${payload.findings.slice(0, 3).join(" ")}`
          : "";
        throw new Error(`${payload.error ?? "Software Check failed."}${findings}`);
      }
      setIsInternalCompanyAccount(payload.internalAccount === true);
      const creditMessage = payload.softwareReviewBypassed
        ? "Paid AI review exempted for this test account. No AI review was performed and no review credits were charged."
        : payload.internalAccount
        ? payload.creditsCharged > 0
          ? `${payload.creditsCharged} company account credit${payload.creditsCharged === 1 ? "" : "s"} used; internal access remains available for testing.`
          : "No company credits were available, so the internal test continued without a charge."
        : payload.creditsBypassed
          ? "No credits charged in local preview."
          : `${payload.creditsCharged} account credit${payload.creditsCharged === 1 ? "" : "s"} used.`;
      setRequestStatus(`Code Certification passed. ${creditMessage} You can now request a robot time slot.`);
      setSoftwareReviewStatus("passed");
      setCanScheduleRobotSlot(payload.aiSecurityStatus === "passed");
    } catch (error) {
      setCanScheduleRobotSlot(false);
      setSoftwareReviewStatus((current) => current === "pending" ? "error" : current);
      setRequestStatus(error instanceof Error ? error.message : "Software Check failed.");
    } finally {
      setIsRunningSoftwareCheck(false);
    }
  }

  return (
    <div className={`agentech-library-page min-h-screen ${useLightTaskPage ? "eaic-task-theme bg-[#f5f4f1] text-[#111111]" : "bg-[#0b0d10] text-white"}`}>
      <style>{`
        nextjs-portal,
        [data-nextjs-toast],
        [data-nextjs-dialog-overlay],
        [data-nextjs-dialog],
        [data-nextjs-dev-tools-button],
        [data-nextjs-devtools] {
          display: none !important;
        }
      `}</style>
      {selectedTask ? <TaskDetailHeader task={selectedTask} /> : null}
      {showHero ? (
      <section className="border-b border-[#2a3440] bg-[#101418]">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/" aria-label="Go to Agentech homepage" className="block border border-transparent transition hover:border-[#8fdc8f]/40">
                <Image
                  src="/assets/logo/AGENTECH-products.png"
                  alt="Agentech Products"
                  width={260}
                  height={64}
                  className="h-9 w-auto object-contain"
                  priority
                />
              </Link>
              <span className="border border-[#8fdc8f]/50 bg-[#132117] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#8fdc8f]">
                Hidden Developer Lab
              </span>
              <Link
                href="/"
                className="border border-[#2a3440] bg-[#0d1117] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#cdd6df] transition hover:border-[#93c5fd] hover:text-[#93c5fd]"
              >
                Home
              </Link>
            </div>
            <h1 className="mt-8 max-w-4xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
              EAIC HUB
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-[#b8c2cc]">
              A clean Python layer for Aegis robot commands: stand, latched squat and low-gait movement, forward, backward, lateral and diagonal walking, turns, yaw, pitch, and roll posture, timed holds, backflip, jump, stop, and battery status in calls students can read at a glance.
            </p>
            <div className="mt-7 grid max-w-2xl grid-cols-3 border border-[#2a3440] bg-[#0d1117]">
              <div className="border-r border-[#2a3440] p-4">
                <p className="text-2xl font-semibold text-[#8fdc8f]">{aegisFunctions.length}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Functions</p>
              </div>
              <div className="border-r border-[#2a3440] p-4">
                <p className="text-2xl font-semibold text-[#f5d06f]">1 line</p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Quick Start</p>
              </div>
              <div className="p-4">
                <p className="text-2xl font-semibold text-[#93c5fd]">Dry</p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Safe First</p>
              </div>
            </div>
            <div className="mt-5 grid max-w-4xl gap-3 md:grid-cols-3">
              <div className="border border-[#2a3440] bg-[#0d1117] p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Install</p>
                <p className="mt-2 break-all font-mono text-xs leading-5 text-[#8fdc8f]">
                  pip install git+https://github.com/agent-tech0316/agentech_sdk.git
                </p>
              </div>
              <div className="border border-[#2a3440] bg-[#0d1117] p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">One line</p>
                <p className="mt-2 font-mono text-xs leading-5 text-[#e5edf5]">Agentech.forward(speed_mps=0.3, duration_s=1)</p>
              </div>
              <div className="border border-[#2a3440] bg-[#0d1117] p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Session</p>
                <p className="mt-2 font-mono text-xs leading-5 text-[#e5edf5]">with Agentech.robot() as dog:</p>
              </div>
            </div>
          </div>
          <div className="relative min-h-72 overflow-hidden border border-[#2a3440] bg-[#06080b]">
            <Image
              src="/assets/products/aegis-ultra.png"
              alt="Aegis EDU robot dog"
              fill
              sizes="(min-width: 1024px) 380px, 100vw"
              className="object-contain p-6"
              priority
            />
            <div className="absolute bottom-0 left-0 right-0 border-t border-[#2a3440] bg-[#0d1117]/90 px-4 py-3 backdrop-blur">
              <p className="font-mono text-xs text-[#8fdc8f]">from agentech import Agentech</p>
            </div>
          </div>
        </div>
      </section>
      ) : null}

      {showOverview ? <DocsOverview /> : null}
      {showFocusedStartCoding ? <FocusedStartCodingSection /> : null}
      {showFocusedBrowseFunctions ? <FocusedBrowseFunctionsSection /> : null}
      {showFocusedLiveRun ? <FocusedLiveRunSection /> : null}
      {showFocusedReview ? (
        <section className="bg-[#f5f4f1] px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex h-full flex-col overflow-hidden rounded-[22px] border border-black/8 bg-white/70 shadow-[0_28px_80px_rgba(17,17,17,0.08)]">
              <div className="border-b border-black/8 bg-[#faf9f6] px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-sm font-semibold text-[#111111]">submission_code.py</p>
                  <span className="rounded-full border border-[#1a73e8]/35 bg-[#eaf2fd] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1a73e8]">
                    Type or paste here
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[#5f6368]">
                  You do not need to upload a file. Type or paste your Python code below, then run Code Certification.
                </p>
              </div>
              <textarea
                aria-invalid={Boolean(reviewInputError)}
                aria-describedby={reviewInputError ? "code-editor-error" : undefined}
                aria-label={masterLiveTestSelected ? "Master view-only test text" : "Python code submission editor"}
                placeholder={masterLiveTestSelected ? "Type any view-only test text here..." : "Type or paste your Agentech Python code here..."}
                value={code}
                onChange={(event) => masterLiveTestSelected ? updateMasterLiveTestText(event.target.value) : updateCode(event.target.value)}
                disabled={softwarePassed}
                spellCheck={false}
                className="min-h-[520px] w-full flex-1 resize-none border-0 bg-[#fdfcf9] p-5 font-mono text-sm leading-7 text-[#303134] outline-none selection:bg-[#d8e8fd] disabled:cursor-not-allowed disabled:bg-[#efede8] disabled:text-[#5f6368] lg:min-h-[760px]"
              />
              {reviewInputError ? (
                <div id="code-editor-error" data-code-review-alert="true" role="alert" className="border-t border-[#c93434] bg-[#fff1f1] px-5 py-3 text-xs leading-5 text-[#a51f1f]">
                  {reviewInputError}
                </div>
              ) : null}
            </div>
            <div className="rounded-[22px] border border-black/8 bg-white/70 p-5 shadow-[0_28px_80px_rgba(17,17,17,0.08)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1a73e8]">{focusedReviewStep}</p>
              <p className="mt-2 text-xs leading-5 text-[#5f6368]">{focusedReviewCopy}</p>
              <div className="mt-4 space-y-4">
                <div className="rounded-[14px] border border-black/8 bg-[#faf9f6] p-3">
                  <label className="block">
                    <span className="text-xs uppercase tracking-[0.14em] text-[#5f6368]">Robot model</span>
                    <select
                      value={displayedRobotModel}
                      onChange={(event) => changeCodeCheckingRobotModel(event.target.value)}
                      disabled={softwarePassed || isRunningPhysicalCheck || isRunningSoftwareCheck}
                      className="mt-2 w-full rounded-[10px] border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-[#111111] outline-none focus:border-[#1a73e8] disabled:cursor-not-allowed disabled:bg-[#efede8]"
                    >
                      {codeCheckingRobotOptions.map((model) => <option key={model} value={model}>{model}</option>)}
                    </select>
                  </label>
                  <p className="mt-2 text-xs leading-5 text-[#5f6368]">
                    {masterLiveTestSelected
                      ? masterPresentation.viewOnlyNotice
                      : robotModel === "Navi" ? "Checks this submission against the latest Navi SDK." : "Checks this submission against the Aegies SDK."}
                  </p>
                </div>
                <div className="rounded-[14px] border border-black/8 bg-[#faf9f6] p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-[#5f6368]">Test type</p>
                  <p className="mt-2 text-sm font-semibold text-[#111111]">{runMode}</p>
                  <p className="mt-1 text-xs leading-5 text-[#5f6368]">{runModeDescription}</p>
                </div>
                <div className="flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-black/8" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7d8b9c]">Or upload a file</span>
                  <span className="h-px flex-1 bg-black/8" />
                </div>
                {(physicalSubmissionId || hardwareResult || softwareReviewStatus !== "locked" || softwarePassed) ? (
                  <button
                    type="button"
                    onClick={checkAnotherCode}
                    disabled={isRunningPhysicalCheck || isRunningSoftwareCheck}
                    className="w-full rounded-full border border-black/15 bg-white px-4 py-3 text-sm font-semibold text-[#303134] transition hover:border-[#1a73e8] hover:text-[#1a73e8] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Check Another Code
                  </button>
                ) : null}
                <label
                  data-code-upload-zone="true"
                  data-code-upload-state={isDraggingCodeFile ? "dragging" : "idle"}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDraggingCodeFile(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    setIsDraggingCodeFile(true);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setIsDraggingCodeFile(false);
                    }
                  }}
                  onDrop={handleCodeFileDrop}
                  className={`block rounded-[14px] border border-dashed p-3 transition ${
                    isDraggingCodeFile
                      ? "border-[#008a7a] bg-[#e8f7f3]"
                      : "border-black/10 bg-[#faf9f6] hover:border-[#1a73e8]"
                  }`}
                >
                  <span data-code-upload-label="true" className="text-xs uppercase tracking-[0.14em] text-[#5f6368]">Upload code file (optional)</span>
                  <span data-code-upload-primary="true" className="mt-2 block text-sm font-semibold text-[#111111]">
                    {isDraggingCodeFile ? "Drop the file here" : "Drag a .py or .txt file here, or choose a file"}
                  </span>
                  <input
                    data-code-upload-input="true"
                    key={reviewResetKey}
                    type="file"
                    accept=".py,.txt"
                    disabled={softwarePassed}
                    onChange={(event) => {
                      void loadUploadedCodeFile(event.target.files?.[0] ?? null);
                    }}
                    className="mt-3 w-full rounded-[10px] border border-black/10 bg-white px-3 py-2 text-sm text-[#303134] outline-none file:mr-3 file:rounded-full file:border-0 file:bg-[#eaf2fd] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#1a73e8] focus:border-[#1a73e8]"
                  />
                  <span data-code-upload-helper="true" className="mt-2 block text-xs leading-5 text-[#526174]">
                    {uploadedFileName ? `${uploadedFileName} loaded into the editor.` : "Already typed code on the left? Run Hardware Safety below. No file needed."}
                  </span>
                </label>
                <div className={`rounded-[14px] border p-3 ${step3PanelClass}`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-[#526174]">{masterLiveTestSelected ? "Stage 1 - View-Only Access" : "Stage 1 - Hardware Safety"}</p>
                    {hardwarePassed ? (
                      <span className="inline-flex items-center gap-1 border border-[#008a7a] bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#006a5c]">
                        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3 fill-none stroke-current stroke-[2.5]">
                          <path d="M3.5 8.2 6.7 11.2 12.8 4.8" />
                        </svg>
                        Passed
                      </span>
                    ) : null}
                    {hardwareFailed ? (
                      <span className="border border-[#c93434] bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a51f1f]">
                        Failed
                      </span>
                    ) : null}
                    {hardwareWarning ? (
                      <span className="border border-[#d99a00] bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a6700]">
                        Warning
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 font-mono text-xs leading-5 text-[#07142e]">{masterLiveTestSelected ? 0 : plan.motionCount} motion commands</p>
                  <p
                    className={`mt-1 text-xs leading-5 ${
                      hardwareFailed ? "text-[#a51f1f]" : hardwareWarning ? "text-[#9a6700]" : "text-[#526174]"
                    }`}
                  >
                    {masterLiveTestSelected && hardwarePassed
                      ? "View-only authorization passed. Zero robot commands will be executed."
                      : hardwarePassed
                      ? "Hardware and parameter limits passed. Software security is running next."
                      : hardwareWarning
                        ? requestStatus
                        : hardwareFailed
                          ? requestStatus
                          : "Checks robot commands, parameters, motion limits, and robot-body safety first."}
                  </p>
                  {hardwarePassed && approvedCodeFile ? (
                    <div className="mt-3 border-t border-[#008a7a]/30 pt-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#006a5c]">{masterLiveTestSelected ? masterPresentation.artifactLabel : "Approved code file"}</p>
                      <p className="mt-2 break-all font-mono text-xs text-[#07142e]">{approvedCodeFile.downloadFileName}</p>
                      <p className="mt-1 text-xs leading-5 text-[#526174]">
                        {masterLiveTestSelected
                          ? "This text is saved for the view-only test audit and is not executable."
                          : approvedCodeFile.source === "editor" || approvedCodeFile.editedOnWebsite
                          ? "This code from the website editor passed Step 3. No file upload was needed."
                          : "This is the exact uploaded version that passed Step 3."}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-[#526174]">Review ID: {physicalSubmissionId}</p>
                        <button
                          type="button"
                          onClick={downloadApprovedCodeFile}
                          aria-label={masterLiveTestSelected ? "Download view-only test artifact" : "Download approved code file"}
                          title={masterLiveTestSelected ? "Download view-only test artifact" : "Download approved code file"}
                          className="inline-flex items-center justify-center border border-[#008a7a] bg-white p-2 text-[#006a5c] transition hover:bg-[#e8f7f3]"
                        >
                          <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.8]">
                            <path d="M8 2.5v7M5.2 7.4 8 10.2l2.8-2.8M3 12.5h10" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div data-code-review-stage="software-security" className={`rounded-[14px] border p-3 ${step4PanelClass}`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-[#526174]">{masterLiveTestSelected ? "Stage 2 - Execution Isolation" : "Stage 2 - Software Security"}</p>
                    {isLoadingReviewGate ? (
                      <span className="border border-[#93c5fd] bg-[#eaf3ff] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#194f92]">
                        Checking
                      </span>
                    ) : softwarePassed ? (
                      <span className="inline-flex items-center gap-1 border border-[#008a7a] bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#006a5c]">
                        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3 fill-none stroke-current stroke-[2.5]">
                          <path d="M3.5 8.2 6.7 11.2 12.8 4.8" />
                        </svg>
                        Passed
                      </span>
                    ) : softwareFailed ? (
                      <span className="border border-[#c93434] bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a51f1f]">
                        Failed
                      </span>
                    ) : hardwarePassed ? (
                      <span className="border border-[#008a7a] bg-[#e8f7f3] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#006a5c]">
                        Next
                      </span>
                    ) : (
                      <span data-code-review-locked-badge="true" className="border border-[#d5e0ec] bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7d8b9c]">
                        Locked
                      </span>
                    )}
                  </div>
                  <p data-code-review-stage-description="true" className="mt-2 text-xs leading-5 text-[#23304a]">
                    {masterLiveTestSelected && softwarePassed
                      ? "Execution isolation passed. The active session grants camera viewing only."
                      : isLoadingReviewGate
                      ? "Checking the latest saved Physical Hardware Check for this account."
                      : softwarePassed
                      ? "Software security passed. Time-slot requests are unlocked."
                      : hardwarePassed && softwareReviewStatus !== "locked"
                        ? softwareReviewStatus === "failed" || softwareReviewStatus === "error"
                          ? "Software Security did not pass. Review the findings below."
                          : `Software security status: ${softwareReviewStatus}.`
                      : hardwarePassed
                        ? isInternalCompanyAccount
                          ? "Unlocked. Company credits can be charged, but credit balance does not block internal testing."
                          : "Hardware passed. Click Run Software Security to complete certification."
                        : isInternalCompanyAccount
                          ? "Locked until Step 3 passes. Company credit balance does not block internal testing."
                          : "Locked until Step 3 passes. Uses GPT-5.5 and charges account credits."}
                  </p>
                  {softwareFailed ? (
                    <div role="alert" className="mt-3 border-t border-[#c93434]/30 pt-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a51f1f]">Why it did not pass</p>
                      <p className="mt-2 text-xs leading-5 text-[#8f1f1f]">{requestStatus}</p>
                      <p className="mt-2 text-xs leading-5 text-[#526174]">
                        Correct the reported security issue, then run Hardware Safety again before starting a new Software Security check.
                      </p>
                    </div>
                  ) : null}
                </div>
                {!softwarePassed ? <button
                  type="button"
                  onClick={() => void runPhysicalSafetyCheck()}
                  disabled={isLoadingReviewGate || isRunningPhysicalCheck || isRunningSoftwareCheck}
                  className="w-full rounded-full border border-[#1a73e8] bg-[#1a73e8] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#155fc0] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRunningPhysicalCheck
                    ? masterLiveTestSelected ? "Starting Master Live Test..." : "Running Hardware Safety..."
                    : masterLiveTestSelected
                      ? masterPresentation.actionLabel
                    : hardwarePassed || hardwareFailed || hardwareWarning
                      ? "Run Hardware Safety Again"
                      : "Run Hardware Safety"}
                </button> : null}
                {!softwarePassed && !masterLiveTestSelected ? <button
                  type="button"
                  onClick={() => void runSoftwareCheck()}
                  disabled={isLoadingReviewGate || !hardwarePassed || isRunningPhysicalCheck || isRunningSoftwareCheck || softwareReviewStatus !== "locked"}
                  className={`w-full rounded-full border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:border-black/10 disabled:bg-[#efede8] disabled:text-[#7d8b9c] ${
                    hardwarePassed && softwareReviewStatus === "locked"
                      ? "border-[#1a73e8] bg-[#1a73e8] text-white hover:bg-[#155fc0]"
                      : "border-[#1a73e8]/35 bg-[#eaf2fd] text-[#1a73e8]"
                  }`}
                >
                  {isRunningSoftwareCheck
                    ? "Running Software Security..."
                    : softwarePassed
                      ? "Software Security Passed"
                      : softwareReviewStatus === "locked"
                        ? "Run Software Security"
                        : "Software Security Used"}
                </button> : null}
                <div data-code-review-schedule-gate="true" className={`rounded-[14px] border p-3 ${canScheduleRobotSlot ? "border-[#008a7a] bg-[#e8f7f3]" : "border-black/8 bg-[#faf9f6]"}`}>
                  <p className="text-xs uppercase tracking-[0.14em] text-[#526174]">{masterLiveTestSelected ? "Master live gate" : "Schedule gate"}</p>
                  <p data-code-review-schedule-description="true" className="mt-2 text-sm leading-6 text-[#23304a]">
                    {masterLiveTestSelected
                      ? canScheduleRobotSlot
                        ? `Master view-only livestream is unlocked${masterLiveTestExpiresAt ? ` until ${new Date(masterLiveTestExpiresAt).toLocaleTimeString()}` : " for the active session"}.`
                        : "Start the 3-minute view-only test to unlock the Master livestream."
                      : canScheduleRobotSlot ? "Hardware safety and software security passed. You can request a supervised robot time slot now." : "Time-slot requests unlock only after both certification stages pass."}
                  </p>
                  {canScheduleRobotSlot ? (
                    <Link
                      href={masterLiveTestSelected ? masterPresentation.livePath : robotSchedulingPath}
                      className="mt-3 block rounded-full border border-[#1a73e8] bg-[#1a73e8] px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-[#155fc0]"
                    >
                      {masterLiveTestSelected ? masterPresentation.liveLinkLabel : "Request Time Slot"}
                    </Link>
                  ) : (
                    <button
                      data-code-review-locked-action="true"
                      type="button"
                      disabled
                      className="mt-3 w-full cursor-not-allowed rounded-full border border-black/10 bg-[#efede8] px-4 py-3 text-sm font-semibold text-[#7d8b9c]"
                    >
                      {masterLiveTestSelected ? "Master Live Stream Locked" : "Request Time Slot Locked"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}
      {showFocusedReview && hardwareResult && !masterLiveTestSelected ? <HardwareResultPanel result={hardwareResult} /> : null}

      {showWorkbench ? (
      <main id="code-workbench" className="mx-auto grid w-full max-w-7xl scroll-mt-6 gap-0 overflow-hidden border-x border-[#2a3440] lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="hidden border-b border-[#2a3440] bg-[#11151b] lg:block lg:border-b-0 lg:border-r">
          <div className="border-b border-[#2a3440] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7f8c99]">Library</p>
          </div>
          <div className="space-y-1 p-3">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => loadCategory(category)}
                className={`block w-full border px-3 py-2 text-left text-sm transition ${
                  activeCategory === category
                    ? "border-[#8fdc8f] bg-[#15251a] text-[#dfffe0]"
                    : "border-transparent text-[#aeb8c2] hover:border-[#2a3440] hover:bg-[#181d24] hover:text-white"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="border-t border-[#2a3440] p-3">
            {filteredFunctions.map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => loadExample(item)}
                className={`mb-1 block w-full border px-3 py-2 text-left font-mono text-sm transition ${
                  activeFunction.name === item.name
                    ? "border-[#93c5fd] bg-[#101d2e] text-[#dbeafe]"
                    : "border-transparent text-[#cdd6df] hover:border-[#2a3440] hover:bg-[#181d24]"
                }`}
              >
                {item.name}()
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 bg-[#0b0d10]">
          <div className="border-b border-[#2a3440] bg-[#181d24] px-4 py-3">
            <p className="font-mono text-sm text-[#cdd6df]">agentech_quickstart.py</p>
          </div>
          <div className="border-b border-[#2a3440] bg-[#11151b] p-3 lg:hidden">
            <div className="grid gap-3">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7f8c99]">Category</span>
                <select
                  value={activeCategory}
                  onChange={(event) => loadCategory(event.target.value as Category)}
                  className="mt-2 w-full border border-[#2a3440] bg-[#0d1117] px-3 py-3 text-sm text-white outline-none focus:border-[#8fdc8f]"
                >
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7f8c99]">Function</span>
                <select
                  value={activeFunction.name}
                  onChange={(event) => {
                    const selected = aegisFunctions.find((item) => item.name === event.target.value);
                    if (selected) {
                      loadExample(selected);
                    }
                  }}
                  className="mt-2 w-full border border-[#93c5fd] bg-[#101d2e] px-3 py-3 font-mono text-sm text-[#dbeafe] outline-none focus:border-[#8fdc8f]"
                >
                  {filteredFunctions.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}()
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_minmax(430px,0.85fr)]">
            <div>
              <textarea
                value={code}
                onChange={(event) => {
                  updateCode(event.target.value);
                }}
                spellCheck={false}
                className="h-[340px] w-full resize-none border-0 bg-[#0d1117] p-4 font-mono text-[13px] leading-6 text-[#e5edf5] outline-none selection:bg-[#275c37] sm:h-[440px] sm:text-sm sm:leading-7 lg:h-[520px] lg:p-5"
              />
              <div className="border-t border-[#2a3440] bg-[#0d1117] px-4 py-2 text-[11px] leading-5 text-[#8fdc8f] sm:px-5 sm:py-3 sm:text-xs">
                MuJoCo previews start in a standing pose and run movement directly. Physical robot submissions still add <span className="font-mono">{protectedStandLine}</span> before motion.
              </div>
            </div>
            <div className="border-t border-[#2a3440] bg-[#11151b] xl:border-l xl:border-t-0">
              <div className="border-b border-[#2a3440] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7f8c99]">Preview</p>
                  <p className="font-mono text-xs text-[#93c5fd]">MuJoCo simulator</p>
                </div>
              </div>
              <div className="p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#8fdc8f]">
                    {previewCommandLabel(previewCommand)}
                  </p>
                  <p className="font-mono text-xs text-[#7f8c99]">{renderedFrames.length ? "real rendered frames" : "approved GIF asset"}</p>
                </div>
                <div className="relative mx-auto aspect-[4/3] max-h-[54vh] w-full overflow-hidden border border-[#2a3440] bg-black sm:aspect-[13/9]">
                  {renderedFrame ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={renderedFrame}
                      alt={`${robotModel} simulator render for ${previewCommandLabel(previewCommand)}`}
                      className="h-full w-full object-contain"
                    />
                  ) : robotModel === "Navi" ? (
                    <Image
                      src="/assets/robotics/ff-navi-white.jpg"
                      alt="FF Navi MuJoCo preview reference"
                      width={1200}
                      height={675}
                      className="h-full w-full bg-white object-contain"
                    />
                  ) : previewGif ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewGif}
                      alt={`Aegis preview for ${previewCommandLabel(previewCommand)}`}
                      onError={() => {
                        setPreviewGif(localPreviewFallback);
                      }}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={localPreviewFallback}
                      alt="Aegis preview placeholder"
                      className="h-full w-full object-contain"
                    />
                  )}
                </div>
                <div className="mt-4 hidden grid-cols-3 border border-[#2a3440] bg-[#0d1117] text-center font-mono text-xs sm:grid">
                  <div className="border-r border-[#2a3440] p-2">model ready</div>
                  <div className="border-r border-[#2a3440] p-2">{renderedFrames.length ? "sim" : robotModel === "Navi" ? "reference" : "gif"}</div>
                  <div className="p-2">{previewPlan.motionCount} moves</div>
                </div>
                <button
                  type="button"
                  onClick={runPreviewSimulation}
                  disabled={isSimulating}
                  className="mt-4 w-full border border-[#93c5fd] bg-[#101d2e] px-3 py-2 text-sm font-semibold text-[#dbeafe] transition hover:bg-[#93c5fd] hover:text-[#07111f]"
                >
                  {isSimulating ? "Preparing preview..." : `Run ${robotModel} MuJoCo Preview`}
                </button>
                <p className="mt-3 border border-[#2a3440] bg-[#0d1117] p-3 text-xs leading-5 text-[#aeb8c2]">{previewStatus}</p>
                <div className="mt-2 border border-[#2a3440] bg-[#0d1117] p-2 text-center font-mono text-xs text-[#7f8c99]">
                  detected command: {previewPlan.trace[0] ?? "none"} - {useRealMuJoCoPreview || renderedFrames.length ? `frame ${Math.min(simFrameIndex + 1, previewFrameCount)} / ${previewFrameCount}` : "official clip"}
                </div>
                <div className="mt-4 max-h-32 space-y-2 overflow-auto sm:max-h-52">
                  {previewPlan.trace.map((line, index) => (
                    <p key={`${line}-${index}`} className="border border-[#2a3440] bg-[#0d1117] px-3 py-2 font-mono text-xs text-[#cdd6df]">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {!selectedTask ? (
          <div className="border-t border-[#2a3440] p-3 lg:hidden">
            <details className="border border-[#2a3440] bg-[#11151b]">
              <summary className="cursor-pointer px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#8fdc8f]">
                Function details and parameters
              </summary>
              <div className="border-t border-[#2a3440] p-3">
                <FunctionReference item={activeFunction} />
              </div>
            </details>
          </div>
          ) : null}

          {!selectedTask ? (
          <div className="hidden border-t border-[#2a3440] p-4 lg:block">
            <FunctionReference item={activeFunction} />
          </div>
          ) : null}
        </section>

        {!selectedTask ? (
        <aside className="border-t border-[#2a3440] bg-[#11151b] lg:col-start-2">
          <div className="border-b border-[#2a3440] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7f8c99]">Robot Session</p>
          </div>
          <div className="space-y-3 p-3 lg:hidden">
            {canScheduleRobotSlot ? (
              <Link
                href={robotSchedulingPath}
                className="block w-full border border-[#8fdc8f] bg-[#17351f] px-4 py-3 text-center text-sm font-semibold text-[#dfffe0] transition hover:bg-[#8fdc8f] hover:text-[#08100a]"
              >
                Schedule Live Stream
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="w-full cursor-not-allowed border border-[#2a3440] bg-[#151a20] px-4 py-3 text-sm font-semibold text-[#687583]"
              >
                Live Stream Locked
              </button>
            )}
            <details className="border border-[#2a3440] bg-[#0d1117]">
              <summary className="cursor-pointer px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#93c5fd]">
                Upload code for review
              </summary>
              <div className="space-y-3 border-t border-[#2a3440] p-3">
                <label className="block">
                  <span className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Upload code file</span>
                  <input
                    type="file"
                    accept=".py,.txt"
                    onChange={(event) => {
                      void loadUploadedCodeFile(event.target.files?.[0] ?? null);
                    }}
                    className="mt-2 w-full border border-[#2a3440] bg-[#0d1117] px-3 py-3 text-sm text-[#cdd6df] outline-none file:mr-3 file:border-0 file:bg-[#101d2e] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#dbeafe] focus:border-[#8fdc8f]"
                  />
                  <span className="mt-2 block text-xs leading-5 text-[#7f8c99]">
                    {uploadedFileName ? `${uploadedFileName} loaded.` : "Upload a .py file or paste code directly."}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => void runPhysicalSafetyCheck()}
                  disabled={isLoadingReviewGate || isRunningPhysicalCheck || isRunningSoftwareCheck}
                  className="w-full border border-[#93c5fd] bg-[#101d2e] px-4 py-3 text-sm font-semibold text-[#dbeafe] transition hover:bg-[#93c5fd] hover:text-[#07111f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRunningPhysicalCheck ? "Checking..." : "Run Physical Hardware Check"}
                </button>
                <button
                  type="button"
                  onClick={() => void runSoftwareCheck()}
                  disabled={isLoadingReviewGate || !physicalSafetyPassed || isRunningPhysicalCheck || isRunningSoftwareCheck || softwareReviewStatus !== "locked"}
                  className="w-full border border-[#8fdc8f] bg-[#102015] px-4 py-3 text-sm font-semibold text-[#dfffe0] transition hover:bg-[#8fdc8f] hover:text-[#08100a] disabled:cursor-not-allowed disabled:border-[#2a3440] disabled:bg-[#151a20] disabled:text-[#687583]"
                >
                  {isRunningSoftwareCheck ? "Checking..." : softwareReviewStatus === "locked" ? "Run Software Check" : "Software Check Used"}
                </button>
                <p className="border border-[#2a3440] bg-[#0b0d10] p-3 text-xs leading-5 text-[#aeb8c2]">{requestStatus}</p>
              </div>
            </details>

            <details className="border border-[#2a3440] bg-[#0d1117]" open>
              <summary className="cursor-pointer px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#8fdc8f]">
                Live Stream Camera
              </summary>
              <div className="border-t border-[#2a3440] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs leading-5 text-[#aeb8c2]">
                    Locked until an approved scheduled session is active.
                  </p>
                  <span className="h-2.5 w-2.5 shrink-0 bg-[#7f8c99]" aria-hidden="true" />
                </div>
                <LockedLiveRunPanel dark />
              </div>
            </details>

            <details className="border border-[#2a3440] bg-[#0d1117]">
              <summary className="cursor-pointer px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7f8c99]">
                Safety defaults
              </summary>
              <ul className="space-y-2 border-t border-[#2a3440] p-3 text-sm leading-6 text-[#cdd6df]">
                <li>Dry-run first</li>
                <li>Forward capped at 2.37 m/s; backward capped at 2.365 m/s</li>
                <li>Lateral walking capped at 0.78 m/s</li>
                <li>Motion capped at 10 seconds</li>
                <li>Emergency stop is always available</li>
              </ul>
            </details>
          </div>

          <div className="hidden space-y-4 p-4 lg:block">
            <div className="border border-[#2a3440] bg-[#0d1117] p-3">
              <label className="block">
                <span className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Robot model</span>
                <select
                  value={robotModel}
                  onChange={(event) => changeRobotModel(event.target.value)}
                  disabled={softwarePassed || isRunningPhysicalCheck || isRunningSoftwareCheck}
                  className="mt-2 w-full border border-[#2a3440] bg-[#11151b] px-3 py-2 text-sm font-semibold text-white outline-none focus:border-[#8fdc8f] disabled:cursor-not-allowed disabled:text-[#687583]"
                >
                  {robotModelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
                </select>
              </label>
              <p className="mt-2 text-xs leading-5 text-[#7f8c99]">{robotModel === "Navi" ? "Latest Navi SDK hardware rules are enabled." : "Aegies hardware rules are enabled."}</p>
            </div>
            <div className="border border-[#2a3440] bg-[#0d1117] p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Test type</p>
              <p className="mt-2 text-sm font-semibold text-white">{runMode}</p>
              <p className="mt-1 text-xs leading-5 text-[#7f8c99]">{runModeDescription}</p>
            </div>
            <div className="border border-[#2a3440] bg-[#0d1117] p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Step 3 / Step 4 Review</p>
              <p className="mt-2 font-mono text-xs leading-5 text-[#cdd6df]">{plan.motionCount} motion commands</p>
              <p className="mt-1 text-xs leading-5 text-[#7f8c99]">
                {isInternalCompanyAccount
                  ? "Physical Hardware Check must pass first. Company credits may be charged, but balance never blocks internal testing."
                  : "Physical Hardware Check must pass before Software Check uses account credits."}
              </p>
            </div>
            <label className="block">
              <span className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Upload code file</span>
              <input
                type="file"
                accept=".py,.txt"
                onChange={(event) => {
                  void loadUploadedCodeFile(event.target.files?.[0] ?? null);
                }}
                className="mt-2 w-full border border-[#2a3440] bg-[#0d1117] px-3 py-2 text-sm text-[#cdd6df] outline-none file:mr-3 file:border-0 file:bg-[#101d2e] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#dbeafe] focus:border-[#8fdc8f]"
              />
              <span className="mt-2 block text-xs leading-5 text-[#7f8c99]">
                {uploadedFileName ? `${uploadedFileName} loaded into the editor.` : "Upload a .py file or paste code directly into the editor."}
              </span>
            </label>
            <button
              type="button"
              onClick={() => void runPhysicalSafetyCheck()}
              disabled={isLoadingReviewGate || isRunningPhysicalCheck || isRunningSoftwareCheck}
              className="w-full border border-[#93c5fd] bg-[#101d2e] px-4 py-3 text-sm font-semibold text-[#dbeafe] transition hover:bg-[#93c5fd] hover:text-[#07111f] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRunningPhysicalCheck ? "Checking..." : "Run Physical Hardware Check"}
            </button>
            <button
              type="button"
              onClick={() => void runSoftwareCheck()}
              disabled={isLoadingReviewGate || !physicalSafetyPassed || isRunningPhysicalCheck || isRunningSoftwareCheck || softwareReviewStatus !== "locked"}
              className="w-full border border-[#8fdc8f] bg-[#102015] px-4 py-3 text-sm font-semibold text-[#dfffe0] transition hover:bg-[#8fdc8f] hover:text-[#08100a] disabled:cursor-not-allowed disabled:border-[#2a3440] disabled:bg-[#151a20] disabled:text-[#687583]"
            >
              {isRunningSoftwareCheck ? "Checking..." : softwareReviewStatus === "locked" ? "Run Software Check" : "Software Check Used"}
            </button>
            {canScheduleRobotSlot ? (
              <Link
                href={robotSchedulingPath}
                className="block w-full border border-[#8fdc8f] bg-[#17351f] px-4 py-3 text-center text-sm font-semibold text-[#dfffe0] transition hover:bg-[#8fdc8f] hover:text-[#08100a]"
              >
                Schedule Live Stream
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="w-full cursor-not-allowed border border-[#2a3440] bg-[#151a20] px-4 py-3 text-sm font-semibold text-[#687583]"
              >
                Live Stream Locked
              </button>
            )}
            <p className="border border-[#2a3440] bg-[#0d1117] p-3 text-sm leading-6 text-[#aeb8c2]">{requestStatus}</p>

            <div className="border border-[#2a3440] bg-[#0d1117] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Live Stream Camera</p>
                  <p className="mt-1 text-xs leading-5 text-[#aeb8c2]">
                    Locked until an approved scheduled session is active.
                  </p>
                </div>
                <span className="h-2.5 w-2.5 bg-[#7f8c99]" aria-hidden="true" />
              </div>
              <div className="mt-3">
                <LockedLiveRunPanel dark />
              </div>
            </div>

            <div className="border border-[#2a3440] bg-[#0d1117] p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-[#7f8c99]">Safety Defaults</p>
              <ul className="mt-3 space-y-2 text-sm text-[#cdd6df]">
                <li>Dry-run first</li>
                <li>Forward capped at 2.37 m/s; backward capped at 2.365 m/s</li>
                <li>Lateral walking capped at 0.78 m/s</li>
                <li>Motion capped at 10 seconds</li>
                <li>Emergency stop is always available</li>
              </ul>
            </div>
          </div>
        </aside>
        ) : null}
      </main>
      ) : null}
      {showDocs ? <DocsSection /> : null}
    </div>
  );
}
