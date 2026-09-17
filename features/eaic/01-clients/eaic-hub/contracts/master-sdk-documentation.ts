import type { AgentechFunction, AgentechParam } from "@/features/eaic/02-unified-api/projects-validation/aegis-sdk-reference";
import { masterActionFunctions } from "./master-action-documentation";

// Display-only reference content for the EAIC Hub View SDK page. Runtime and
// physical-robot capability validation continue to use the 02-unified-api data.
const param = (name: string, type: string, description: string): AgentechParam => ({
  name,
  type,
  description,
  status: "available",
  ...(/^(?:max_)?duration_seconds$/.test(name) ? { paidOnly: true } : {})
});
const profile = (name: string, syntax: string): NonNullable<AgentechFunction["profiles"]>[number] => ({
  name,
  syntax
});
const jointProfile = (name: string, syntax: string, description: string): NonNullable<AgentechFunction["profiles"]>[number] => {
  const formattedSyntax = syntax.replace(/\s*=\s*/g, " = ");
  const defaultSyntax = formattedSyntax
    .replace(/,?\s*(?:max_)?duration_seconds\s*=\s*[\d.]+\s*,?(?=\s*\))/g, syntax.includes("\n") ? "\n" : "")
    .replace(/\(\s*\)/g, "()");

  return {
    name,
    syntax: defaultSyntax,
    description: `${description}, at default speed.`,
    ...(defaultSyntax !== formattedSyntax ? { customDurationSyntax: formattedSyntax } : {})
  };
};

type MasterPostureFunction = Omit<AgentechFunction, "params"> & {
  title: string;
  configurationNote?: string;
  params: (AgentechParam & { allowedValues?: string[] })[];
};

// Verified against agentech_sdk@095ebe3a37f642462a50fa9d375a1316de5b46ec:
// agentech/robots/master/api.py and README.md (standing lifecycle / restoration).
// Current-pose holding, physical teaching, pose return, and stiffness restoration
// are distinct operations. Keep these descriptions aligned with that behavior.
export const masterPostureFunctions: MasterPostureFunction[] = [
  {
    name: "enter_stand_hand_guide",
    title: "Enter Standing Hand Guidance",
    category: "Sensing",
    signature: "Agentech.enter_stand_hand_guide(side)",
    summary: "Enables standing Hand Guidance for the selected arms. The current SDK holds their pose for controlled joint adjustments, making it useful for pose setup while Master remains standing.",
    platformNoteLabel: "Hand Guidance in this SDK",
    platformNote: "Physically guided teaching and recording use a separate workflow. This command does not start that workflow.",
    example: '# Enable Hand Guidance for the right arm\nAgentech.enter_stand_hand_guide("right")\n\n# Enable Hand Guidance for both arms\nAgentech.enter_stand_hand_guide("both")',
    profiles: [
      { ...profile("Right arm", 'Agentech.enter_stand_hand_guide("right")'), description: "Enables Hand Guidance for the right arm." },
      { ...profile("Both arms", 'Agentech.enter_stand_hand_guide("both")'), description: "Enables Hand Guidance for both arms." }
    ],
    params: [{ ...param("side", "string", "Selects which arm configuration enters Hand Guidance mode."), allowedValues: ['"right"', '"both"'] }]
  },
  {
    name: "restore_stand_hand_guide",
    title: "Return Arms and Waist from Hand Guidance",
    category: "Sensing",
    signature: "Agentech.restore_stand_hand_guide()",
    summary: "Returns Master's selected arms and waist together to their reference positions, then releases the active arm hold after the return is verified. Use restore_stand_default() afterward to restore normal standing arm stiffness.",
    configurationNote: "Uses the right arm or both arms selected by enter_stand_hand_guide(side). The waist returns to neutral in either configuration.",
    example: "# Return the selected arms and waist, then release the hold\nAgentech.restore_stand_hand_guide()",
    params: []
  },
  {
    name: "restore_stand_default",
    title: "Restore Normal Standing Arm Stiffness",
    category: "Sensing",
    signature: "Agentech.restore_stand_default()",
    summary: "Restores Master's normal standing arm stiffness after the arms and waist have returned. It does not return the robot to a reference pose.",
    configurationNote: "Call after restore_stand_hand_guide() completes successfully. No arm selection is required.",
    platformNoteLabel: "Current SDK limitation",
    platformNote: "A smooth stiffness transition is still under validation; the latest documented physical trial showed visible arm movement during the handoff.",
    example: "# Return the arms and waist first\nAgentech.restore_stand_hand_guide()\n\n# Restore normal standing arm stiffness\nAgentech.restore_stand_default()",
    params: []
  },
  {
    name: "status",
    title: "Read Standing and Arm-Control Status",
    category: "Sensing",
    signature: "Agentech.status()",
    summary: "Reads Master's current posture, selected arm configuration, and readiness for normal standing actions. Does not move Master.",
    configurationNote: "Use before or after a posture change. standing_state identifies the current mode; guided_sides identifies the selected arms; preset_actions_ready reports readiness for normal actions.",
    example: '# Inspect the current mode, arm selection, and readiness\nstate = Agentech.status()\nprint(state["standing_state"])\nprint(state["guided_sides"])\nprint(state["preset_actions_ready"])',
    params: []
  }
];

