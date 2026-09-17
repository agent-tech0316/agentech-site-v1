import type { AgentechFunction, AgentechParam, CapabilityStatus } from "./aegis-sdk-reference";

export type NaviFunction = AgentechFunction;

const p = (
  name: string,
  type: string,
  description: string,
  defaultValue?: string,
  status: CapabilityStatus = "available"
): AgentechParam => ({ name, type, description, defaultValue, status });

const naviConnection = p(
  "**connect_kwargs",
  "not accepted per call",
  "Select Navi once with Agentech.use(\"navi\"). Per-call connection options raise TypeError."
);

const controlledStop = p(
  "stop",
  "bool",
  "When true, send 12 repeated zero-velocity samples after movement. False is advanced use and leaves cleanup to Agentech.stop().",
  "True"
);

const athleticsCarpetNote =
  "These athletics tests were performed on carpet. Its compliant surface can cause landing rebound, foot slip, or uneven recovery even when Navi completes the command successfully.";

const namedExtendedAction = (
  name: string,
  summary: string,
  example = `Agentech.${name}()`
): AgentechFunction => ({
  name,
  category: "Actions",
  signature: `Agentech.${name}()`,
  summary,
  example,
  params: []
});

const namedCoreAction = (
  name: string,
  summary: string
): AgentechFunction => ({
  name,
  category: "Actions",
  signature: `Agentech.${name}()`,
  summary,
  example: `Agentech.${name}()`,
  params: []
});

const parameterizedAction = (
  name: string,
  signature: string,
  summary: string,
  example: string,
  params: AgentechParam[],
  profiles?: AgentechFunction["profiles"]
): AgentechFunction => ({
  name,
  category: "Actions",
  signature,
  summary,
  example,
  params,
  profiles
});

const internalNaviParamNames = new Set(["**connect_kwargs"]);

function completeParameterProfiles(item: AgentechFunction): AgentechFunction {
  const publicParams = item.params.filter((param) => !internalNaviParamNames.has(param.name));
  if (!publicParams.length || item.profiles?.length) return item;

  const allOptional = publicParams.every((param) => param.defaultValue !== undefined);
  const profiles: NonNullable<AgentechFunction["profiles"]> = [];
  if (allOptional) {
    profiles.push({ name: "Default", syntax: `Agentech.${item.name}()` });
  }
  profiles.push({
    name: allOptional ? "Configured options" : "Required parameters",
    syntax: item.signature
  });
  return { ...item, profiles };
}

function validateNaviReference(items: AgentechFunction[]) {
  const names = new Set<string>();
  for (const item of items) {
    if (names.has(item.name)) throw new Error(`Duplicate Navi SDK reference: ${item.name}`);
    names.add(item.name);

    const publicParams = item.params.filter((param) => !internalNaviParamNames.has(param.name));
    const paramNames = new Set<string>();
    for (const param of publicParams) {
      if (paramNames.has(param.name)) {
        throw new Error(`Duplicate Navi parameter: ${item.name}.${param.name}`);
      }
      paramNames.add(param.name);
    }
    for (const match of item.signature.matchAll(/\b([A-Za-z_]\w*)\s*=/g)) {
      if (!paramNames.has(match[1])) {
        throw new Error(`Undocumented Navi signature parameter: ${item.name}.${match[1]}`);
      }
    }
    if (publicParams.length && !item.profiles?.length) {
      throw new Error(`Missing Navi parameter profiles: ${item.name}`);
    }
  }
}

