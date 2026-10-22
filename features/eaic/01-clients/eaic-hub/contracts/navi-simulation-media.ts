import type { PublicNaviReference } from "./navi-sdk-explorer";

export type NaviSimulationMedia = Readonly<{
  command: string;
  asset: string;
  kind: "video" | "gif" | "webp";
  replayStartSeconds?: number;
}>;

const rawNaviSimulationAssets: Record<string, string> = {
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

export const NAVI_PREVIEW_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  diagonal: Object.freeze(["diagonal_left", "diagonal_right"]),
  lateral: Object.freeze(["lateral_left", "lateral_right"]),
  turn: Object.freeze(["turn_left", "turn_right"]),
});

export const NAVI_SIMULATION_REPLAY_START: Readonly<Record<string, number>> = Object.freeze({
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
});

function mediaKind(asset: string): NaviSimulationMedia["kind"] {
  if (/\.gif(?:[?#]|$)/i.test(asset)) return "gif";
  if (/\.webp(?:[?#]|$)/i.test(asset)) return "webp";
  return "video";
}

export const NAVI_SIMULATION_MEDIA_BY_COMMAND: Readonly<Record<string, NaviSimulationMedia>> = Object.freeze(
  Object.fromEntries(Object.entries(rawNaviSimulationAssets).map(([command, asset]) => [
    command,
    Object.freeze({
      command,
      asset,
      kind: mediaKind(asset),
      ...(NAVI_SIMULATION_REPLAY_START[command] !== undefined
        ? { replayStartSeconds: NAVI_SIMULATION_REPLAY_START[command] }
        : {}),
    }),
  ])),
);

const defaultPreviewCommands: Readonly<Record<string, string>> = Object.freeze({
  diagonal: "diagonal_right",
  lateral: "lateral_left",
  turn: "turn_right",
});

export function resolveNaviPreviewCommand(canonicalName: string): string {
  return defaultPreviewCommands[canonicalName] ?? canonicalName;
}

export function getNaviSimulationMedia(canonicalName: string): NaviSimulationMedia | null {
  const command = resolveNaviPreviewCommand(canonicalName);
  return NAVI_SIMULATION_MEDIA_BY_COMMAND[command] ?? null;
}

export function validateNaviSimulationMedia(items: readonly PublicNaviReference[]): void {
  const previewCategories = new Set(["Movement", "Athletics", "Actions", "Posture"]);
  const missing = items
    .filter((item) =>
      item.status !== "development"
      && item.status !== "unsupported"
      && previewCategories.has(item.category)
      && item.name !== "recovery_stand"
    )
    .flatMap((item) => NAVI_PREVIEW_ALIASES[item.name] ?? [item.name])
    .filter((command) => !NAVI_SIMULATION_MEDIA_BY_COMMAND[command]);
  if (missing.length) throw new Error(`Missing Navi simulation previews: ${missing.join(", ")}`);
}