const elbowFunctions: AgentechFunction[] = [
  {
    name: "adjust_right_elbow",
    category: "Joint Adjustments",
    signature: "Agentech.adjust_right_elbow()",
    summary: "Adjust Master's right elbow by a signed number of degrees.",
    example: "Agentech.adjust_right_elbow(+5, duration_seconds=1.0)",
    profiles: [jointProfile("Right elbow relative angle", "Agentech.adjust_right_elbow(degrees=+5, duration_seconds=1.0)", "Adjust right elbow by x degrees")],
    params: [
      param("degrees", "number", "Signed relative adjustment in degrees."),
      param("duration_seconds", "number", "Movement duration in seconds, as shown in the engineering example.")
    ]
  },
  {
    name: "adjust_left_elbow",
    category: "Joint Adjustments",
    signature: "Agentech.adjust_left_elbow()",
    summary: "Adjust Master's left elbow by a signed number of degrees.",
    example: "Agentech.adjust_left_elbow(+5, duration_seconds=1.0)",
    profiles: [jointProfile("Left elbow relative angle", "Agentech.adjust_left_elbow(degrees=+5, duration_seconds=1.0)", "Adjust left elbow by x degrees")],
    params: [
      param("degrees", "number", "Signed relative adjustment in degrees."),
      param("duration_seconds", "number", "Movement duration in seconds, as shown in the engineering example.")
    ]
  },
  {
    name: "adjust_both_elbows",
    category: "Joint Adjustments",
    signature: "Agentech.adjust_both_elbows()",
    summary: "Adjust both of Master's elbows together by the same signed angle.",
    example: "Agentech.adjust_both_elbows(+30, duration_seconds=3.0)",
    profiles: [jointProfile("Both elbows relative angle", "Agentech.adjust_both_elbows(degrees=+30, duration_seconds=3.0)", "Adjust both elbows by x degrees")],
    params: [
      param("degrees", "number", "Signed relative adjustment applied to both elbows."),
      param("duration_seconds", "number", "Coordinated movement duration in seconds, as shown in the engineering example.")
    ]
  },
  {
    name: "adjust_elbow",
    category: "Joint Adjustments",
    signature: "Agentech.adjust_elbow()",
    summary: "Adjust either of Master's elbows by selecting a side and signed angle.",
    example: 'Agentech.adjust_elbow("right", +5, duration_seconds=1.0)\nAgentech.adjust_elbow("left", +5, duration_seconds=1.0)',
    profiles: [
      jointProfile("Select right elbow", "Agentech.adjust_elbow(side=\"right\", degrees=+5, duration_seconds=1.0)", "Adjust right elbow by x degrees"),
      jointProfile("Select left elbow", "Agentech.adjust_elbow(side=\"left\", degrees=+5, duration_seconds=1.0)", "Adjust left elbow by x degrees")
    ],
    params: [
      param("side", "string", "Selects the elbow side shown in the engineering examples."),
      param("degrees", "number", "Signed relative elbow adjustment in degrees."),
      param("duration_seconds", "number", "Movement duration in seconds, as shown in the engineering examples.")
    ]
  },
  {
    name: "move_elbows_to",
    category: "Joint Adjustments",
    signature: "Agentech.move_elbows_to()",
    summary: "Move both of Master's elbows to the requested target angle.",
    example: "Agentech.move_elbows_to(50, duration_seconds=8.0)",
    profiles: [jointProfile("Both elbows target angle", "Agentech.move_elbows_to(degrees=50, duration_seconds=8.0)", "Move both elbows to x degrees")],
    params: [
      param("degrees", "number", "Target elbow angle in degrees."),
      param("duration_seconds", "number", "Coordinated movement duration in seconds, as shown in the engineering example.")
    ]
  }
];

