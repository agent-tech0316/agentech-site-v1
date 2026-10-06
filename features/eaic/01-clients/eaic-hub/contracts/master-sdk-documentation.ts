import type { AgentechFunction, AgentechParam } from "@/features/eaic/02-unified-api/projects-validation/aegis-sdk-reference";
import { masterActionFunctions } from "./master-action-documentation";
import {
  armTargetProfiles, elbowProfiles, headProfiles, jointProfile, masterArmJointKeys,
  selectableElbowProfiles, shakeHeadProfiles, shoulderProfiles, stiffnessProfiles,
  timedProfile, torquePlanningProfiles, upperBodyProfiles, upperBodyWebsiteProfiles, waistProfiles, wristProfiles,
} from "./master-adjustment-profiles";

// Display reference checked against the September 30 handoff and October 1
// Master API at agentech_sdk@4e357d5, with the local per-joint admission update.
// Cards do not enable website execution routes or qualify physical motion.
const param = (name: string, type: string, description: string): AgentechParam => ({
  name, type, description, status: "available",
  ...(/^(?:max_)?duration_seconds$/.test(name) ? { paidOnly: true } : {}),
});
const movementDuration = () => param("duration_seconds", "number", "Optional movement window in seconds. Requested duration is not guaranteed wall-clock completion; measured endpoint verification remains separate.");
const maximumDuration = () => param("max_duration_seconds", "number", "Maximum duration or timeout in seconds. This is not a speed setting.");
const elbowDegrees = () => param("degrees", "number", "Finite nonzero signed relative degrees: positive bends the elbow, negative extends it. Available travel depends on the current pose.");
const elbowDuration = () => param("duration_seconds", "number", "Optional movement window: 0.5–120 seconds, with average rate no greater than 150 degrees/second and pose-dependent available travel. Omission retains the existing timing profile.");
const torqueParam = (joint = "Right and left elbows"): AgentechParam => ({
  ...param("torque", "number | None", joint + ": signed feedforward torque in N·m. Positive assists the requested direction; negative resists it. Omit for default motion control."),
  allowedRange: "-24 to +24 N·m",
});
const axisParam = () => param("axis", 'string ("roll", "pitch", "yaw")', "Select one axis in the axis/degrees form; do not mix this selector with named-axis inputs.");
const relativeAxis = (axis: string) => param(axis, "number | None", "Independent signed relative " + axis + " adjustment in degrees. Use this field in the named-axis form.");
const jointSchema = masterArmJointKeys.join(", ");
const armMapping = (name: string, complete = false): AgentechParam => ({
  ...param(name, "mapping", (complete ? "All seven keys are required" : "Any nonempty subset of these seven keys is accepted") + ": " + jointSchema + ". Each value is an absolute target in SDK degrees within that joint's authorized limits. Explicit 0 requests zero; the current elbow domain excludes zero. " + (complete ? "a missing key is refused" : "omitted joints retain their current commanded target") + "."),
  allowedValues: masterArmJointKeys.map((key) => '"' + key + '"'),
});
const mirroredExampleTargets = '{\n    "shoulder_pitch": -19.45,\n    "shoulder_roll": 16.68,\n    "shoulder_yaw": 6.36,\n    "elbow": 24.91,\n    "wrist_yaw": 0.58,\n    "wrist_pitch": 2.52,\n    "wrist_roll": -0.03\n}';

type MasterPostureFunction = Omit<AgentechFunction, "params"> & {
  title: string;
  configurationNote?: string;
  params: AgentechParam[];
};
const headParams = () => [
  param("posture", 'string ("stand", "sit")', 'Select posture explicitly. The SDK default is "sit"; the seated profiles shown here are inactive / Under Development.'),
  param("operator_holding", "boolean", "Operator support acknowledgement used by the applicable seated contract. It does not bypass readiness checks."),
];

