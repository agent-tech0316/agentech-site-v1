import type { AgentechFunction } from "@/features/eaic/02-unified-api/projects-validation/aegis-sdk-reference";

type Profile = NonNullable<AgentechFunction["profiles"]>[number];
export const masterArmJointKeys = [
  "shoulder_pitch", "shoulder_roll", "shoulder_yaw", "elbow", "wrist_yaw", "wrist_pitch", "wrist_roll",
] as const;
const axisSubsets = [
  ["roll"], ["pitch"], ["yaw"], ["roll", "pitch"], ["roll", "yaw"], ["pitch", "yaw"], ["roll", "pitch", "yaw"],
];
const title = (value: string) => value[0].toUpperCase() + value.slice(1).replaceAll("_", " ");
const axesTitle = (axes: string[]) => axes.map(title).join(" + ");
const call = (name: string, args: string[]) => {
  const compact = `Agentech.${name}(${args.join(", ")})`;
  return args.length <= 1 && compact.length <= 76 && !compact.includes("\n")
    ? compact
    : `Agentech.${name}(\n${args.map((arg) => `    ${arg.replaceAll("\n", "\n    ")}`).join(",\n")}\n)`;
};
const axisArgs = (axes: string[]) => axes.map((axis) => `${axis}=${axis}_delta`);
const mapping = (keys: readonly string[], value: (key: string) => string) => {
  const entries = keys.map((key) => `"${key}": ${value(key)}`);
  return keys.length <= 2 ? `{${entries.join(", ")}}` : `{\n    ${entries.join(",\n    ")}\n}`;
};

// Valid Python structures using named operator inputs. Numeric, copyable examples
// are defined independently on each function card. These are request families,
// not newly qualified motions or numerical presets.
export function jointProfile(name: string, syntax: string, description: string): Profile {
  return { name, syntax, description };
}

export function timedProfile(
  name: string,
  args: string[],
  label: string,
  description: string,
  options: { maximum?: boolean; paid?: boolean; transition?: boolean; status?: Profile["status"]; syntaxKind?: Profile["syntaxKind"] } = {},
): Profile {
  const key = options.maximum ? "max_duration_seconds" : "duration_seconds";
  const value = options.maximum ? "max_duration" : "duration";
  return {
    ...jointProfile(label, call(name, args), `${description} ${options.maximum ? "Uses the default maximum duration." : "Uses the SDK's default timing."}`),
    customDurationSyntax: call(name, [...args, `${key}=${value}`]),
    customDurationLabel: options.maximum ? "Custom maximum duration" : options.transition ? "Custom gain-transition duration" : "Custom duration",
    customDurationDescription: options.maximum
      ? `${description} max_duration_seconds is a maximum duration or timeout, not a speed setting.`
      : options.transition
        ? `${description} duration_seconds is the proposed gain-transition time, not pose-travel time.`
        : `${description} duration_seconds requests a movement window; measured completion is checked separately.`,
    ...(options.paid === false ? { customDurationPaidOnly: false } : {}),
    ...(options.status ? { status: options.status } : {}),
    ...(options.syntaxKind ? { syntaxKind: options.syntaxKind } : {}),
  };
}

export function elbowProfiles(name: string): Profile[] {
  return [undefined, "torque", "-torque"].map((torque) => timedProfile(
    name,
    ["degrees=delta", ...(torque ? [`torque=${torque}`] : [])],
    `Relative degrees${torque ? torque === "torque" ? " with assisting torque" : " with resisting torque" : ""}`,
    `Adjust the ${name.includes("left") ? "left" : "right"} elbow by signed relative degrees.${torque ? ` ${torque === "torque" ? "Positive" : "Negative"} feedforward torque ${torque === "torque" ? "assists" : "resists"} the requested direction. Choose torque x from 0 to 24 N·m.` : " Torque is omitted."}`,
  ));
}