const shoulderFunctions: AgentechFunction[] = [
  {
    name: "adjust_right_shoulder",
    category: "Joint Adjustments",
    signature: "Agentech.adjust_right_shoulder()",
    summary: "Adjust Master's right shoulder on its pitch, roll, or yaw axis.",
    example: 'Agentech.adjust_right_shoulder("pitch", +5, duration_seconds=1.0)\nAgentech.adjust_right_shoulder("roll", +5, duration_seconds=1.0)\nAgentech.adjust_right_shoulder("yaw", +5, duration_seconds=1.0)',
    profiles: [
      jointProfile("Pitch axis", "Agentech.adjust_right_shoulder(axis=\"pitch\", degrees=+5, duration_seconds=1.0)", "Adjust right shoulder pitch by x degrees"),
      jointProfile("Roll axis", "Agentech.adjust_right_shoulder(axis=\"roll\", degrees=+5, duration_seconds=1.0)", "Adjust right shoulder roll by x degrees"),
      jointProfile("Yaw axis", "Agentech.adjust_right_shoulder(axis=\"yaw\", degrees=+5, duration_seconds=1.0)", "Adjust right shoulder yaw by x degrees")
    ],
    params: [
      param("axis", 'string ("roll", "pitch", "yaw")', "Selects the shoulder axis shown in the engineering examples."),
      param("degrees", "number", "Signed relative shoulder adjustment in degrees."),
      param("duration_seconds", "number", "Movement duration in seconds, as shown in the engineering examples.")
    ]
  },
  {
    name: "adjust_left_shoulder",
    category: "Joint Adjustments",
    signature: "Agentech.adjust_left_shoulder()",
    summary: "Adjust Master's left shoulder on its pitch, roll, or yaw axis.",
    example: 'Agentech.adjust_left_shoulder("pitch", +5, duration_seconds=1.0)\nAgentech.adjust_left_shoulder("roll", +5, duration_seconds=1.0)\nAgentech.adjust_left_shoulder("yaw", +5, duration_seconds=1.0)',
    profiles: [
      jointProfile("Pitch axis", "Agentech.adjust_left_shoulder(axis=\"pitch\", degrees=+5, duration_seconds=1.0)", "Adjust left shoulder pitch by x degrees"),
      jointProfile("Roll axis", "Agentech.adjust_left_shoulder(axis=\"roll\", degrees=+5, duration_seconds=1.0)", "Adjust left shoulder roll by x degrees"),
      jointProfile("Yaw axis", "Agentech.adjust_left_shoulder(axis=\"yaw\", degrees=+5, duration_seconds=1.0)", "Adjust left shoulder yaw by x degrees")
    ],
    params: [
      param("axis", 'string ("roll", "pitch", "yaw")', "Selects the shoulder axis shown in the engineering examples."),
      param("degrees", "number", "Signed relative shoulder adjustment in degrees."),
      param("duration_seconds", "number", "Movement duration in seconds, as shown in the engineering examples.")
    ]
  }
];