export const masterPostureFunctions: MasterPostureFunction[] = [
  {
    name: "enter_stand_hand_guide", title: "Enter Standing Hand Guidance", category: "Sensing",
    signature: "Agentech.enter_stand_hand_guide(side)",
    summary: "Enables standing Hand Guidance for the selected arms. The current SDK holds their pose for controlled joint adjustments, making it useful for pose setup while Master remains standing.",
    platformNoteLabel: "Hand Guidance in this SDK",
    platformNote: "Physically guided teaching and recording use a separate workflow. This command does not start that workflow.",
    example: '# Enable Hand Guidance for the right arm\nAgentech.enter_stand_hand_guide("right")\n\n# Enable Hand Guidance for both arms\nAgentech.enter_stand_hand_guide("both")',
    profiles: [
      jointProfile("Right arm", 'Agentech.enter_stand_hand_guide("right")', "Enables Hand Guidance for the right arm."),
      jointProfile("Both arms", 'Agentech.enter_stand_hand_guide("both")', "Enables Hand Guidance for both arms."),
    ],
    params: [{ ...param("side", "string", "Selects which arm configuration enters Hand Guidance mode."), allowedValues: ['"right"', '"both"'] }],
  },
  {
    name: "restore_stand_hand_guide", title: "Return Arms and Waist from Hand Guidance", category: "Sensing",
    signature: "Agentech.restore_stand_hand_guide(*, duration_seconds=None)",
    summary: "Returns Master's selected arms and waist together to their reference positions, then releases the active arm hold after the return is verified. Use restore_stand_default() afterward to restore normal standing arm stiffness.",
    configurationNote: "Uses the right arm or both arms selected by enter_stand_hand_guide(side). For a full restore, select both arms and verify both arms plus all three waist axes.",
    example: '# Select both arms for a full arms-and-waist return\nAgentech.enter_stand_hand_guide("both")\nAgentech.restore_stand_hand_guide(duration_seconds=8.0)',
    profiles: [timedProfile("restore_stand_hand_guide", [], "Default return", "Return the selected guidance arms and waist to their references, then release the verified hold.", { paid: false })],
    params: [{ ...movementDuration(), paidOnly: false }],
  },
  {
    name: "restore_stand_default", title: "Restore Normal Standing Arm Stiffness", category: "Sensing",
    signature: "Agentech.restore_stand_default()",
    summary: "Restores Master's normal standing arm stiffness after the arms and waist have returned. It does not return the robot to a reference pose.",
    configurationNote: "Call after restore_stand_hand_guide() completes successfully. The separate owner and default-pose checks still apply. No arm selection is required.",
    platformNoteLabel: "Current SDK limitation",
    platformNote: "A stiffness handoff still requires its own qualification. Retaining commanded targets does not prove that the physical arms stay motionless.",
    example: "# Return the arms and waist first\nAgentech.restore_stand_hand_guide()\n\n# Restore normal standing arm stiffness\nAgentech.restore_stand_default()",
    profiles: [jointProfile("Restore standing stiffness", "Agentech.restore_stand_default()", "Restore stiffness separately from pose return, retaining the SDK's ownership and default-pose checks.")],
    params: [],
  },
  {
    name: "stiff", title: "Current-Hold Arm Stiffness", category: "Sensing", status: "development",
    signature: 'Agentech.stiff(level="hard", *, side="both", duration_seconds=None, operator_ready=False, mechanically_supported=False, preflight=False)',
    summary: "Proposed general-purpose stiffness selection for any valid stationary arm hold: soft, medium or hard, on the left, right or both arms.",
    platformNoteLabel: "Proposed behavior · Under Development",
    platformNote: "These profiles propose retaining the current commanded pose regardless of the preceding action. The current SDK does not accept side or duration_seconds: hard is a guarded golf hold, medium restores default-pose stiffness, and soft returns arms plus waist. Current medium/hard numerical gains are equal. A genuine intermediate profile and the general native transition backend still require implementation and physical qualification. Retained targets do not prove zero physical movement.",
    configurationNote: "Keep pose return separate. The proposed preflight is read-only and checks fresh stationary evidence, compatible owner/boot/targets, healthy telemetry and native balance. Refusal retains the powered command; no automatic retry or pose restore.",
    profiles: stiffnessProfiles(),
    example: '# Proposed API — Under Development\n# Retain the current stationary arm targets while selecting stiffness\nAgentech.stiff(level="hard", side="both", preflight=True)',
    params: [
      { ...param("level", 'string ("soft", "medium", "hard")', "Proposed stiffness level. No stiffness percentages or numerical gains are specified."), allowedValues: ['"soft"', '"medium"', '"hard"'] },
      { ...param("side", 'string ("left", "right", "both")', "Proposed arm selection; the unselected arm and waist keep their current targets and owner."), allowedValues: ['"left"', '"right"', '"both"'] },
      { ...param("duration_seconds", "number | None", "Proposed gain-transition time, not pose-travel time. No new fee is specified."), paidOnly: false },
      param("operator_ready", "boolean", "Proposed explicit operator readiness acknowledgement; does not override telemetry or owner checks."),
      param("mechanically_supported", "boolean", "Proposed explicit mechanical-support acknowledgement; does not bypass admission."),
      param("preflight", "boolean", "Proposed read-only assessment of the current stationary hold. It does not change gains or restore pose."),
    ].map((entry) => ({ ...entry, status: "development" as const })),
  },
  ...["turn_head", "return_head_to_center", "center_head"].map((name): MasterPostureFunction => ({
    name, title: name === "turn_head" ? "Turn Head Yaw" : name === "center_head" ? "Center Head · Alias" : "Return Head to Saved Center", category: "Sensing",
    signature: "Agentech." + name + "(" + (name === "turn_head" ? "angle_degrees, " : "") + '*, posture="sit", operator_holding=False)',
    summary: name === "turn_head" ? "Turn head yaw to the selected angle using the explicit posture contract." : name === "center_head" ? "Compatibility alias for return_head_to_center(); returns head yaw to the saved posture center." : "Return head yaw to the saved center for the selected posture.",
    profiles: headProfiles(name),
    params: [...(name === "turn_head" ? [param("angle_degrees", "number", "Required head yaw target within the official -20 to +20 degree range, subject to the posture contract.")] : []), ...headParams()],
    example: "Agentech." + name + "(" + (name === "turn_head" ? "angle_degrees=5, " : "") + 'posture="stand")',
    platformNoteLabel: "Posture selection", platformNote: "Standing and inactive seated requests have distinct admission rules. Aliases do not create independent motions.",
  })),
  {
    name: "shake_head", title: "Shake Head Yaw", category: "Sensing",
    signature: 'Agentech.shake_head(posture="sit", *, angle_degrees=None, degrees=None, pause_seconds=0.0, cycles=None, repeats=None, operator_holding=False)',
    summary: "Shake head yaw with explicit posture selection, optional amplitude, cycle count and pause.",
    profiles: shakeHeadProfiles(),
    params: [
      ...headParams(),
      param("angle_degrees", "number | None", "Positive sweep amplitude up to 20 degrees. Select either angle_degrees or its degrees alias; never both."),
      param("degrees", "number | None", "Compatibility alias for angle_degrees, not a separate motion."),
      param("cycles", "integer | None", "Cycle count. Select either cycles or its repeats alias; never both. Omission uses one cycle."),
      param("repeats", "integer | None", "Compatibility alias for cycles."),
      param("pause_seconds", "number", "Optional pause between steps; not a general joint movement duration, speed or torque control."),
    ],
    example: 'Agentech.shake_head(posture="stand", angle_degrees=5, cycles=1, pause_seconds=0.5)',
  },
  {
    name: "status", title: "Read Standing and Arm-Control Status", category: "Sensing", signature: "Agentech.status()",
    summary: "Reads Master's current posture, selected arm configuration, and readiness for normal standing actions. Does not move Master.",
    configurationNote: "Use before or after a posture change. standing_state identifies the current mode; guided_sides identifies the selected arms; preset_actions_ready reports readiness for normal actions.",
    example: '# Inspect the current mode, arm selection, and readiness\nstate = Agentech.status()\nprint(state["standing_state"])\nprint(state["guided_sides"])\nprint(state["preset_actions_ready"])',
    profiles: [jointProfile("Standing status", "Agentech.status()", "Read the standing and arm-control state without motion.")], params: [],
  },
  {
    name: "get_status", title: "Read Master Status", category: "Sensing", signature: "Agentech.get_status()",
    summary: "Read Master status through the public get_status compatibility entry point.",
    example: "state = Agentech.get_status()\nprint(state)",
    profiles: [jointProfile("Status alias", "Agentech.get_status()", "Read status without commanding movement.")], params: [],
  },
  {
    name: "action_catalog", title: "Read Preset Action Catalog", category: "Sensing", signature: "Agentech.action_catalog()",
    summary: "Read the preset action catalog; inspect status separately for current controller readiness.",
    example: "catalog = Agentech.action_catalog()\nprint(catalog)",
    profiles: [jointProfile("Action catalog", "Agentech.action_catalog()", "List presets without executing an action.")], params: [],
  },
];