export function selectableElbowProfiles(): Profile[] {
  return ["right", "left"].flatMap((side) => ["degrees", "position"].flatMap((selector) =>
    ["default", "duration", "speed"].flatMap((timing) => [undefined, "torque", "-torque"].map((torque) => {
      const args = [`side="${side}"`, `${selector}=delta`, ...(timing === "default" ? [] : [timing === "duration" ? "duration_seconds=duration" : "speed=speed"]), ...(torque ? [`torque=${torque}`] : [])];
      return jointProfile(
        `${title(side)} / ${selector} / ${timing === "default" ? "default timing" : timing === "duration" ? "custom duration" : "average speed"} / ${torque ? torque === "torque" ? "assisting torque" : "resisting torque" : "omit torque"}`,
        call("adjust_elbow", args),
        `${selector} is a signed relative angle. ${timing === "speed" ? "speed is positive average degrees/second and derives duration = abs(degrees) / speed; omit duration_seconds." : timing === "duration" ? "Use the specified duration and omit speed." : "Omit speed and duration_seconds to retain the existing timing profile."} ${torque ? `${torque === "torque" ? "Positive" : "Negative"} torque ${torque === "torque" ? "assists" : "resists"} in N·m. Choose torque x from 0 to 24 N·m.` : "Omit unused torque."}`,
      );
    })),
  ));
}

export function shoulderProfiles(side: string): Profile[] {
  return ["pitch", "roll", "yaw"].map((axis) => timedProfile(
    `adjust_${side}_shoulder`, [`axis="${axis}"`, "degrees=delta"], `${title(axis)} axis`,
    `Adjust ${side} shoulder ${axis} by signed relative degrees. Select one axis per call.`,
  ));
}

export function wristProfiles(name: string): Profile[] {
  return [
    ...axisSubsets.map((axes) => jointProfile(`${axesTitle(axes)} named axes`, call(name, axisArgs(axes)), "Each named axis takes its own finite, nonzero signed relative angle in degrees.")),
    ...["roll", "pitch", "yaw"].map((axis) => jointProfile(`${title(axis)} axis and degrees selector`, call(name, [`axis="${axis}"`, "degrees=delta"]), `Select ${axis} alone. The positional form ("${axis}", x) is equivalent; x is relative degrees. Choose either selectors or named-axis inputs.`)),
    jointProfile("Same angle on all three axes", call(name, ["delta"]), "Apply one finite, nonzero signed relative angle to roll, pitch and yaw on this wrist."),
  ];
}

export function torquePlanningProfiles(): Profile[] {
  const left = masterArmJointKeys.map((key) => `left_${key}_joint`);
  const right = masterArmJointKeys.map((key) => `right_${key}_joint`);
  const waist = ["yaw", "pitch", "roll"].map((axis) => `waist_${axis}_joint`);
  const profile = (label: string, arms: string[], waistAxes: string[]): Profile => ({
    ...jointProfile(label, call("plan_upper_body_torque_assist", [
      ...(arms.length ? [`arm_effort_nm=${mapping(arms, () => "torque")}`] : []),
      ...(waistAxes.length ? [`waist_effort_nm=${mapping(waistAxes, () => "torque")}`] : []),
      `max_additional_effort_nm=${mapping([...arms, ...waistAxes], () => "effort_limit")}`,
      "duration_seconds=duration", "ramp_seconds=ramp",
      'limit_source="operator-supplied offline limits"',
    ]), "Offline torque planning. Each selected joint has its own signed effort and positive limit in N·m; limit keys must exactly match the selected joints. Use positive duration and a positive ramp no longer than half that duration. This method returns a plan without commanding the robot."),
    syntaxKind: "parameter-map",
  });
  return [
    ...[...left, ...right].map((joint) => profile(title(joint.replace(/_joint$/, "")), [joint], [])),
    ...waist.map((joint) => profile(title(joint.replace(/_joint$/, "")), [], [joint])),
    profile("All seven left-arm joints", left, []),
    profile("All seven right-arm joints", right, []),
    profile("Both arms · fourteen joints", [...left, ...right], []),
    profile("All three waist axes", [], waist),
    profile("Both arms and waist · seventeen joints", [...left, ...right], waist),
  ];
}