const wristFunctions: AgentechFunction[] = [
  {
    name: "adjust_right_wrist",
    category: "Joint Adjustments",
    signature: "Agentech.adjust_right_wrist()",
    summary: "Adjust one or more of Master's right-wrist axes.",
    example: 'Agentech.adjust_right_wrist("roll", +5)\nAgentech.adjust_right_wrist("pitch", +5)\nAgentech.adjust_right_wrist("yaw", +5)\nAgentech.adjust_right_wrist(roll=+5, pitch=-3, yaw=+2)\nAgentech.adjust_right_wrist(+10)',
    profiles: [
      jointProfile("Roll axis", "Agentech.adjust_right_wrist(axis=\"roll\", degrees=+5)", "Adjust right wrist roll by x degrees"),
      jointProfile("Pitch axis", "Agentech.adjust_right_wrist(axis=\"pitch\", degrees=+5)", "Adjust right wrist pitch by x degrees"),
      jointProfile("Yaw axis", "Agentech.adjust_right_wrist(axis=\"yaw\", degrees=+5)", "Adjust right wrist yaw by x degrees"),
      jointProfile("Combined axes", "Agentech.adjust_right_wrist(roll=+5, pitch=-3, yaw=+2)", "Adjust right wrist roll, pitch, and yaw by the specified degrees"),
      jointProfile("Single-value form", "Agentech.adjust_right_wrist(+10)", "Adjust all right wrist axes by x degrees")
    ],
    params: [
      param("axis", 'string ("roll", "pitch", "yaw") or number', "Selects one wrist axis, or supplies the one-value form shown in the examples."),
      param("degrees", "number", "Signed relative adjustment for the selected axis."),
      param("roll", "number", "Signed roll adjustment in degrees."),
      param("pitch", "number", "Signed pitch adjustment in degrees."),
      param("yaw", "number", "Signed yaw adjustment in degrees.")
    ]
  },
  {
    name: "adjust_left_wrist",
    category: "Joint Adjustments",
    signature: "Agentech.adjust_left_wrist()",
    summary: "Adjust one or more of Master's left-wrist axes.",
    example: 'Agentech.adjust_left_wrist("roll", +5)\nAgentech.adjust_left_wrist("pitch", +5)\nAgentech.adjust_left_wrist("yaw", +5)\nAgentech.adjust_left_wrist(roll=+5, pitch=-3, yaw=+2)\nAgentech.adjust_left_wrist(+10)',
    profiles: [
      jointProfile("Roll axis", "Agentech.adjust_left_wrist(axis=\"roll\", degrees=+5)", "Adjust left wrist roll by x degrees"),
      jointProfile("Pitch axis", "Agentech.adjust_left_wrist(axis=\"pitch\", degrees=+5)", "Adjust left wrist pitch by x degrees"),
      jointProfile("Yaw axis", "Agentech.adjust_left_wrist(axis=\"yaw\", degrees=+5)", "Adjust left wrist yaw by x degrees"),
      jointProfile("Combined axes", "Agentech.adjust_left_wrist(roll=+5, pitch=-3, yaw=+2)", "Adjust left wrist roll, pitch, and yaw by the specified degrees"),
      jointProfile("Single-value form", "Agentech.adjust_left_wrist(+10)", "Adjust all left wrist axes by x degrees")
    ],
    params: [
      param("axis", 'string ("roll", "pitch", "yaw") or number', "Selects one wrist axis, or supplies the one-value form shown in the examples."),
      param("degrees", "number", "Signed relative adjustment for the selected axis."),
      param("roll", "number", "Signed roll adjustment in degrees."),
      param("pitch", "number", "Signed pitch adjustment in degrees."),
      param("yaw", "number", "Signed yaw adjustment in degrees.")
    ]
  },
  {
    name: "adjust_wrist",
    category: "Joint Adjustments",
    signature: "Agentech.adjust_wrist()",
    summary: "Apply a coordinated roll, pitch, and yaw adjustment to Master's wrists.",
    example: "Agentech.adjust_wrist(roll=+5, pitch=-3, yaw=+2)",
    profiles: [jointProfile("Combined wrist axes", "Agentech.adjust_wrist(roll=+5, pitch=-3, yaw=+2)", "Adjust both wrists by the specified roll, pitch, and yaw degrees")],
    params: [
      param("roll", "number", "Signed roll adjustment in degrees."),
      param("pitch", "number", "Signed pitch adjustment in degrees."),
      param("yaw", "number", "Signed yaw adjustment in degrees.")
    ]
  }
];