const elbowFunctions: AgentechFunction[] = [
  ...["right", "left"].map((side): AgentechFunction => ({
    name: "adjust_" + side + "_elbow", category: "Joint Adjustments",
    signature: "Agentech.adjust_" + side + "_elbow(degrees, *, duration_seconds=None, torque=None)",
    summary: "Adjust Master's " + side + " elbow by signed relative degrees, with optional torque.",
    example: "Agentech.adjust_" + side + "_elbow(degrees=5, torque=20)",
    profiles: elbowProfiles("adjust_" + side + "_elbow"), params: [elbowDegrees(), elbowDuration(), torqueParam(side === "right" ? "Right elbow" : "Left elbow")],
  })),
  {
    name: "adjust_both_elbows", category: "Joint Adjustments",
    signature: "Agentech.adjust_both_elbows(degrees, *, duration_seconds=None)",
    summary: "Adjust both elbows together by one identical anatomical relative angle.",
    example: 'Agentech.adjust_both_elbows(degrees=5, torque={"left": 20, "right": 20})',
    profiles: [timedProfile("adjust_both_elbows", ["degrees=delta"], "Both elbows relative angle", "Adjust both elbows by the same signed relative degrees.")],
    params: [elbowDegrees(), elbowDuration()],
  },
  {
    name: "adjust_elbow", category: "Joint Adjustments",
    signature: 'Agentech.adjust_elbow(side="right", degrees=None, *, position=None, speed=None, torque=None, duration_seconds=None)',
    summary: "Select either elbow, one relative-angle selector, and optional timing and feedforward torque.",
    example: 'Agentech.adjust_elbow(side="right", degrees=5, torque=20)\n\n# position is relative degrees; speed is average degrees/second\nAgentech.adjust_elbow(side="left", position=5, speed=5, torque=-20)',
    profiles: selectableElbowProfiles(),
    params: [
      param("side", 'string ("left", "right")', 'Select one elbow. Omission defaults to "right".'),
      { ...elbowDegrees(), description: "Signed relative degrees. Exactly one of degrees or position is required; both signs select direction." },
      param("position", "number | None", "Equivalent signed RELATIVE degrees selector, not an absolute target. Supply position or degrees, never both."),
      param("speed", "number | None", "Positive average degrees/second; derives duration = abs(degrees) / speed. speed and duration_seconds are alternatives. Omitted speed retains the existing timing profile, whose peak rate is not an average-speed default."),
      torqueParam(), elbowDuration(),
    ],
  },
  {
    name: "move_elbows_to", category: "Joint Adjustments", signature: "Agentech.move_elbows_to(degrees, *, duration_seconds=8.0)",
    summary: "Move both elbows to one absolute bend target in SDK degrees.", example: "Agentech.move_elbows_to(degrees=50, duration_seconds=8.0)",
    profiles: [timedProfile("move_elbows_to", ["degrees=target"], "Both elbows absolute target", "Move both elbows to an absolute bend target in degrees.")],
    params: [param("degrees", "number", "Absolute bend target for both elbows in SDK degrees, within the authorized elbow limits. The current elbow domain excludes zero."), movementDuration()],
  },
];

const shoulderFunctions: AgentechFunction[] = ["right", "left"].map((side) => ({
  name: "adjust_" + side + "_shoulder", category: "Joint Adjustments",
  signature: "Agentech.adjust_" + side + "_shoulder(axis, degrees, *, duration_seconds=None)",
  summary: "Adjust Master's " + side + " shoulder on one pitch, roll or yaw axis per call.",
  example: "Agentech.adjust_" + side + '_shoulder(axis="pitch", degrees=5, torque=20)',
  profiles: shoulderProfiles(side), params: [axisParam(), param("degrees", "number", "Finite nonzero signed relative degrees on the selected shoulder axis."), movementDuration()],
}));

const wristFunctions: AgentechFunction[] = ["adjust_right_wrist", "adjust_left_wrist", "adjust_wrist"].map((name) => ({
  name, category: "Joint Adjustments",
  signature: "Agentech." + name + "(axis=None, degrees=None, *, roll=None, pitch=None, yaw=None)",
  summary: name === "adjust_wrist" ? "Right-wrist compatibility alias for adjust_right_wrist(). Use the explicit left/right functions to select a side." : "Adjust Master's " + (name.includes("left") ? "left" : "right") + " wrist on one or more axes using independent signed angles.",
  example: "Agentech." + name + '(\n    roll=5, pitch=-3, yaw=2,\n    torque={"roll": 1, "pitch": 1, "yaw": 20}\n)',
  profiles: wristProfiles(name),
  params: [axisParam(), param("degrees", "number | None", "Finite nonzero relative angle for axis/degrees. A single numeric positional value applies the same angle change to all three axes; choose either this form or named axes."), ...["roll", "pitch", "yaw"].map((axis) => ({ ...relativeAxis(axis), description: "Independent finite, nonzero signed " + axis + " degrees in the named-axis form. Wrist calls have no duration, speed, torque or side argument." }))],
}));