export function waistProfiles(): Profile[] {
  return [
    ...axisSubsets.map((axes) => timedProfile("adjust_waist", axisArgs(axes), `${axesTitle(axes)} named axes`, "Adjust the selected waist axes by independent relative degrees.", { maximum: true })),
    ...["yaw", "pitch", "roll"].map((axis) => timedProfile("adjust_waist", [`axis="${axis}"`, "degrees=delta"], `${title(axis)} selector`, `Adjust waist ${axis} by signed relative degrees.`, { maximum: true })),
    ...axisSubsets.map((axes) => ({
      ...timedProfile("adjust_waist", [...axisArgs(axes), `expected_start_degrees=${mapping(axes, (axis) => `${axis}_start`)}`], `${axesTitle(axes)} with checked starting pose`, "Check the fresh measured start for exactly the selected nonzero axes before the relative adjustment.", { maximum: true }),
      noteLabel: "Engineering start check",
      note: "Live admission checks the selected-axis start tolerances. The current SDK dry-run does not validate expected_start_degrees.",
    })),
  ];
}

export function upperBodyProfiles(): Profile[] {
  const groups = [
    ["waist"], ["right_arm"], ["left_arm"], ["waist", "right_arm"], ["waist", "left_arm"], ["right_arm", "left_arm"], ["waist", "right_arm", "left_arm"],
  ];
  return [
    ...groups.map((selected): Profile => ({
      ...jointProfile(selected.map(title).join(" + "), call("adjust_upper_body", selected.map((group) => `${group}=${group === "waist" ? "waist" : group.startsWith("right") ? "right" : "left"}_deltas`)), "Relative mapping plan only. Each map accepts any nonempty subset of its documented keys; there is no general live arm-map route."),
      syntaxKind: "parameter-map", status: "development",
    })),
    { ...jointProfile("Both elbows without waist", call("adjust_upper_body", ["both_elbows=delta"]), "Plan only. Use adjust_both_elbows() for the separate bilateral elbow API."), status: "development" },
    ...axisSubsets.map((axes) => ({
      ...timedProfile("adjust_upper_body", [`waist=${mapping(axes, (axis) => `${axis}_delta`)}`, "both_elbows=delta"], `Waist ${axes.join(" + ")} plus both elbows`, "The existing live route coordinates the selected waist axes with the same relative angle change on both elbows. Physical qualification and owner admission apply.", { syntaxKind: "parameter-map" }),
    })),
  ];
}

// Four representative structures cover the full mapping contract without
// duplicating every joint selection or default/custom timing permutation.
export function upperBodyWebsiteProfiles(): Profile[] {
  const arm = '{"shoulder_pitch": pitch_delta, "wrist_yaw": yaw_delta}';
  const armTorque = '{"shoulder_pitch": pitch_torque, "wrist_yaw": yaw_torque}';
  return [
    jointProfile("One arm", call("adjust_upper_body", [
      `right_arm=${arm}`, `torque={"right_arm": ${armTorque}}`, "duration_seconds=duration",
    ]), "Use right_arm or left_arm. Each map accepts any subset of arm joints; omitted joints stay in place. Omit duration_seconds for default timing."),
    jointProfile("Both arms", call("adjust_upper_body", [
      'right_arm={"shoulder_pitch": pitch_delta}', 'left_arm={"wrist_yaw": yaw_delta}',
      'torque={"right_arm": {"shoulder_pitch": right_torque}, "left_arm": {"wrist_yaw": left_torque}}', "duration_seconds=duration",
    ]), "Choose joints and Degrees independently for each arm. Omit duration_seconds for default timing."),
    jointProfile("Arms + waist", call("adjust_upper_body", [
      'waist={"yaw": yaw_delta}', 'right_arm={"shoulder_pitch": pitch_delta}', 'left_arm={"wrist_yaw": yaw_delta}',
      'torque={"right_arm": {"shoulder_pitch": right_torque}, "left_arm": {"wrist_yaw": left_torque}}', "duration_seconds=duration",
    ]), "Combine either or both arms with any selected waist axes. Omit duration_seconds for default timing."),
    jointProfile("Waist + both elbows", call("adjust_upper_body", [
      'waist={"yaw": yaw_delta}', "both_elbows=delta",
      'torque={"left_arm": {"elbow": left_torque}, "right_arm": {"elbow": right_torque}}', "duration_seconds=duration",
    ]), "Use both_elbows for the same relative Degrees on both sides. Torque and duration_seconds are optional for this structure."),
  ];
}