const waistFunctions: AgentechFunction[] = [
  {
    name: "adjust_waist",
    category: "Joint Adjustments",
    signature: "Agentech.adjust_waist()",
    summary: "Adjust one or more of Master's waist yaw, pitch, and roll axes.",
    example: 'Agentech.adjust_waist("yaw", +10)',
    profiles: [
      jointProfile("Yaw axis", "Agentech.adjust_waist(axis=\"yaw\", degrees=+10)", "Adjust waist yaw by x degrees"),
      jointProfile("Pitch axis", "Agentech.adjust_waist(axis=\"pitch\", degrees=+10)", "Adjust waist pitch by x degrees"),
      jointProfile("Roll axis", "Agentech.adjust_waist(axis=\"roll\", degrees=+10)", "Adjust waist roll by x degrees"),
      jointProfile("Combined waist axes", "Agentech.adjust_waist(\n    yaw=+5,\n    pitch=-5,\n    roll=+5,\n    max_duration_seconds=8.0\n)", "Adjust waist yaw, pitch, and roll by the specified degrees")
    ],
    params: [
      param("axis", 'string ("roll", "pitch", "yaw")', "Selects one supported waist axis."),
      param("degrees", "number · dynamic limit", "Signed relative adjustment for the selected axis. The accepted range depends on that axis's calibrated limits and current native headroom."),
      param("yaw", "number", "Signed yaw adjustment in degrees."),
      param("pitch", "number", "Signed pitch adjustment in degrees."),
      param("roll", "number", "Signed roll adjustment in degrees."),
      param("max_duration_seconds", "number", "Maximum movement duration in seconds, as shown in the engineering example.")
    ]
  },
  {
    name: "return_waist_to_neutral",
    category: "Joint Adjustments",
    signature: "Agentech.return_waist_to_neutral()",
    summary: "Return Master's waist to its supported neutral position.",
    example: "Agentech.return_waist_to_neutral(\n    max_duration_seconds=8.0\n)",
    profiles: [jointProfile("Return to neutral", "Agentech.return_waist_to_neutral(\n    max_duration_seconds=8.0\n)", "Return waist to its neutral position")],
    params: [param("max_duration_seconds", "number", "Maximum movement duration in seconds, as shown in the engineering example.")]
  }
];