const waistFunctions: AgentechFunction[] = [
  {
    name: "adjust_waist", category: "Joint Adjustments",
    signature: "Agentech.adjust_waist(axis=None, degrees=None, *, yaw=None, pitch=None, roll=None, max_duration_seconds=8.0, expected_start_degrees=None)",
    summary: "Adjust any nonempty selection of waist yaw, pitch and roll with optional checked starting pose.",
    example: "Agentech.adjust_waist(yaw=5, pitch=-3, max_duration_seconds=8.0)", profiles: waistProfiles(),
    params: [axisParam(), param("degrees", "number", "Relative degrees for the axis/degrees form. Available travel depends on the calibrated axis limits and fresh native headroom."), ...["yaw", "pitch", "roll"].map(relativeAxis), maximumDuration(), param("expected_start_degrees", "mapping | None", 'Engineering start check: keys must exactly match the selected NONZERO axes ("yaw", "pitch", "roll") and match the fresh measured start within each axis tolerance. The current dry-run does not validate this field.')],
    platformNoteLabel: "Waist input rules", platformNote: "Zero axes are filtered; all-zero requests are refused. Choose named axes or axis/degrees. There is no single-number-all-axes, speed or torque form.",
  },
  {
    name: "return_waist_to_neutral", category: "Joint Adjustments", signature: "Agentech.return_waist_to_neutral(*, max_duration_seconds=8.0)",
    summary: "Return the waist through its saved standing-neutral reference.", example: "Agentech.return_waist_to_neutral(max_duration_seconds=8.0)",
    profiles: [timedProfile("return_waist_to_neutral", [], "Return to saved neutral", "Return the waist through its saved standing-neutral reference.", { maximum: true })], params: [maximumDuration()],
  },
  {
    name: "undo_waist", category: "Joint Adjustments", signature: "Agentech.undo_waist(movement, *, max_duration_seconds=8.0)",
    summary: "Undo a verified waist adjustment using its bound movement result and endpoint checks.",
    example: "# Keep the actual verified result; an arbitrary degree dictionary is not valid\nmovement = Agentech.adjust_waist(yaw=5)\nAgentech.undo_waist(movement, max_duration_seconds=8.0)",
    profiles: [timedProfile("undo_waist", ["movement"], "Verified movement result", "Undo the verified movement with its original start-state, session binding and endpoint checks.", { maximum: true })],
    params: [param("movement", "mapping", "The verified, session-bound result required by the undo contract from adjust_waist(). Do not substitute an arbitrary degrees dictionary or an unverified plan."), maximumDuration()],
  },
];

const upperBodyFunctions: AgentechFunction[] = [
  {
    name: "adjust_upper_body", category: "Joint Adjustments",
    signature: "Agentech.adjust_upper_body(*, waist=None, right_arm=None, left_arm=None, both_elbows=None, duration_seconds=None)",
    summary: "Plan relative upper-body maps, or use the existing waist-plus-both-elbows live request family.",
    example: 'Agentech.adjust_upper_body(\n    waist={"yaw": 5},\n    right_arm={"shoulder_pitch": 5},\n    left_arm={"wrist_yaw": 5},\n    torque={"right_arm": {"shoulder_pitch": 20}, "left_arm": {"wrist_yaw": 20}}\n)', profiles: upperBodyProfiles(),
    platformNoteLabel: "Plan and live request families", platformNote: "General waist/right-arm/left-arm mappings are plan only. Only explicit waist plus both_elbows has the current live route; equivalent elbow dictionaries do not select it. both_elbows cannot be combined with right_arm or left_arm, even an empty map. Filter zero values and require a nonzero overall request.",
    params: [
      param("waist", "mapping | None", 'Relative signed degrees using any nonempty subset of "yaw", "pitch", "roll". General mapping plans filter zero axes.'),
      param("right_arm", "mapping | None", "Relative right-arm degrees using any nonempty subset of " + jointSchema + ". Without torque this returns a position-only plan; nonzero arm torque selects the current owner-admitted arm route. Cannot be combined with both_elbows."),
      param("left_arm", "mapping | None", "Relative left-arm degrees using any nonempty subset of " + jointSchema + ". Without torque this returns a position-only plan; nonzero arm torque selects the current owner-admitted arm route. Cannot be combined with both_elbows."),
      param("both_elbows", "number | None", "One identical relative anatomical angle for both elbows. Only explicit waist plus both_elbows selects the current live coordinated route."),
      { ...movementDuration(), description: "Accepted for explicit waist plus both_elbows or the torque-bearing arm route. Position-only general map plans and both_elbows without waist do not accept duration_seconds." },
    ],
  },
  {
    name: "move_arms_to", category: "Joint Adjustments", signature: "Agentech.move_arms_to(*, left=None, right=None, duration_seconds=8.0)",
    summary: "Move any supported selection of joints in either or both arms to absolute targets.",
    platformNoteLabel: "0 is a position", platformNote: "Omitted joints keep their current commanded positions. Set a joint to 0 explicitly to request zero degrees within that joint's authorized limits; the current elbow domain excludes zero. Any nonempty subset of the seven keys per arm is supported; the partial profiles represent the full selection space.",
    example: 'Agentech.move_arms_to(right={"elbow": 25}, left={"wrist_yaw": 0}, duration_seconds=8.0)',
    profiles: armTargetProfiles(), params: [armMapping("left"), armMapping("right"), movementDuration()],
  },
  {
    name: "mirror_arm_pose", category: "Joint Adjustments", signature: 'Agentech.mirror_arm_pose(source_side="right", *, duration_seconds=20.0)',
    summary: "Snapshot the source arm pose and move the opposite arm to its mirrored pose.",
    example: 'Agentech.mirror_arm_pose(source_side="right", duration_seconds=20.0)',
    profiles: ["right", "left"].map((side) => timedProfile("mirror_arm_pose", ['source_side="' + side + '"'], "Mirror from " + side, "Snapshot one source pose and move the opposite arm; this is not continuous following or replay.")),
    params: [param("source_side", 'string ("left", "right")', 'Select the source arm. Omission defaults to "right".'), movementDuration()],
  },
  {
    name: "move_mirrored_arms_to", category: "Joint Adjustments", signature: "Agentech.move_mirrored_arms_to(targets, *, duration_seconds=20.0)",
    summary: "Derive and move both arms to a mirrored pose from a complete seven-joint target map.",
    platformNoteLabel: "0 is a position", platformNote: "All seven joint targets are required. A missing joint causes an error. Explicit zero remains subject to each joint's authorized limits; the current elbow domain excludes zero. Use move_arms_to() for partial joint targets. The SDK derives the mirrored bilateral pose rather than copying identical encoder values.",
    example: "targets = " + mirroredExampleTargets + "\nAgentech.move_mirrored_arms_to(targets, duration_seconds=20.0)",
    profiles: [timedProfile("move_mirrored_arms_to", ["targets"], "Complete mirrored seven-joint target", "Provide every required joint key, including explicit zero targets where intended.", { syntaxKind: "parameter-map" })],
    params: [armMapping("targets", true), movementDuration()],
  },
];