export function armTargetProfiles(): Profile[] {
  const oneSide = ["right", "left"].flatMap((side) => {
    const definition = (keys: readonly string[]) => mapping(keys, (key) => `${key}_target`);
    const selections = [
      ...masterArmJointKeys.map((key) => ({ label: `${title(side)} ${key.replaceAll("_", " ")}`, args: [`${side}=${mapping([key], () => "target")}`] })),
      { label: `${title(side)} all shoulder axes`, args: [`${side}=${definition(masterArmJointKeys.slice(0, 3))}`] },
      { label: `${title(side)} all wrist axes`, args: [`${side}=${definition(masterArmJointKeys.slice(4))}`] },
      { label: `${title(side)} all seven joints`, args: [`${side}=${definition(masterArmJointKeys)}`] },
      { label: `${title(side)} arbitrary partial joint selection`, args: [`${side}=${side}_targets`] },
    ];
    return selections.map(({ label, args }) => timedProfile("move_arms_to", args, label, "Use absolute SDK degrees within the selected joint's authorized limits. Omitted joints retain their commanded targets; explicit 0 requests zero where allowed. Every nonempty subset of the seven arm keys is supported.", { syntaxKind: "parameter-map" }));
  });
  const bilateral = [
    { label: "Both elbows", args: ['right={"elbow": right_target}', 'left={"elbow": left_target}'] },
    { label: "Both shoulders", args: ["right=right_shoulder_targets", "left=left_shoulder_targets"] },
    { label: "Both wrists", args: ["right=right_wrist_targets", "left=left_wrist_targets"] },
    { label: "Both full arms", args: ["right=right_full_targets", "left=left_full_targets"] },
    { label: "Different joints on each side", args: ['right={"elbow": right_target}', 'left={"wrist_yaw": left_target}'] },
    { label: "Independent partial selections", args: ["right=right_targets", "left=left_targets"] },
  ].map(({ label, args }) => timedProfile("move_arms_to", args, label, "Select absolute targets independently on both sides within each joint's authorized limits. Partial selections allow every nonempty subset per arm; omitted joints retain targets and 0 requests zero where allowed.", { syntaxKind: "parameter-map" }));
  return [...oneSide, ...bilateral];
}

export function stiffnessProfiles(): Profile[] {
  return ["soft", "medium", "hard"].flatMap((level) => ["both", "right", "left"].map((side) => timedProfile(
    "stiff", [`level="${level}"`, `side="${side}"`], `${title(level)} / ${side}`,
    "Proposed general current-hold behavior: retain the commanded targets at any valid stationary arm hold. Keep the unselected arm, waist and existing owner targets.",
    { status: "development", paid: false, transition: true },
  )));
}

export function headProfiles(name: string): Profile[] {
  return ["stand", "sit"].map((posture) => ({
    ...jointProfile(posture === "stand" ? "Standing" : "Inactive seated", call(name, [...(name === "turn_head" ? ["angle_degrees=target"] : []), `posture="${posture}"`, ...(posture === "sit" ? ["operator_holding=True"] : [])]), "Explicitly select the posture. The applicable seated contract requires operator_holding; no joint duration, speed or torque argument is supported."),
    ...(posture === "sit" ? { status: "development" as const } : {}),
  }));
}

export function shakeHeadProfiles(): Profile[] {
  return ["stand", "sit"].flatMap((posture) => {
    const postureArgs = [`posture="${posture}"`, ...(posture === "sit" ? ["operator_holding=True"] : [])];
    const base = jointProfile(posture === "stand" ? "Standing defaults" : "Inactive seated defaults", call("shake_head", postureArgs), "Uses the SDK's default amplitude and one cycle. Select the posture explicitly.");
    return [base, ...["angle_degrees", "degrees"].flatMap((angle) => ["cycles", "repeats"].flatMap((count) => [false, true].map((pause) => jointProfile(
      `${posture === "stand" ? "Standing" : "Inactive seated"} / ${angle} / ${count}${pause ? " / pause" : ""}`,
      call("shake_head", [...postureArgs, `${angle}=target`, `${count}=cycle_count`, ...(pause ? ["pause_seconds=pause"] : [])]),
      "angle_degrees and degrees are mutually exclusive aliases; cycles and repeats are mutually exclusive aliases. pause_seconds is an optional pause, not movement duration.",
    ))))].map((entry) => ({ ...entry, ...(posture === "sit" ? { status: "development" as const } : {}) }));
  });
}