const upperBodyFunctions: AgentechFunction[] = [
  {
    name: "adjust_upper_body",
    category: "Joint Adjustments",
    signature: "Agentech.adjust_upper_body()",
    summary: "Coordinate Master's waist and upper-body joints in one adjustment.",
    example: 'Agentech.adjust_upper_body(\n    waist={"yaw": +10},\n    both_elbows=+30,\n    duration_seconds=3.0,\n)',
    profiles: [
      jointProfile("Waist + both elbows", "Agentech.adjust_upper_body(\n    waist={\"yaw\": +10},\n    both_elbows=+30,\n    duration_seconds=3.0,\n)", "Adjust waist yaw and both elbows by the specified degrees")
    ],
    params: [
      param("waist", "object", "Waist-axis adjustments shown in the engineering example."),
      param("both_elbows", "number", "Signed adjustment applied to both elbows."),
      param("duration_seconds", "number", "Coordinated movement duration in seconds, as shown in the engineering example.")
    ]
  },
  {
    name: "move_arms_to",
    category: "Joint Adjustments",
    signature: "Agentech.move_arms_to()",
    summary: "Move Master's right and left arms to explicit coordinated joint targets.",
    example: 'Agentech.move_arms_to(\n    right={\n        "shoulder_pitch": -19.45,\n        "shoulder_roll": 16.68,\n        "shoulder_yaw": 6.36,\n        "elbow": 24.91,\n        "wrist_yaw": 0.58,\n        "wrist_pitch": 2.52,\n        "wrist_roll": -0.03,\n    },\n    left={\n        "shoulder_pitch": -19.45,\n        "shoulder_roll": 16.68,\n        "shoulder_yaw": 6.36,\n        "elbow": 24.91,\n        "wrist_yaw": 0.58,\n        "wrist_pitch": 2.52,\n        "wrist_roll": -0.03,\n    },\n    duration_seconds=8.0,\n)',
    profiles: [
      jointProfile("Right + left arm targets", "Agentech.move_arms_to(\n    right={\n        \"shoulder_pitch\": -19.45,\n        \"shoulder_roll\": 16.68,\n        \"shoulder_yaw\": 6.36,\n        \"elbow\": 24.91,\n        \"wrist_yaw\": 0.58,\n        \"wrist_pitch\": 2.52,\n        \"wrist_roll\": -0.03,\n    },\n    left={\n        \"shoulder_pitch\": -19.45,\n        \"shoulder_roll\": 16.68,\n        \"shoulder_yaw\": 6.36,\n        \"elbow\": 24.91,\n        \"wrist_yaw\": 0.58,\n        \"wrist_pitch\": 2.52,\n        \"wrist_roll\": -0.03,\n    },\n    duration_seconds=8.0,\n)", "Move both arms to the specified joint angles")
    ],
    params: [
      param("right", "object", "Target joint values for the right arm."),
      param("left", "object", "Target joint values for the left arm."),
      param("duration_seconds", "number", "Coordinated movement duration in seconds, as shown in the engineering example.")
    ]
  },
  {
    name: "mirror_arm_pose",
    category: "Joint Adjustments",
    signature: "Agentech.mirror_arm_pose()",
    summary: "Mirror the selected source arm pose onto Master's opposite arm.",
    example: 'Agentech.mirror_arm_pose(\n    source_side="right",\n    duration_seconds=20.0\n)\n\nAgentech.mirror_arm_pose(\n    source_side="left",\n    duration_seconds=20.0\n)',
    profiles: [
      jointProfile("Mirror from right arm", "Agentech.mirror_arm_pose(\n    source_side=\"right\",\n    duration_seconds=20.0\n)", "Mirror the right arm pose onto the left arm"),
      jointProfile("Mirror from left arm", "Agentech.mirror_arm_pose(\n    source_side=\"left\",\n    duration_seconds=20.0\n)", "Mirror the left arm pose onto the right arm")
    ],
    params: [
      param("source_side", "string", "Selects the source arm shown in the engineering examples."),
      param("duration_seconds", "number", "Mirrored movement duration in seconds, as shown in the engineering examples.")
    ]
  },
  {
    name: "move_mirrored_arms_to",
    category: "Joint Adjustments",
    signature: "Agentech.move_mirrored_arms_to()",
    summary: "Move both of Master's arms to mirrored versions of one supplied joint pose.",
    example: 'Agentech.move_mirrored_arms_to(\n    {\n        "shoulder_pitch": -19.45,\n        "shoulder_roll": 16.68,\n        "shoulder_yaw": 6.36,\n        "elbow": 24.91,\n        "wrist_yaw": 0.58,\n        "wrist_pitch": 2.52,\n        "wrist_roll": -0.03,\n    },\n    duration_seconds=20.0,\n)',
    profiles: [
      jointProfile("Mirrored arm target", "Agentech.move_mirrored_arms_to(\n    {\n        \"shoulder_pitch\": -19.45,\n        \"shoulder_roll\": 16.68,\n        \"shoulder_yaw\": 6.36,\n        \"elbow\": 24.91,\n        \"wrist_yaw\": 0.58,\n        \"wrist_pitch\": 2.52,\n        \"wrist_roll\": -0.03,\n    },\n    duration_seconds=20.0,\n)", "Move both arms to mirrored versions of the specified joint angles")
    ],
    params: [
      param("pose", "object", "Joint values for the source arm pose."),
      param("duration_seconds", "number", "Mirrored movement duration in seconds, as shown in the engineering example.")
    ]
  }
];

export const masterDocumentationFunctions: AgentechFunction[] = [
  ...masterPostureFunctions,
  ...elbowFunctions,
  ...shoulderFunctions,
  ...wristFunctions,
  ...waistFunctions,
  ...upperBodyFunctions,
  ...masterActionFunctions
];

export const masterDocumentationStarterCode = `from agentech import Agentech, master

Agentech.use(
    master,
    dry_run=False,
    ssh_password="YOUR_PASSWORD"
)`;

export const masterJointGroupStarts: Partial<Record<string, string>> = {
  adjust_right_elbow: "Elbows",
  adjust_right_shoulder: "Shoulders",
  adjust_right_wrist: "Wrists",
  adjust_waist: "Waist",
  adjust_upper_body: "Upper Body"
};