const motionVerification = "Live verified 2026-07-15 with controller error=0 and warning=0";
const naviFunctionDefinitions: AgentechFunction[] = [
  {
    name: "forward",
    category: "Movement",
    signature: "Agentech.forward()",
    summary: "Move forward using one positive speed-magnitude profile and a controlled stop.",
    example: "Agentech.forward(speed_mps=0.5, duration_s=1.0)",
    verification: "Live verified 2026-07-16 through Navi's 1.34 m/s limit with controller error=0 and warning=0",
    platformNote: "Navi has no dependable global X/Y odometry, so distance mode is open loop.",
    profiles: [
      { name: "Default: 1.0 m/s for 1 second", syntax: "Agentech.forward()" },
      { name: "Direct speed", syntax: "Agentech.forward(speed_mps=0.5, duration_s=1.0)", noteLabel: "Navi limits", note: "speed_mps must be from 0.05 through 1.34 m/s, and duration_s must be greater than 0 and no more than 10 seconds." },
      { name: "Distance + time", syntax: "Agentech.forward(distance_m=0.5, duration_s=2.0)", noteLabel: "Speed note", note: "The SDK derives speed as distance divided by duration. The resulting speed must remain within Navi's limit." },
      { name: "Percentage", syntax: "Agentech.forward(speed_percent=40, duration_s=1.0)" },
      { name: "Speed level", syntax: "Agentech.forward(speed_level=100, duration_s=1.0)" },
      { name: "Legacy aliases", syntax: "Agentech.forward(speed=0.5, seconds=1.0)" }
    ],
    params: [
      p("speed_mps", "float [0.05, 1.34] m/s", "Positive direct speed. The shared Aegis resolver accepts through 3.0 m/s, then the Navi adapter enforces 1.34 m/s."),
      p("duration_s", "float (0, 10] s", "Command duration.", "1.0"),
      p("speed_percent", "int [1, 100]", "Rounded to the nearest 5%; the resolved speed must remain at or below Navi's 1.34 m/s limit."),
      p("speed_level", "int [0, 511]", "One of 512 levels mapped from 0.05 to 3.0 m/s; the resolved Navi speed limit still applies."),
      p("distance_m", "float (0, 5] m", "Open-loop requested distance. Speed is distance_m / duration_s and must fit Navi's limit."),
      controlledStop,
      p("speed", "legacy float alias", "Alias for speed_mps. Do not provide both."),
      p("seconds", "legacy float alias", "Alias for duration_s. Do not provide both."),
      naviConnection
    ]
  },
  {
    name: "backward",
    category: "Movement",
    signature: "Agentech.backward()",
    summary: "Move backward using one positive speed-magnitude profile; direction is applied internally.",
    example: "Agentech.backward(speed_mps=0.5, duration_s=1.0)",
    verification: "Live verified 2026-07-16 through Navi's 0.67 m/s reverse limit with controller error=0 and warning=0",
    platformNote: "Public speeds are positive magnitudes; the adapter applies negative body-X internally.",
    profiles: [
      { name: "Default: 0.5 m/s for 1 second", syntax: "Agentech.backward()" },
      { name: "Direct speed", syntax: "Agentech.backward(speed_mps=0.5, duration_s=1.0)", noteLabel: "Navi limits", note: "speed_mps is a positive magnitude from 0.05 through 0.67 m/s, and duration_s must be greater than 0 and no more than 10 seconds." },
      { name: "Distance + time", syntax: "Agentech.backward(distance_m=0.5, duration_s=2.0)" },
      { name: "Percentage", syntax: "Agentech.backward(speed_percent=20, duration_s=1.0)" },
      { name: "Speed level", syntax: "Agentech.backward(speed_level=100, duration_s=1.0)" },
      { name: "Legacy aliases", syntax: "Agentech.backward(speed=0.5, seconds=1.0)" }
    ],
    params: [
      p("speed_mps", "float [0.05, 0.67] m/s", "Positive reverse-speed magnitude; Navi applies the negative direction."),
      p("duration_s", "float (0, 10] s", "Command duration.", "1.0"),
      p("speed_percent", "int [1, 100]", "Nearest-5% Aegis profile; resolved values above 0.67 m/s are rejected."),
      p("speed_level", "int [0, 511]", "Shared 512-level profile; resolved values above 0.67 m/s are rejected."),
      p("distance_m", "float (0, 3] m", "Open-loop distance; distance / duration must resolve within Navi's reverse limit."),
      controlledStop,
      p("speed", "legacy float alias", "Alias for speed_mps. Do not provide both."),
      p("seconds", "legacy float alias", "Alias for duration_s. Do not provide both."),
      naviConnection
    ]
  },
  {
    name: "lateral",
    category: "Movement",
    signature: "Agentech.lateral_left() / Agentech.lateral_right()",
    summary: "Step left or right using speed/time or distance/speed profiles.",
    example: "Agentech.lateral_left(speed_mps=0.5, duration_s=1.0)\nAgentech.lateral_right(distance_m=0.2, speed_mps=0.4)",
    verification: `${motionVerification}; both directions physically tested at 0.67 m/s for 2.0 seconds`,
    platformNote: "Controlled cleanup sends repeated zero velocity only. It does not call damping or recovery stand, so Navi remains upright in move-ready mode.",
    profiles: [
      { name: "Default: 0.5 m/s for 2 seconds", syntax: "Agentech.lateral_left()\nAgentech.lateral_right()" },
      { name: "Distance + speed", syntax: "Agentech.lateral_right(distance_m=0.2, speed_mps=0.4)", note: "Duration is derived as distance / speed and must not exceed 10 seconds." },
      { name: "Speed + time", syntax: "Agentech.lateral_left(speed_mps=0.5, duration_s=1.0)" },
      { name: "Legacy aliases", syntax: "Agentech.lateral_left(speed=0.5, seconds=1.0)" }
    ],
    params: [
      p("distance_m", "float (0, 10] m", "Requires speed_mps and forbids duration_s. Execution is open loop."),
      p("speed_mps", "float [0.10, 0.67] m/s", "Positive magnitude. The function name chooses left or right."),
      p("duration_s", "float (0, 10] s", "Timed-profile duration.", "2.0"),
      controlledStop,
      p("speed", "legacy float alias", "Alias for speed_mps."),
      p("seconds", "legacy float alias", "Alias for duration_s."),
      naviConnection
    ]
  },
  {
    name: "diagonal",
    category: "Movement",
    signature: "Agentech.diagonal()",
    summary: "Move diagonally with the same X/Y or angle, combined-speed, and duration profiles as Aegis.",
    example: "# Coordinate + duration\nAgentech.diagonal(x_m=0.5, y_m=1.0, duration_s=2.0)\n\n# Angle + combined speed + duration\nAgentech.diagonal(angle_deg=45, speed_mps=0.5, duration_s=2.0)",
    verification: "Implemented in the latest Navi SDK; movement recordings cover backward, both lateral directions, and two diagonal directions.",
    platformNote: "The public profiles are identical to Aegis. Navi converts angle and combined speed into forward and lateral velocity components internally. Its X/Y profile is open loop because Navi has no dependable global position feedback. Cleanup sends zero velocity only without damping.",
    profiles: [
      { name: "Default: forward-right at 45 degrees, 0.5 m/s for 2 seconds", syntax: "Agentech.diagonal()", noteLabel: "Navi limits", note: "The resolved forward and lateral components must each remain inside Navi's controller limits." },
      { name: "X/Y coordinates + time", syntax: "Agentech.diagonal(x_m=x, y_m=x, duration_s=x)", noteLabel: "Open-loop position", note: "Navi divides X and Y by the requested time to obtain lateral and forward speeds. The endpoint is estimated, not measured." },
      { name: "Angle + combined speed + time", syntax: "Agentech.diagonal(angle_deg=x, speed_mps=x, duration_s=x)", noteLabel: "Resolved components", note: "The combined speed is the hypotenuse. Navi resolves it with sine and cosine, then verifies both components against its controller limits." }
    ],
    params: [
      p("x_m", "float (nonzero)", "Requested open-loop right/left displacement. Positive is right; negative is left."),
      p("y_m", "float (nonzero)", "Requested open-loop forward/backward displacement. Positive is forward; negative is backward."),
      p("angle_deg", "float [-180, 180], non-cardinal", "Direction measured from forward. Positive points right and negative points left.", "45"),
      p("speed_mps", "float > 0, component-limited", "Combined diagonal speed. The resolved forward and lateral components must remain inside Navi's limits.", "0.5"),
      p("duration_s", "float (0, 10] seconds", "How long to apply the diagonal velocity command.", "2.0"),
      controlledStop
    ]
  },
  {
    name: "turn",
    category: "Movement",
    signature: "Agentech.turn()",
    summary: "Turn with signed angle, rate, percentage, level, timed, or fixed-shortcut profiles.",
    example: "Agentech.turn(angle_deg=-45, turn_rate_rad_s=0.5)",
    verification: `${motionVerification}; yaw-feedback controller verified in hardware-free wraparound and fail-safe tests; physical angle calibration pending`,
    platformNote: "Positive public values turn right and negative values turn left. The requested angle is the target: live body-yaw feedback varies speed and completion time, requires five consecutive readings within 1 degree, and corrects again if settling drifts outside that window. Explicit rate-plus-time turns remain open loop.",
    profiles: [
      { name: "Default angle", syntax: "Agentech.turn()  # right 45 degrees at 2 rad/s", noteLabel: "Accuracy note", note: "Turn angle is not guaranteed." },
      { name: "Angle + optional rate", syntax: "Agentech.turn(angle_deg=-45, turn_rate_rad_s=0.5)", noteLabel: "Accuracy note", note: "Turn angle is not guaranteed." },
      { name: "Angular-distance alias", syntax: "Agentech.turn(distance_rad=1.0)", noteLabel: "Accuracy note", note: "Turn distance is not guaranteed." },
      { name: "Signed rate + time", syntax: "Agentech.turn(turn_rate_rad_s=2.5, duration_s=0.15)", noteLabel: "Accuracy note", note: "The calculated turn distance and angle are not guaranteed." },
      { name: "Percentage + optional time", syntax: "Agentech.turn(rate_percentage=40, duration_s=0.25)" },
      { name: "Level + optional time", syntax: "Agentech.turn(turn_level=-200, duration_s=0.25)" },
      { name: "Fixed shortcuts", syntax: "Agentech.turn_right()\nAgentech.turn_left()\nAgentech.u_turn()" }
    ],
    params: [
      p("angle_deg", "finite nonzero float", "Signed target in degrees. Positive right, negative left. Omit all parameters for the +45-degree default."),
      p("angle_rad", "finite nonzero float", "Signed target in radians; exclusive with the other angle selectors."),
      p("distance_deg", "finite nonzero float", "Angular-distance alias for angle_deg."),
      p("distance_rad", "finite nonzero float", "Angular-distance alias for angle_rad."),
      p("turn_rate_rad_s", "0 or magnitude [0.02, 3.0]", "Signed in timed mode; positive magnitude when paired with an explicit target."),
      p("turn_rate_deg_s", "0 or magnitude [1.145916, 171.887339]", "Degree-rate form of turn_rate_rad_s."),
      p("rate_percentage", "int [-100, 100]", "Rounded to the nearest signed 5%. Zero is a no-op."),
      p("turn_level", "int [-511, 511]", "Signed 512-level rate scale. Zero is a no-op."),
      p("duration_s", "float (0, 10] s on Navi", "Required for explicit rate-plus-time turns, which remain open loop. Angle targets do not use this as their stopping measurement."),
      controlledStop,
      naviConnection
    ]
  },
  {
    name: "return_to_home",
    category: "Movement",
    signature: "Agentech.return_to_home(facing_angle_deg=0)",
    summary: "Return Navi to the fixed dual-camera home coordinates, then face one of four approved cardinal directions.",
    example: "# Exact saved home heading\nAgentech.return_to_home()\n\n# Same fixed position, face right\nAgentech.return_to_home(facing_angle_deg=90)",
    verification: "Dual-camera preview verified against OBS and Camo with sub-pixel position error and IMU-backed 360-degree heading.",
    platformNote: "Premium Navi capability. The home X/Y coordinates are immutable. Only 0, 90, 180, and 270 degrees are accepted; positive values rotate clockwise from the saved default heading.",
    platformNoteLabel: "Fixed home + premium access",
    creditUsage: "high",
    access: {
      tier: "premium",
      featureCode: "navi_return_to_home",
      includedWithMonthlySubscription: true,
      oneTimePurchase: true
    },
    profiles: [
      { name: "Default saved heading", syntax: "Agentech.return_to_home()" },
      { name: "Face right", syntax: "Agentech.return_to_home(facing_angle_deg=90)" },
      { name: "Face backward", syntax: "Agentech.return_to_home(facing_angle_deg=180)" },
      { name: "Face left", syntax: "Agentech.return_to_home(facing_angle_deg=270)" }
    ],
    params: [
      p("facing_angle_deg", "0 | 90 | 180 | 270", "Final clockwise orientation relative to the immutable saved home heading.", "0")
    ]
  },
  {
    name: "jump",
    category: "Athletics",
    signature: "Agentech.jump()",
    summary: "Navi bends all four legs, springs straight upward, and lands on all four feet in nearly the same place.",
    example: "Agentech.jump()",
    verification: "Physically verified 2026-07-15 with a clean vertical takeoff and four-foot landing",
    platformNote: `${athleticsCarpetNote} The standard jump showed foot slip while absorbing the landing.`,
    params: []
  },
  {
    name: "jump_round",
    category: "Athletics",
    signature: "Agentech.jump_round()",
    summary: "Navi makes a small vertical hop and lands close to its starting position.",
    example: "Agentech.jump_round()",
    verification: "Physically verified 2026-07-15; visibly smaller than Agentech.jump(), with no obvious rotation in the tested default configuration",
    platformNote: athleticsCarpetNote,
    params: []
  },
  {
    name: "jump_forward",
    category: "Athletics",
    signature: "Agentech.jump_forward()",
    summary: "Navi crouches, leaps forward, and makes an initial four-foot landing ahead of its starting position.",
    example: "Agentech.jump_forward()",
    verification: "Physically verified 2026-07-15 with clear forward travel and an initial four-foot landing",
    platformNote: `${athleticsCarpetNote} The forward jump showed a clean initial landing followed by rebound and disrupted foot placement.`,
    params: []
  },
  {
    name: "frontflip",
    category: "Athletics",
    signature: "Agentech.frontflip()",
    summary: "Navi completes a forward rotation and returns to a stable four-foot landing.",
    example: "Agentech.frontflip()",
    verification: "Physically verified 2026-07-15 with a clean forward rotation and no landing slip",
    platformNote: athleticsCarpetNote,
    params: []
  },
  {
    name: "sideflip",
    category: "Athletics",
    signature: "Agentech.sideflip(direction=x)",
    summary: "Navi completes a lateral rotation toward the selected side and returns to a stable four-foot landing.",
    example: "Agentech.sideflip(direction=\"left\")",
    verification: "Physically verified 2026-07-15 in both directions with clean rotations and no landing slip",
    params: [
      p("direction", '"left" | "right"', "Choose which side Navi flips toward.", '"left"')
    ]
  },
  {
    name: "kick",
    category: "Athletics",
    signature: "Agentech.kick()",
    summary: "Navi performs a dynamic kicking sequence, regains a balanced four-foot stance, and returns to standing.",
    example: "Agentech.kick()",
    platformNote: athleticsCarpetNote,
    params: []
  },
  {
    name: "sway",
    category: "Actions",
    signature: "Agentech.sway()",
    summary: "Navi continuously rocks its body left and right for the requested time, then automatically returns to standing.",
    example: "Agentech.sway(duration_s=3.0)",
    profiles: [
      { name: "Default: 3 seconds", syntax: "Agentech.sway()" },
      { name: "Duration", syntax: "Agentech.sway(duration_s=x)" }
    ],
    params: [p("duration_s", "float > 0 (no maximum)", "Any positive number of seconds to rock before returning to standing.", "3.0")]
  },
  {
    name: "pee",
    category: "Actions",
    signature: "Agentech.pee()",
    summary: "Navi raises its right rear leg into a one-legged pose, holds it for the requested time, then automatically returns to standing.",
    example: "Agentech.pee(duration_s=3.0)",
    profiles: [
      { name: "Default: 3 seconds", syntax: "Agentech.pee()" },
      { name: "Duration", syntax: "Agentech.pee(duration_s=x)" }
    ],
    params: [p("duration_s", "float > 0 (no maximum)", "Any positive number of seconds to hold the raised-leg pose before returning to standing.", "3.0")]
  },
  {
    name: "shake_hand",
    category: "Actions",
    signature: "Agentech.shake_hand()",
    summary: "Navi raises its right front leg and presents it forward for the requested time, then automatically returns to standing.",
    example: "Agentech.shake_hand(duration_s=3.0)",
    profiles: [
      { name: "Default: 3 seconds", syntax: "Agentech.shake_hand()" },
      { name: "Duration", syntax: "Agentech.shake_hand(duration_s=x)" }
    ],
    params: [p("duration_s", "float > 0 (no maximum)", "Any positive number of seconds to hold the handshake pose before returning to standing.", "3.0")]
  },
  namedCoreAction("knock", "Navi raises its right front leg, makes three short knocking taps, then places the leg back on the floor and returns to standing."),
  {
    name: "hip_shake",
    category: "Actions",
    signature: "Agentech.hip_shake()",
    summary: "Navi shakes its rear hips left and right for the requested time, then automatically returns to standing. The motion may slip or fail on a low-traction floor.",
    example: "Agentech.hip_shake(duration_s=3.0)",
    profiles: [
      { name: "Default: 3 seconds", syntax: "Agentech.hip_shake()" },
      { name: "Duration", syntax: "Agentech.hip_shake(duration_s=x)" }
    ],
    params: [p("duration_s", "float > 0 (no maximum)", "Any positive number of seconds to shake the rear hips before returning to standing.", "3.0")]
  },
  namedExtendedAction("wave_hand", "Navi raises its right front leg, swings it from side to side in a clear waving gesture, then returns to standing."),
  namedExtendedAction("bow", "Navi keeps its rear feet in place, bends both front legs slightly, and lowers the front of its body toward the floor."),
  namedExtendedAction("wag_rear", "Navi swings only the rear end of its body from side to side; this robot has no physical tail."),
  parameterizedAction("bark", "Agentech.bark(count=x)", "Navi performs the requested number of silent bark-like body thrusts continuously, then recovers to standing once after the final bark.", "Agentech.bark(count=10)", [p("count", "int > 0", "Any positive number of continuous bark gestures. Navi does not reset to standing between repetitions.", "1")]),
  parameterizedAction("nod_head", "Agentech.nod_head(count=x)", "Navi lowers and raises its forebody in one or two deliberate nods.", "Agentech.nod_head(count=2)", [p("count", "int {1, 2}", "Number of nods.", "1")]),
  parameterizedAction("shake_head", "Agentech.shake_head(count=x)", "Navi twists its forebody left and right once or repeats the no-like gesture.", "Agentech.shake_head(count=2)", [p("count", "int {1, 2}", "Number of head-shake sequences.", "1")]),
  parameterizedAction("confused", "Agentech.confused(style=x)", "Choose a single questioning shrug or a longer repeated puzzled reaction.", "Agentech.confused(style=\"repeated\")", [p("style", '"single" | "repeated"', "Select the compact or repeated puzzled routine.", '"single"')]),
  parameterizedAction("show_affection", "Agentech.show_affection(style=x)", "Choose a gentle affectionate body rock or a longer seven-second sequence.", "Agentech.show_affection(style=\"extended\")", [p("style", '"gentle" | "extended"', "Select the short or extended affectionate routine.", '"gentle"')]),
  namedExtendedAction("draw_heart", "Navi lifts its left front leg, traces a heart-shaped path through the air, then returns the leg to its standing position."),
  parameterizedAction("cute", "Agentech.cute(style=x)", "Choose a compact playful shimmy or a longer low-body pose sequence.", "Agentech.cute(style=\"pose\")", [p("style", '"shimmy" | "pose"', "Select the playful routine.", '"shimmy"')]),
  namedExtendedAction("ask_for_play", "Navi lowers its forequarters into a playful bow, sways its upper body from side to side, then returns to standing."),
  parameterizedAction("enjoy_touch", "Agentech.enjoy_touch(style=x)", "Choose a gentle, happy, or strongly delighted touch-response sequence.", "Agentech.enjoy_touch(style=\"happy\")", [p("style", '"gentle" | "happy" | "delighted"', "Select the intensity and length of the touch response.", '"gentle"')]),
  parameterizedAction("sniff_left", "Agentech.sniff_left(speed=x)", "Navi lowers its left-front side toward the floor using the normal or slow sniffing sequence.", "Agentech.sniff_left(speed=\"slow\")", [p("speed", '"normal" | "slow"', "Select the standard or slower left sniff.", '"normal"')]),
  parameterizedAction("sniff_right", "Agentech.sniff_right(speed=x)", "Navi mirrors the floor-level sniff toward the right using the normal or slow sequence.", "Agentech.sniff_right(speed=\"slow\")", [p("speed", '"normal" | "slow"', "Select the standard or slower right sniff.", '"normal"')]),
  parameterizedAction("sniff_ahead", "Agentech.sniff_ahead(style=x)", "Navi lowers both front legs into a standard or deeper forward sniffing pose.", "Agentech.sniff_ahead(style=\"deep\")", [p("style", '"standard" | "deep"', "Select the normal or deeper forward sniff.", '"standard"')]),
  parameterizedAction("front_stretch", "Agentech.front_stretch(style=x)", "Navi extends both front legs and lowers its chest through a full or compact front stretch.", "Agentech.front_stretch(style=\"compact\")", [p("style", '"standard" | "compact"', "Select the full-range or compact stretch.", '"standard"')]),
  namedExtendedAction("full_body_stretch", "Navi begins with a rear-body stretch, transitions into its deep forward stretch, then returns to a normal four-foot stance."),
  {
    name: "push_up",
    category: "Actions",
    signature: "Agentech.push_up()",
    summary: "Navi lowers into a push-up stance, completes its fixed five controlled vertical repetitions, then recovers to standing.",
    example: "Agentech.push_up()",
    verification: "The physical robot produced five repetitions when tested with attempted counts of both 1 and 3",
    platformNote: "NAVI firmware ignores repetition-count inputs for this routine. The SDK therefore exposes push_up() without a count parameter and accurately documents the fixed five repetitions.",
    profiles: [
      { name: "Fixed: 5 repetitions", syntax: "Agentech.push_up()" }
    ],
    params: []
  },
  parameterizedAction("look_around", "Agentech.look_around(style=x)", "Navi performs one of six planted-foot surroundings scans, from brief side glances to broad low or high sweeps.", "Agentech.look_around(style=\"high\")", [p("style", '"panoramic" | "left" | "right" | "low" | "quick" | "high"', "Select the scan path and range.", '"panoramic"')]),
  parameterizedAction("think", "Agentech.think(style=x)", "Choose the standard, long, or short thinking gesture.", "Agentech.think(style=\"long\")", [p("style", '"standard" | "long" | "short"', "Select the thinking routine length and motion pattern.", '"standard"')]),
  {
    name: "observe",
    category: "Actions",
    signature: "Agentech.observe()",
    summary: "Navi begins a planted observation sweep by twisting left; the expected opposite-side completion may be interrupted by foot slip.",
    example: "Agentech.observe()",
    verification: "Physically observed on carpet; the leftward sweep executed, but slipping interrupted the complete routine",
    platformNote: "Use a firm, level, high-traction surface. The expected rightward sweep remains unconfirmed because the carpet test did not finish cleanly.",
    params: []
  },
  namedExtendedAction("yawn", "Navi gently extends its whole body, subtly lengthening its stance and torso before relaxing back to standing. It resembles a mild stretch but uses a smaller range than full_body_stretch()."),
  namedExtendedAction("clap_hand", "Navi raises a front leg and reaches it upward and forward in a short presenting gesture before returning to standing."),
  {
    name: "dance",
    category: "Actions",
    signature: "Agentech.dance()",
    summary: "Navi performs the selected coordinated whole-body dance, then returns to standing.",
    example: "Agentech.dance(style=\"shoulder\")",
    profiles: [
      { name: "Beat dance", syntax: "Agentech.dance(style=\"beats\")" },
      { name: "Shoulder dance", syntax: "Agentech.dance(style=\"shoulder\")" },
      { name: "Lion dance", syntax: "Agentech.dance(style=\"lion\")" },
      { name: "Dance in place", syntax: "Agentech.dance(style=\"in_place\")" },
      { name: "Four-count dance", syntax: "Agentech.dance(style=\"four_count\")" },
      { name: "Nine-count dance", syntax: "Agentech.dance(style=\"nine_count\")" },
      { name: "Four-beat dance", syntax: "Agentech.dance(style=\"four_beat\")" }
    ],
    params: [
      p("style", '"beats" | "shoulder" | "lion" | "in_place" | "four_count" | "nine_count" | "four_beat"', "Choose Navi's dance choreography.", '"beats"')
    ]
  },
  namedExtendedAction("eager", "Navi lowers and stretches forward through an animated sequence of eager body shifts before returning to standing."),
  namedExtendedAction("rub_eyes", "Navi lowers its forebody, moves a raised front leg near its face in a rubbing-like gesture, then runs the canonical standing recovery."),
  parameterizedAction("point_to_sky", "Agentech.point_to_sky(direction=x)", "Navi balances low and raises the selected front leg into an upward pointing pose.", "Agentech.point_to_sky(direction=\"right\")", [p("direction", '"left" | "right"', "Choose which front leg points upward.", '"left"')]),
  namedExtendedAction("wait_for_praise", "Navi lengthens both front legs, lowers its rear body into an expectant pose, holds briefly, then recovers."),
  parameterizedAction("lucky_cat", "Agentech.lucky_cat(style=x)", "Choose a full, quick, or brief beckoning-paw routine.", "Agentech.lucky_cat(style=\"quick\")", [p("style", '"full" | "quick" | "brief"', "Select the length and motion range of the beckoning gesture.", '"full"')]),
  namedExtendedAction("dramatic_listen", "Navi freezes, leans, and reacts through an exaggerated listening pose."),
  namedExtendedAction("jingle", "Navi combines quick low body bounces with alternating playful forebody accents."),
  namedExtendedAction("flex_muscles", "Navi braces low and alternates widened foreleg poses like a flexing display."),
  namedExtendedAction("good_night_wave", "Navi raises one front leg high and makes a gentle farewell wave before lowering it."),
  namedExtendedAction("cry", "Navi droops through repeated low, uneven forebody movements that suggest sadness."),
  namedExtendedAction("encourage", "Navi raises a front leg and punctuates several upbeat forward body accents."),
  namedExtendedAction("playful_greeting", "Navi combines a low bow, body sway, and lively recovery in a welcoming sequence."),
  namedExtendedAction("nod_with_beats", "Navi performs several compact forebody nods in a quick, regular rhythm."),
  namedExtendedAction("head_up_down", "Navi alternates a pronounced forebody lift and drop before leveling out."),
  namedExtendedAction("push_ahead", "Navi drives its torso forward over planted feet in one short, forceful push."),
  namedExtendedAction("brace", "Navi lowers and stiffens its stance briefly as if bracing against a forward force."),
  namedExtendedAction("shake_hand_quick", "Navi raises its right front leg for a short handshake presentation and returns immediately."),
  namedExtendedAction("pee_quick", "Navi briefly raises its right rear leg and resets in a one-shot balance gesture."),
  namedExtendedAction("sway_front_back", "Navi rocks its torso forward and backward over planted feet, then returns to center."),
  namedExtendedAction("step_idle", "Navi makes a small in-place weight shift and foot adjustment without traveling away."),
  namedExtendedAction("rear_stretch", "Navi extends its hind legs and lengthens the rear body before returning to neutral."),
  parameterizedAction("rear_puff", "Agentech.rear_puff(style=x)", "Choose the short or long comic rear-body lift-and-pulse routine.", "Agentech.rear_puff(style=\"long\")", [p("style", '"short" | "long"', "Select the brief or extended rear-body routine.", '"short"')]),
  parameterizedAction("chat", "Agentech.chat(style=x)", "Choose one of five conversational body-motion patterns, from a brief reply to a longer animated exchange.", "Agentech.chat(style=\"animated\")", [p("style", '"animated" | "gentle" | "brief" | "five_second" | "talking"', "Select the conversational rhythm and length.", '"animated"')]),
  parameterizedAction("cooking", "Agentech.cooking(recover=x)", "Navi sweeps a raised front leg right and left in a stirring-like motion, optionally including the full recovery sequence.", "Agentech.cooking(recover=True)", [p("recover", "bool", "When true, use the longer routine with its complete controlled reset.", "True")]),
  parameterizedAction("eat", "Agentech.eat(swallow=x)", "Navi lowers toward an imaginary bowl and performs an eating sequence, optionally adding the swallow-like finish.", "Agentech.eat(swallow=True)", [p("swallow", "bool", "Include the longer finishing motion after eating.", "True")]),
  parameterizedAction("excited", "Agentech.excited(style=x)", "Choose a quick energetic bounce or a fuller excited body routine.", "Agentech.excited(style=\"full\")", [p("style", '"full" | "quick"', "Select the full or compact excitement sequence.", '"full"')]),
  namedExtendedAction("shake_self", "Navi rapidly oscillates its torso and shoulders from side to side like shaking off water."),
  parameterizedAction("explore_road", "Agentech.explore_road(style=x)", "Navi inspects the path with either left-right body turns or side-to-side tilts.", "Agentech.explore_road(style=\"turn\")", [p("style", '"turn" | "tilt"', "Choose the turning or tilting scan.", '"turn"')]),
  parameterizedAction("search_environment", "Agentech.search_environment(style=x)", "Navi searches the nearby environment using a broad body turn or a compact side tilt.", "Agentech.search_environment(style=\"tilt\")", [p("style", '"turn" | "tilt"', "Choose the turning or tilting search pattern.", '"turn"')]),
  namedExtendedAction("search_tag", "Navi makes a short directed dip and turn as if checking for a nearby marker."),
  namedExtendedAction("body_tag_search", "Navi shifts and lowers its torso through a compact body-centered search pattern."),
  parameterizedAction("listen", "Agentech.listen(direction=x)", "Navi tilts attentively toward the left, right, or checks both sides in sequence.", "Agentech.listen(direction=\"both\")", [p("direction", '"left" | "right" | "both"', "Choose the listening direction.", '"both"')]),
  parameterizedAction("toss", "Agentech.toss(direction=x)", "Navi dips and snaps its forebody upward in a centered, left, or right tossing-like motion.", "Agentech.toss(direction=\"left\")", [p("direction", '"center" | "left" | "right"', "Choose the toss orientation.", '"center"')]),
  namedExtendedAction("explore_new_home", "Navi lowers into a cautious forward-looking pose and makes a compact exploratory shift."),
  namedExtendedAction("bored_half_sit", "Navi sinks into a loose half-seated slump and then rises again."),
  namedExtendedAction("rest", "Navi briefly settles into a low relaxed posture before returning to standing."),
  namedExtendedAction("sniff_up", "Navi lifts and angles its forebody upward through repeated air-sniffing motions."),
  parameterizedAction("act_shy", "Agentech.act_shy(side=x)", "Navi curls into a soft asymmetric lowered pose with a left or right emphasis.", "Agentech.act_shy(side=\"right\")", [p("side", '"left" | "right"', "Choose the side emphasized by the shy pose.", '"left"')]),
  namedExtendedAction("look_down", "Navi folds its forequarters into a low downward-looking pose, pauses, and rises."),
  parameterizedAction("snuggle", "Agentech.snuggle(style=x)", "Choose a compact low-to-high snuggle rise or a softer downward curl.", "Agentech.snuggle(style=\"curl\")", [p("style", '"rise" | "curl"', "Select the rising or curling snuggle motion.", '"rise"')]),
  namedExtendedAction("be_sleepy", "Navi performs a long drowsy routine with repeated droops, low pauses, and partial waking motions."),
  parameterizedAction("brush_teeth", "Agentech.brush_teeth(direction=x, phase=x)", "Navi repeats raised-front-leg brushing motions on the selected side; the right side also has a start-only phase.", "Agentech.brush_teeth(direction=\"left\", phase=\"full\")", [p("direction", '"left" | "right"', "Choose the brushing side.", '"right"'), p("phase", '"full" | "start"', "Choose the complete routine or the right-side starting phase. The start phase is unavailable on the left.", '"full"')]),
  namedExtendedAction("smell_food", "Navi lowers toward imaginary food and performs the pre-eating smell routine."),
  namedExtendedAction("look_at_food", "Navi performs the pre-eating routine that looks toward imaginary food."),
  namedExtendedAction("eat_yellow", "Navi runs the firmware's eat-yellow motion sequence."),
  namedExtendedAction("drink", "Navi lowers toward an imaginary bowl and performs the drinking motion."),
  namedExtendedAction("enjoy_eating", "Navi performs the animated enjoying-food motion."),
  namedExtendedAction("finish_eating", "Navi completes the firmware's finish-eating sequence."),
  namedExtendedAction("apply_toothpaste", "Navi performs the toothpaste portion of the brushing routine."),
  namedExtendedAction("main_brush", "Navi runs the main tooth-brushing motion sequence."),
  namedExtendedAction("gargle", "Navi performs the firmware gargling motion."),
  namedExtendedAction("brush_teeth_horizontal_30s", "Navi runs the 30-second horizontal tooth-brushing routine."),
  namedExtendedAction("brush_teeth_back_and_forth_30s", "Navi runs the 30-second back-and-forth tooth-brushing routine."),
  namedExtendedAction("brush_teeth_horizontal_23s", "Navi runs the 23-second horizontal tooth-brushing routine."),
  namedExtendedAction("raise_camera", "Navi raises into the firmware camera pose."),
  namedExtendedAction("brush_teeth_vertical_30s", "Navi runs the 30-second vertical tooth-brushing routine."),
  namedExtendedAction("toilet_pose", "Navi lowers its hindquarters into a brief toileting-like squat and then returns to standing."),
  namedExtendedAction("fast_rotate", "Navi rapidly turns through a long energetic sequence. Carpet can introduce slip and path drift."),
  namedExtendedAction("swim", "Navi lowers its body and cycles its legs in broad paddling-like motions before recovery."),
  namedExtendedAction("joy_walk", "Navi performs a buoyant low walk with exaggerated rhythmic steps and body bounce."),
  namedExtendedAction("duck_walk", "Navi travels in a low crouch using short alternating steps."),
  parameterizedAction("step", "Agentech.step(direction=x)", "Navi takes one compact preset step forward or backward and settles.", "Agentech.step(direction=\"forward\")", [p("direction", '"forward" | "backward"', "Choose the direction of the single preset step.", '"forward"')]),
  namedExtendedAction("nod_off", "Navi performs a long sleep sequence with repeated low droops and small waking motions."),
  {
    name: "stand",
    category: "Posture",
    signature: "Agentech.stand()",
    summary: "Navi rises into its normal four-leg standing stance, ready to walk.",
    example: "Agentech.stand()",
    params: []
  },
  {
    name: "squat",
    category: "Posture",
    signature: "Agentech.squat()",
    summary: "Navi lowers its level torso close to the floor with all four legs folded outward, holds the posture for the requested time, then returns to regular standing mode.",
    example: "Agentech.squat(time=30.0)",
    verification: "Physically verified 2026-07-16; timed automatic return to Stand is implemented in the Navi SDK",
    profiles: [
      { name: "Default: 30 seconds", syntax: "Agentech.squat()" },
      { name: "Holding time", syntax: "Agentech.squat(time=x)" }
    ],
    params: [p("time", "float > 0 (no maximum)", "Any positive number of seconds to hold the squat before returning to regular standing mode.", "30.0")]
  },
  {
    name: "sit",
    category: "Posture",
    signature: "Agentech.sit()",
    summary: "Navi lowers its rear body to the floor while its extended front legs keep the shoulders elevated, holds the posture for the requested time, then returns to regular standing mode.",
    example: "Agentech.sit(time=30.0)",
    verification: "Physically verified 2026-07-16; timed automatic return to Stand is implemented in the Navi SDK",
    profiles: [
      { name: "Default: 30 seconds", syntax: "Agentech.sit()" },
      { name: "Holding time", syntax: "Agentech.sit(time=x)" }
    ],
    params: [p("time", "float > 0 (no maximum)", "Any positive number of seconds to hold the seated posture before returning to regular standing mode.", "30.0")]
  },
  {
    name: "lie_down",
    category: "Posture",
    signature: "Agentech.lie_down()",
    summary: "Navi lowers its chest and body close to the floor and folds its legs into a resting posture.",
    example: "Agentech.lie_down()",
    params: []
  },
  {
    name: "lie_on_elbows",
    category: "Posture",
    signature: "Agentech.lie_on_elbows()",
    summary: "Navi keeps its hindquarters seated while folding its front joints more deeply than in sit(), lowers the shoulders and chest for the requested time, then returns to regular standing mode.",
    example: "Agentech.lie_on_elbows(time=30.0)",
    verification: "Physically verified 2026-07-16; timed automatic return to Stand is implemented in the Navi SDK",
    profiles: [
      { name: "Default: 30 seconds", syntax: "Agentech.lie_on_elbows()" },
      { name: "Holding time", syntax: "Agentech.lie_on_elbows(time=x)" }
    ],
    params: [p("time", "float > 0 (no maximum)", "Any positive number of seconds to hold the forequarters-low posture before returning to regular standing mode.", "30.0")]
  },
  {
    name: "prostrate",
    category: "Posture",
    signature: "Agentech.prostrate()",
    summary: "Navi lowers its level torso close to the floor with all four legs deeply folded and spread outward, then returns to regular Stand after the requested time.",
    example: "Agentech.prostrate(time=30.0)",
    verification: "Physically verified 2026-07-16; timed automatic return to Stand is implemented in the Navi SDK",
    profiles: [
      { name: "Default: 30 seconds", syntax: "Agentech.prostrate()" },
      { name: "Holding time", syntax: "Agentech.prostrate(time=x)" }
    ],
    params: [p("time", "float > 0 (no maximum)", "Any positive number of seconds to hold the prostrate posture before returning to regular standing mode.", "30.0")]
  },
  {
    name: "sphinx_lie",
    category: "Posture",
    signature: "Agentech.sphinx_lie()",
    summary: "Navi extends its front legs to support raised forequarters while its torso slopes toward lowered hindquarters and rear legs stretched behind, then automatically returns to Stand after the requested time.",
    example: "Agentech.sphinx_lie(time=30.0)",
    verification: "Physically verified 2026-07-16; Navi automatically returns to Stand when the requested hold ends",
    profiles: [
      { name: "Default: 30 seconds", syntax: "Agentech.sphinx_lie()" },
      { name: "Holding time", syntax: "Agentech.sphinx_lie(time=x)" }
    ],
    params: [p("time", "float > 0 (no maximum)", "Any positive number of seconds to hold the sphinx posture before Navi automatically returns to regular standing mode.", "30.0")]
  },
  {
    name: "sphinx_left_lie",
    category: "Posture",
    signature: "Agentech.sphinx_left_lie()",
    summary: "Navi rolls its torso toward the left, lays its left-side legs along the floor, and keeps the opposite-side legs braced before automatically returning to Stand after the requested time.",
    example: "Agentech.sphinx_left_lie(time=30.0)",
    verification: "Physically verified 2026-07-16; Navi automatically returns to Stand when the requested hold ends",
    profiles: [
      { name: "Default: 30 seconds", syntax: "Agentech.sphinx_left_lie()" },
      { name: "Holding time", syntax: "Agentech.sphinx_left_lie(time=x)" }
    ],
    params: [p("time", "float > 0 (no maximum)", "Any positive number of seconds to hold the left sphinx posture before Navi automatically returns to regular standing mode.", "30.0")]
  },
  {
    name: "sphinx_right_lie",
    category: "Posture",
    signature: "Agentech.sphinx_right_lie()",
    summary: "Navi rolls its torso toward the right, lays its right-side legs along the floor, and keeps the opposite-side legs braced before automatically returning to Stand after the requested time.",
    example: "Agentech.sphinx_right_lie(time=30.0)",
    verification: "Physically verified 2026-07-16; Navi automatically returns to Stand when the requested hold ends",
    profiles: [
      { name: "Default: 30 seconds", syntax: "Agentech.sphinx_right_lie()" },
      { name: "Holding time", syntax: "Agentech.sphinx_right_lie(time=x)" }
    ],
    params: [p("time", "float > 0 (no maximum)", "Any positive number of seconds to hold the right sphinx posture before Navi automatically returns to regular standing mode.", "30.0")]
  },
  {
    name: "stand_high",
    category: "Posture",
    signature: "Agentech.stand_high()",
    summary: "Navi extends all four planted legs and holds its level torso slightly higher than normal. Starting forward movement lowers it to the normal walking height before it moves.",
    example: "Agentech.stand_high()",
    verification: "Physically verified 2026-07-16; a forward command transitions Navi from the raised stance to its normal walking height",
    params: []
  },
  {
    name: "stand_at_ease",
    category: "Posture",
    signature: "Agentech.stand_at_ease()",
    summary: "Navi holds a relaxed staggered stance by placing its left front foot slightly ahead of the right front foot, then returns to regular Stand after the requested time.",
    example: "Agentech.stand_at_ease(time=30.0)",
    verification: "Physically verified 2026-07-16; timed automatic return to Stand is implemented in the Navi SDK",
    profiles: [
      { name: "Default: 30 seconds", syntax: "Agentech.stand_at_ease()" },
      { name: "Holding time", syntax: "Agentech.stand_at_ease(time=x)" }
    ],
    params: [p("time", "float > 0 (no maximum)", "Any positive number of seconds to hold the at-ease stance before returning to regular standing mode.", "30.0")]
  },
  {
    name: "stand_at_attention",
    category: "Posture",
    signature: "Agentech.stand_at_attention()",
    summary: "Navi draws its feet into a centered, aligned stance and briefly holds an alert posture before relaxing.",
    example: "Agentech.stand_at_attention()",
    params: []
  },
  {
    name: "recovery_stand",
    category: "Posture",
    signature: "Agentech.recovery_stand(direction=x)",
    summary: "Under development. This recovery command is currently blocked and sends no motion to Navi.",
    example: "# Under development: no robot command is sent\nAgentech.recovery_stand(direction=\"back\")",
    status: "development",
    params: [
      p("direction", '"back" | "front" | "left" | "right"', "Planned recovery selector; not currently available for hardware use.", '"back"', "development")
    ]
  },
  {
    name: "set_gait",
    category: "Configuration",
    signature: "Agentech.set_gait(gait_id=x)",
    summary: "Choose one of Navi's installed walking patterns.",
    example: "Agentech.set_gait(gait_id=3)",
    status: "development",
    platformNote: "The SDK enforces the robot-advertised range, but the physical behavior of each gait preset still requires isolated validation.",
    params: [p("gait_id", "int [0, 15]", "Select one of the 16 gait presets installed on this Navi.", undefined, "development")]
  },
  {
    name: "set_foot_height",
    category: "Configuration",
    signature: "Agentech.set_foot_height(height_m=x)",
    summary: "Set Navi's foot lift height in meters.",
    example: "Agentech.set_foot_height(height_m=0.08)",
    status: "development",
    platformNote: "The transport and range guard are implemented; safe useful values across all gaits still require physical validation.",
    params: [p("height_m", "float [0.001, 0.4] meters", "Set how high Navi lifts each foot while walking.", undefined, "development")]
  },
  {
    name: "set_collision_protect",
    category: "Configuration",
    signature: "Agentech.set_collision_protect(enabled=x)",
    summary: "Enable or disable Navi's collision-protection setting.",
    example: "Agentech.set_collision_protect(enabled=True)",
    status: "development",
    platformNote: "The command contract is implemented, but live collision-response behavior has not been deliberately exercised.",
    params: [p("enabled", "bool", "True keeps collision protection enabled; false disables it.", undefined, "development")]
  },
  {
    name: "set_friction",
    category: "Configuration",
    signature: "Agentech.set_friction(friction=x)",
    summary: "Tell Navi how much grip to expect from the floor surface.",
    example: "Agentech.set_friction(friction=0.5)",
    status: "development",
    platformNote: "The full robot-advertised range is guarded in software; surface-specific tuning is not yet physically calibrated.",
    params: [p("friction", "float [0.01, 1.0]", "Use a lower value for slippery floors and a higher value for grippy floors.", undefined, "development")]
  },
  {
    name: "set_jump_distance",
    category: "Configuration",
    signature: "Agentech.set_jump_distance(distance_m=x)",
    summary: "Set how far Navi travels during the next forward jump.",
    example: "Agentech.set_jump_distance(distance_m=0.3)",
    status: "development",
    platformNote: "The setting is published with audited bounds, but distance accuracy and landing behavior remain open-loop and uncalibrated.",
    params: [p("distance_m", "float [0, 1.0] meters", "Forward travel requested by Agentech.jump_forward().", undefined, "development")]
  },
  {
    name: "set_jump_angle",
    category: "Configuration",
    signature: "Agentech.set_jump_angle(angle_rad=x)",
    summary: "Set how far Navi rotates during the next round jump.",
    example: "Agentech.set_jump_angle(angle_rad=0.2)",
    status: "development",
    platformNote: "The command and bounds are implemented, but requested rotation versus observed rotation has not been physically calibrated.",
    params: [p("angle_rad", "float [-3.14, 3.14] radians", "Positive and negative values choose opposite rotation directions for Agentech.jump_round().", undefined, "development")]
  },
  {
    name: "stop",
    category: "Safety",
    signature: "Agentech.stop()",
    summary: "Stop walking or turning while leaving Navi in its current posture.",
    example: "Agentech.stop()",
    verification: "Live verified after every locomotion case through 2.5 rad/s turning",
    params: [naviConnection]
  },
  {
    name: "emergency_stop",
    category: "Safety",
    signature: "Agentech.emergency_stop(reason=x)",
    summary: "Best-effort software zero-velocity stop; this is not Navi's physical hardware e-stop.",
    example: "Agentech.emergency_stop(reason=\"Operator requested stop\")",
    verification: "Zero-velocity implementation tested; hardware e-stop behavior is not claimed",
    params: [p("reason", "str", "Reason recorded in the returned result.", "Agentech emergency stop"), naviConnection]
  },
  {
    name: "get_status",
    category: "Sensing",
    signature: "Agentech.get_status()",
    summary: "Read whether Navi is connected, ready, healthy, and standing.",
    example: "status = Agentech.get_status()",
    verification: "Read-only live verified 2026-07-15",
    params: []
  },
  {
    name: "get_battery_status",
    category: "Sensing",
    signature: "Agentech.get_battery_status()",
    summary: "Read battery percentage, voltage, current, temperature, presence, and supply status.",
    example: "battery = Agentech.get_battery_status()",
    verification: "Read-only live verified 2026-07-15",
    params: [naviConnection]
  },
  {
    name: "body_status",
    category: "Sensing",
    signature: "Agentech.body_status()",
    summary: "Read body position, orientation, linear and angular velocity, and acceleration.",
    example: "body = Agentech.body_status()",
    verification: "Read-only live verified 2026-07-15",
    platformNote: "This controller-fused body-state stream provides roll, pitch, yaw, angular rates, and acceleration for feedback control. It is not a separately exposed raw IMU packet, and body x/y are not dependable global odometry.",
    params: []
  },
  {
    name: "joint_states",
    category: "Sensing",
    signature: "Agentech.joint_states()",
    summary: "Read all 12 joint names, positions, velocities, and efforts.",
    example: "joints = Agentech.joint_states()",
    verification: "Read-only live verified 2026-07-15",
    params: []
  },
  {
    name: "diagnose",
    category: "Sensing",
    signature: "Agentech.diagnose()",
    summary: "Run a read-only connection, status, battery, and health check.",
    example: "report = Agentech.diagnose()",
    verification: "Underlying status and battery reads verified",
    params: []
  }
];

export const naviFunctions: NaviFunction[] = naviFunctionDefinitions.map(completeParameterProfiles);
validateNaviReference(naviFunctions);

export const naviStarterCode = `from agentech import Agentech
Agentech.use("navi")`;

export const naviSafetyLimits = [
  "Angle turns use yaw feedback; timed motion and rate-plus-time turns are limited to 10 seconds",
  "Timed poses and gestures accept any positive finite duration and return to standing",
  "Keep the physical controller stop available",
  "Charge Navi before athletic or dance testing",
  "Backflip is not available on Navi and is blocked"
];