const torquePlanningFunction: AgentechFunction = {
  name: "plan_upper_body_torque_assist", category: "Joint Adjustments",
  signature: "Agentech.plan_upper_body_torque_assist(*, arm_effort_nm=None, waist_effort_nm=None, max_additional_effort_nm, duration_seconds, ramp_seconds, limit_source)",
  summary: "Plan signed torque for any selection of the fourteen arm joints and three waist axes, with independent per-joint limits.",
  platformNoteLabel: "All-joint torque · offline planning",
  platformNote: "Plans signed torque for all seventeen arm and waist joints without commanding the robot. Signed ±20 N·m requests were checked offline for thirteen joints. Wrist pitch/roll use ±4.8 N·m model limits. Supply a limit for each selected joint.",
  example: '# Offline plan: 20 N·m on the left elbow\n# The model reference is 24 N·m; this does not authorize live execution\nplan = Agentech.plan_upper_body_torque_assist(\n    arm_effort_nm={"left_elbow_joint": 20},\n    max_additional_effort_nm={"left_elbow_joint": 24},\n    duration_seconds=2.0,\n    ramp_seconds=0.5,\n    limit_source="captured native model reference, 2026-09-17"\n)\nprint(plan)',
  profiles: torquePlanningProfiles(),
  params: [
    param("arm_effort_nm", "mapping | None", 'Signed native-joint added effort in N·m for any nonempty selection of the fourteen arm joints. Keys use the full joint names, including side and "_joint", shown in the profiles and torque table. Omit this map for waist-only planning.'),
    param("waist_effort_nm", "mapping | None", 'Signed native-joint added effort in N·m using any nonempty selection of "waist_yaw_joint", "waist_pitch_joint", "waist_roll_joint". Omit this map for arm-only planning.'),
    param("max_additional_effort_nm", "mapping", "Positive per-joint bounds in N·m. Keys must exactly match the selected effort joints, and each requested magnitude must fit its supplied bound. The planner does not authenticate these bounds or turn model limits into live permission."),
    { ...param("duration_seconds", "number", "Positive total planned effort duration in seconds, including ramp-in and ramp-out. This is offline planning."), paidOnly: false },
    param("ramp_seconds", "number", "Positive ramp time in seconds, no greater than half duration_seconds. The modeled added effort is zero at both endpoints."),
    param("limit_source", "string", "Required nonempty description of the supplied bounds' source. This records provenance; it does not authenticate the bounds."),
  ],
};

const masterReferenceFunctions: AgentechFunction[] = [
  ...masterPostureFunctions, ...elbowFunctions, ...shoulderFunctions, ...wristFunctions,
  ...waistFunctions, ...upperBodyFunctions, torquePlanningFunction, ...masterActionFunctions,
];
const masterCurrentStiffnessFunction: MasterPostureFunction = {
  name: "stiff", title: "Arm Stiffness", category: "Sensing",
  signature: 'Agentech.stiff(level="hard")',
  summary: "Choose an arm stiffness profile and see how strongly it resists displacement from its target pose.",
  platformNoteLabel: "Current stiffness behavior",
  platformNote: "Stiffness describes resistance to displacement from a target pose. The current SDK routes have different pose requirements: Hard uses the verified golf hold, Medium requires the default pose, and Soft returns both arms and waist to their references. Stiffness values below are in N·m/rad; higher values give stronger resistance to displacement.",
  profiles: [
    jointProfile("Hard", 'Agentech.stiff(level="hard")', "Firm arm stiffness: shoulder pitch/roll 100, shoulder yaw/elbow 50, and wrists 30 N·m/rad. This is the strongest currently configured arm profile."),
    jointProfile("Medium", 'Agentech.stiff(level="medium")', "Normal standing stiffness. Uses the same stiffness values as Hard in the current SDK; it is not an intermediate-strength profile. Requires the default pose."),
    jointProfile("Soft", 'Agentech.stiff(level="soft")', "Compliant powered arm stiffness: 12 N·m/rad on every arm joint. It gives lower resistance to displacement. The current SDK also returns both arms and waist to their reference positions."),
  ],
  example: 'Agentech.stiff(level="hard")\n\nAgentech.stiff(level="medium")\n\nAgentech.stiff(level="soft")',
  params: [
    { ...param("level", 'string ("soft", "medium", "hard")', "Choose the stiffness profile described above. Omission defaults to hard; firm is a compatibility alias. Each profile's current pose behavior is shown explicitly."), allowedValues: ['"soft"', '"medium"', '"hard"'] },
  ],
};

// Match the existing Navi/Aegis display convention. Keep the audited request
// inputs in the catalog, then substitute independent x values for presentation.
// Preserve quoted mapping keys, fixed selectors, keywords and boolean literals.
export function masterProfileDisplaySyntax(syntax: string): string {
  return syntax.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b[A-Za-z_][A-Za-z_0-9]*\b/g, (token, offset) => {
    if (/^["']/.test(token) || /^(?:Agentech|True|False|None)$/.test(token)) return token;
    const before = syntax.slice(0, offset).trimEnd();
    const after = syntax.slice(offset + token.length).trimStart();
    if (before.endsWith(".") || after.startsWith("=")) return token;
    return "x";
  });
}

// Public display keeps existing implemented functions and physical-verification
// records. Proposed stiffness, general plan-only groups and inactive seated
// profiles remain in the internal handoff catalog and readiness note. Standing
// head profiles are also withheld: the actual SDK rejects their live controller.
const unavailableStandingHeadFunctions = new Set(["turn_head", "return_head_to_center", "center_head", "shake_head"]);
const mappedTorqueAdjustments = new Set([
  "adjust_both_elbows", "adjust_left_shoulder", "adjust_right_shoulder",
  "adjust_left_wrist", "adjust_right_wrist", "adjust_wrist", "adjust_waist", "adjust_upper_body",
]);

// The current SDK accepts these torque fields. Keep historical position-only
// draft profiles separate, and retain copyable examples that omit optional effort.
function withAdjustmentTorque(item: AgentechFunction): AgentechFunction {
  if (["adjust_left_elbow", "adjust_right_elbow", "adjust_elbow"].includes(item.name)) {
    return item;
  }
  if (!mappedTorqueAdjustments.has(item.name)) return item;
  const addTorque = (syntax: string): string => {
    if (item.name === "adjust_waist") return syntax;
    const singleAxis = syntax.match(/axis="(roll|pitch|yaw)"/)?.[1];
    const axes = singleAxis ? [singleAxis] : [...new Set([
      ...syntax.matchAll(/\b(roll|pitch|yaw)=/g),
      ...(item.name === "adjust_upper_body" ? syntax.matchAll(/"(roll|pitch|yaw)":/g) : []),
    ].map((match) => match[1]))];
    const axisMap = (selected: string[]) => "{" + selected.map((axis) => '"' + axis + '": ' + axis + "_torque").join(", ") + "}";
    let value = "torque";
    if (item.name === "adjust_both_elbows") value = '{"left": left_torque, "right": right_torque}';
    else if (item.name === "adjust_upper_body") value = '{"left_arm": {"elbow": left_torque}, "right_arm": {"elbow": right_torque}}';
    else if (item.name.includes("wrist") || item.name === "adjust_waist") {
      if (axes.length !== 1) value = axisMap(axes.length ? axes : ["roll", "pitch", "yaw"]);
    }
    const multiline = syntax.includes("\n");
    return syntax.slice(0, syntax.lastIndexOf(")")).trimEnd() + (multiline ? ",\n    " : ", ") + "torque=" + value + (multiline ? "\n)" : ")");
  };
  const torqueDescription = item.name === "adjust_upper_body"
    ? 'Signed feedforward torque in N·m. Use a scalar or left_arm/right_arm maps for the selected arm joints. Nonzero waist torque has no live receiver.'
    : item.name === "adjust_waist"
      ? 'Live waist movement uses position control. Nonzero additional torque has no live receiver; omit this optional field when running.'
      : item.name.includes("wrist")
        ? 'Signed feedforward torque in N·m. Use a scalar or separate axis values. Positive assists the requested direction; negative resists it.'
        : item.name === "adjust_both_elbows"
          ? 'Signed feedforward torque in N·m. Use one scalar or separate "left" and "right" values. Positive assists the requested direction; negative resists it.'
          : 'Signed feedforward torque in N·m for the selected shoulder axis. Positive assists the requested direction; negative resists it.';
  const torqueRange = item.name.includes("wrist")
    ? "Yaw: -24 to +24; pitch/roll: -2.2 to +2.2 N·m"
    : item.name === "adjust_waist"
      ? "-24 to +24 N·m (planning only)"
      : item.name === "adjust_upper_body"
        ? "Shoulder, elbow, wrist yaw: -24 to +24 N·m; Wrist pitch/roll: -2.2 to +2.2 N·m"
        : item.name === "adjust_both_elbows" ? "-24 to +24 N·m per elbow"
        : "-24 to +24 N·m";
  return {
    ...item,
    signature: item.signature.replace(/\)$/, ", torque=None)"),
    params: [...item.params.map((entry) => item.name.includes("wrist") && ["roll", "pitch", "yaw"].includes(entry.name)
      ? { ...entry, description: "Independent signed relative " + entry.name + " angle in degrees." } : entry), {
      ...param("torque", item.name.includes("shoulder") ? "number | None" : "number | mapping | None", torqueDescription),
      allowedRange: torqueRange,
    }],
    platformNote: item.name === "adjust_waist"
      ? item.platformNote?.replace("speed or torque form", "speed form") + " Nonzero torque has no live receiver."
      : item.name === "adjust_upper_body"
        ? "Position-only general maps return plans; explicit waist plus both_elbows selects the coordinated position route. Torque selects the full-arm request and requires the active owner's per-joint admission. Nonzero waist torque has no live receiver. both_elbows cannot be combined with arm motion maps; torque uses left_arm/right_arm elbow maps. Zero values are filtered."
        : item.platformNote,
    profiles: item.profiles?.map((profile) => profile.status === "development" ? profile : ({
      ...profile, syntax: addTorque(profile.syntax),
      customDurationSyntax: profile.customDurationSyntax ? addTorque(profile.customDurationSyntax) : undefined,
      description: item.name === "adjust_waist" ? profile.description : "Angles are degrees; torque is N·m. Each value is independent.",
      customDurationDescription: profile.customDurationSyntax ? item.name === "adjust_waist" ? "max_duration_seconds is a timeout, not a speed setting." : "Use the selected duration; torque remains independent." : undefined,
    })),
  };
}
const relativeAdjustmentAngleFields = new Set([
  "degrees", "position", "roll", "pitch", "yaw", "waist", "right_arm", "left_arm", "both_elbows",
]);
// Public SDK command coordinates at 4e357d5, including the existing elbow/J7
// margins. Manufacturer/raw encoder tables use different signs and domains.
const armAngleBounds: Readonly<Record<string, readonly [number, number]>> = {
  shoulder_pitch: [-176.471, 116.883],
  shoulder_roll: [-0.061 * 180 / Math.PI, 2.993 * 180 / Math.PI],
  shoulder_yaw: [-146.448, 146.448], elbow: [3, 131.965],
  wrist_yaw: [-146.448, 146.448], wrist_pitch: [-31.971, 31.971],
  wrist_roll: [-33.482, 82.012],
};
// Waist bounds use the calibrated native offset, not the measured body angle.
const waistAngleBounds: Readonly<Record<string, readonly [number, number, number | null]>> = {
  yaw: [-3.43 * 180 / Math.PI, 2.382 * 180 / Math.PI, null],
  pitch: [-0.314 * 180 / Math.PI, 0.314 * 180 / Math.PI, 30],
  roll: [-0.488 * 180 / Math.PI, 0.488 * 180 / Math.PI, 15],
};
type RelativeAngleBound = { axis: string; minimum: number; maximum: number; waist: boolean; perCallLimit?: number | null };
const angleNumber = (value: number) => String(Number(value.toFixed(3)));
function adjustmentAngleBounds(name: string, field: string): RelativeAngleBound[] {
  const waist = name === "adjust_waist" || field === "waist";
  const axes = waist ? ["yaw", "pitch", "roll"] : name.includes("elbow") || field === "both_elbows" ? ["elbow"]
    : name.includes("shoulder") ? ["shoulder_pitch", "shoulder_roll", "shoulder_yaw"]
      : name.includes("wrist") ? ["wrist_roll", "wrist_pitch", "wrist_yaw"] : [...masterArmJointKeys];
  return axes.filter((axis) => !["roll", "pitch", "yaw"].includes(field) || axis === field || axis.endsWith("_" + field))
    .map((axis) => {
      const [minimum, maximum, perCallLimit] = waist ? waistAngleBounds[axis] : armAngleBounds[axis];
      return { axis, minimum, maximum, waist, perCallLimit };
    });
}
function numericAdjustmentRange(bounds: RelativeAngleBound[]): string {
  return bounds.map(({ axis, minimum, maximum, perCallLimit }) => {
    const lower = angleNumber(minimum) + " − current";
    const upper = angleNumber(maximum) + " − current";
    const label = (bounds.length === 3 ? axis.replace(/^(?:shoulder|wrist)_/, "") : axis).replaceAll("_", " ");
    return (bounds.length > 1 ? label[0].toUpperCase() + label.slice(1) + ": " : "")
      + (perCallLimit ? "max(-" + perCallLimit + ", " + lower + ")° to min(" + perCallLimit + ", " + upper + ")°"
        : "(" + lower + ")° to (" + upper + ")°");
  }).join("; ");
}
function numericRangeExample(bounds: RelativeAngleBound[]): string {
  const first = bounds[0];
  const start = first.axis === "elbow" ? 45 : first.waist && first.axis === "roll" ? 20 : 0;
  const next = start + (first.axis === "elbow" ? 20 : 5);
  const remaining = (position: number) => angleNumber(Math.max(first.minimum - position, -(first.perCallLimit ?? Infinity)))
    + "° to " + angleNumber(Math.min(first.maximum - position, first.perCallLimit ?? Infinity)) + "°";
  return " current is " + (first.waist ? "the calibrated waist position" : "each selected joint's current SDK angle")
    + " in degrees. Example" + (bounds.length > 1 ? " for " + first.axis.replaceAll("_", " ") : "")
    + ": at " + start + "°, the remaining range is " + remaining(start)
    + "; at " + next + "°, it is " + remaining(next) + "."
    + (first.waist ? " Waist ranges are approximate; the SDK rounds requests to calibrated steps." : " The SDK checks measured and commanded headroom before each move.");
}
function withRelativeAdjustmentLimits(item: AgentechFunction): AgentechFunction {
  if (!item.name.startsWith("adjust_") || item.category !== "Joint Adjustments") return item;
  return {
    ...item,
    params: item.params.map((entry) => {
      if (!relativeAdjustmentAngleFields.has(entry.name)) return entry;
      const bounds = adjustmentAngleBounds(item.name, entry.name);
      return {
        ...entry, allowedRange: numericAdjustmentRange(bounds),
        description: entry.description + numericRangeExample(bounds)
          + (entry.name === "both_elbows" || item.name === "adjust_both_elbows" || item.name.includes("wrist") && entry.name === "degrees"
            ? " A shared angle must fit every selected joint." : ""),
      };
    }),
  };
}
export const masterDocumentationFunctions: AgentechFunction[] = masterReferenceFunctions.map(withAdjustmentTorque).map(withRelativeAdjustmentLimits);
// Published Master SDK signatures checked at origin/main 8594975 on 2026-10-05.
// Keep these coordinated movements separate from the vendor preset actions.
export const masterCustomMovementFunctions: AgentechFunction[] = [
  {
    name: "golf_put", category: "Custom Movements",
    signature: "Agentech.golf_put(*, operator_ready=False, mechanically_supported=False, arm_duration_seconds=20.0, waist_max_duration_seconds=50.0)",
    summary: "Move both arms and waist into the saved golf setup and establish its hard hold.",
    platformNote: "Requires standing control, a ready operator, and mechanical support confirmed for the current setup.",
    example: "Agentech.golf_put(operator_ready=True, mechanically_supported=True)",
    params: [
      param("operator_ready", "bool", "Confirm the operator is ready before starting the live golf setup."),
      param("mechanically_supported", "bool", "Confirm mechanical support is present for the current setup."),
      param("arm_duration_seconds", "number", "Optional arm movement duration in seconds. Omission uses 20 seconds."),
      param("waist_max_duration_seconds", "number", "Optional maximum waist duration in seconds. Omission uses 50 seconds; this is a timeout, not movement speed."),
    ],
    profiles: [
      jointProfile("Golf / default timing", "Agentech.golf_put(\n    operator_ready=True,\n    mechanically_supported=True\n)", "Use the saved golf pose with the SDK's default timing."),
      jointProfile("Golf / custom timing", "Agentech.golf_put(\n    operator_ready=True,\n    mechanically_supported=True,\n    arm_duration_seconds=duration,\n    waist_max_duration_seconds=max_duration\n)", "Choose the arm duration and maximum waist duration independently, in seconds."),
    ],
  },
  {
    name: "close_door", category: "Custom Movements",
    signature: "Agentech.close_door(side, *, arm_duration_seconds=None, waist_max_duration_seconds=None)",
    summary: "Close a door using the selected arm and a coordinated waist turn.",
    example: 'Agentech.close_door("right")\nAgentech.close_door("left")',
    params: [
      { ...param("side", "string", "Choose the arm. Right uses the right arm and a left waist turn; Left mirrors that movement."), allowedValues: ['"right"', '"left"'] },
      param("arm_duration_seconds", "number", "Optional arm movement duration in seconds. Omission retains the door movement's timing profile."),
      param("waist_max_duration_seconds", "number", "Optional maximum waist duration in seconds. This is a timeout, not movement speed; omission retains the door movement's timing profile."),
    ],
    profiles: ["right", "left"].flatMap((side) => [
      jointProfile(`${side === "right" ? "Right" : "Left"} / default timing`, `Agentech.close_door("${side}")`, "Use the selected side with the door movement's default timing."),
      jointProfile(`${side === "right" ? "Right" : "Left"} / custom timing`, `Agentech.close_door(\n    side="${side}",\n    arm_duration_seconds=duration,\n    waist_max_duration_seconds=max_duration\n)`, "Choose the arm duration and maximum waist duration independently, in seconds."),
    ]),
  },
];
export const masterWebsiteFunctions: AgentechFunction[] = masterDocumentationFunctions
  .filter((item) => !unavailableStandingHeadFunctions.has(item.name) && (item.status !== "development" || item.name === "stiff"))
  .map((item) => ({
    ...(item.name === "stiff" ? masterCurrentStiffnessFunction : item),
    profiles: item.name === "stiff" ? masterCurrentStiffnessFunction.profiles : item.profiles?.filter((entry) => entry.status !== "development"),
    ...(item.name === "adjust_upper_body" ? {
      summary: "Adjust selected joints across both arms and waist.",
      profiles: upperBodyWebsiteProfiles(),
      platformNoteLabel: "Choosing joints",
      platformNote: "Any subset of arm joints and waist axes is supported. Arm-mapping movement requires nonzero arm torque; without it, general maps return a plan. Waist + both_elbows also supports position-only movement. Nonzero waist torque has no live receiver. Do not combine both_elbows with arm motion maps.",
    } : {}),
  })).map<AgentechFunction>((item) => ({
    ...item,
    params: item.params.map((entry) => ({ ...entry, type: entry.type.replace(/\s*\|\s*None\b/g, "") })),
  })).concat(masterCustomMovementFunctions);

export const masterWebsitePostureFunctions = masterWebsiteFunctions
  .filter((item) => item.category === "Sensing") as MasterPostureFunction[];

export const masterDocumentationStarterCode = 'from agentech import Agentech\nAgentech.use("master")';
export const masterSetupParams: AgentechParam[] = [];

// Exact max_effort entries from Master's native MC model captured 2026-09-17.
// Source hash 614b0644976204e4f458f2c3a9d6f92f9a463730ddcaec5bc1cbdd9748727670.
// Keep model maxima separate from additional SDK command-effort allowances.
export const masterNativeModelEffort: Readonly<Record<string, number>> = {
  "waist_yaw_joint": 120,
  "waist_pitch_joint": 48,
  "waist_roll_joint": 48,
  "head_yaw_joint": 2.6,
  "head_pitch_joint": 0.6,
  "left_shoulder_pitch_joint": 36,
  "left_shoulder_roll_joint": 36,
  "left_shoulder_yaw_joint": 24,
  "left_elbow_joint": 24,
  "left_wrist_yaw_joint": 24,
  "left_wrist_pitch_joint": 4.8,
  "left_wrist_roll_joint": 4.8,
  "right_shoulder_pitch_joint": 36,
  "right_shoulder_roll_joint": 36,
  "right_shoulder_yaw_joint": 24,
  "right_elbow_joint": 24,
  "right_wrist_yaw_joint": 24,
  "right_wrist_pitch_joint": 4.8,
  "right_wrist_roll_joint": 4.8
};

export const masterJointGroupStarts: Partial<Record<string, string>> = {
  adjust_right_elbow: "Elbows", adjust_right_shoulder: "Shoulders", adjust_right_wrist: "Wrists",
  adjust_waist: "Waist", adjust_upper_body: "Upper Body",
  plan_upper_body_torque_assist: "Torque Planning",
};
