import type { AgentechFunction, AgentechParam } from "@/features/eaic/02-unified-api/projects-validation/aegis-sdk-reference";
import { masterFunctions } from "@/features/eaic/02-unified-api/projects-validation/master-sdk-reference";

// Display-only reference content for the EAIC Hub View SDK page. Runtime and
// physical-robot capability validation continue to use the 02-unified-api data.
const param = (name: string, type: string, description: string): AgentechParam => ({
  name,
  type,
  description,
  status: "available"
});
const profile = (name: string, syntax: string): NonNullable<AgentechFunction["profiles"]>[number] => ({ name, syntax });

const postureFunctions: AgentechFunction[] = [
  {
    name: "enter_stand_hand_guide",
    category: "Sensing",
    signature: "Agentech.enter_stand_hand_guide()",
    summary: "Enter Master's supported standing hand-guidance mode for the selected arm configuration.",
    example: 'Agentech.enter_stand_hand_guide("right")\nAgentech.enter_stand_hand_guide("both")',
    profiles: [
      profile("Right-arm hand guidance", 'Agentech.enter_stand_hand_guide("right")'),
      profile("Both-arm hand guidance", 'Agentech.enter_stand_hand_guide("both")')
    ],
    params: [param("side", "string", "Selects the standing hand-guidance side shown in the engineering examples.")]
  },
  {
    name: "restore_stand_hand_guide",
    category: "Sensing",
    signature: "Agentech.restore_stand_hand_guide()",
    summary: "Restore Master's supported standing hand-guidance mode.",
    example: "Agentech.restore_stand_hand_guide()",
    profiles: [profile("Restore hand-guidance mode", "Agentech.restore_stand_hand_guide()")],
    params: []
  },
  {
    name: "restore_stand_default",
    category: "Sensing",
    signature: "Agentech.restore_stand_default()",
    summary: "Restore Master's default supported standing mode.",
    example: "Agentech.restore_stand_default()",
    profiles: [profile("Restore default standing mode", "Agentech.restore_stand_default()")],
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
    profiles: [profile("Right elbow relative angle", "Agentech.adjust_right_elbow(+5, duration_seconds=1.0)")],
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
    profiles: [profile("Left elbow relative angle", "Agentech.adjust_left_elbow(+5, duration_seconds=1.0)")],
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
    profiles: [profile("Both elbows relative angle", "Agentech.adjust_both_elbows(+30, duration_seconds=3.0)")],
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
      profile("Select right elbow", 'Agentech.adjust_elbow("right", +5, duration_seconds=1.0)'),
      profile("Select left elbow", 'Agentech.adjust_elbow("left", +5, duration_seconds=1.0)')
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
    profiles: [profile("Both elbows target angle", "Agentech.move_elbows_to(50, duration_seconds=8.0)")],
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
      profile("Pitch axis", 'Agentech.adjust_right_shoulder("pitch", +5, duration_seconds=1.0)'),
      profile("Roll axis", 'Agentech.adjust_right_shoulder("roll", +5, duration_seconds=1.0)'),
      profile("Yaw axis", 'Agentech.adjust_right_shoulder("yaw", +5, duration_seconds=1.0)')
    ],
    params: [
      param("axis", "string", "Selects the shoulder axis shown in the engineering examples."),
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
      profile("Pitch axis", 'Agentech.adjust_left_shoulder("pitch", +5, duration_seconds=1.0)'),
      profile("Roll axis", 'Agentech.adjust_left_shoulder("roll", +5, duration_seconds=1.0)'),
      profile("Yaw axis", 'Agentech.adjust_left_shoulder("yaw", +5, duration_seconds=1.0)')
    ],
    params: [
      param("axis", "string", "Selects the shoulder axis shown in the engineering examples."),
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
      profile("Roll axis", 'Agentech.adjust_right_wrist("roll", +5)'),
      profile("Pitch axis", 'Agentech.adjust_right_wrist("pitch", +5)'),
      profile("Yaw axis", 'Agentech.adjust_right_wrist("yaw", +5)'),
      profile("Combined axes", "Agentech.adjust_right_wrist(roll=+5, pitch=-3, yaw=+2)"),
      profile("Single-value form", "Agentech.adjust_right_wrist(+10)")
    ],
    params: [
      param("axis", "string or number", "Selects one wrist axis, or supplies the one-value form shown in the examples."),
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
      profile("Roll axis", 'Agentech.adjust_left_wrist("roll", +5)'),
      profile("Pitch axis", 'Agentech.adjust_left_wrist("pitch", +5)'),
      profile("Yaw axis", 'Agentech.adjust_left_wrist("yaw", +5)'),
      profile("Combined axes", "Agentech.adjust_left_wrist(roll=+5, pitch=-3, yaw=+2)"),
      profile("Single-value form", "Agentech.adjust_left_wrist(+10)")
    ],
    params: [
      param("axis", "string or number", "Selects one wrist axis, or supplies the one-value form shown in the examples."),
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
    profiles: [profile("Combined wrist axes", "Agentech.adjust_wrist(roll=+5, pitch=-3, yaw=+2)")],
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
    example: 'Agentech.adjust_waist("yaw", +10)\nAgentech.adjust_waist("pitch", +10)\nAgentech.adjust_waist("roll", +10)\nAgentech.adjust_waist(\n    yaw=+5,\n    pitch=-5,\n    roll=+5,\n    max_duration_seconds=8.0\n)',
    profiles: [
      profile("Yaw axis", 'Agentech.adjust_waist("yaw", +10)'),
      profile("Pitch axis", 'Agentech.adjust_waist("pitch", +10)'),
      profile("Roll axis", 'Agentech.adjust_waist("roll", +10)'),
      profile("Combined waist axes", "Agentech.adjust_waist(\n    yaw=+5,\n    pitch=-5,\n    roll=+5,\n    max_duration_seconds=8.0\n)")
    ],
    params: [
      param("axis", "string", "Selects the waist axis shown in the engineering examples."),
      param("degrees", "number", "Signed relative adjustment for the selected axis."),
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
    profiles: [profile("Return to neutral", "Agentech.return_waist_to_neutral(\n    max_duration_seconds=8.0\n)")],
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
      profile("Waist + both elbows", 'Agentech.adjust_upper_body(\n    waist={"yaw": +10},\n    both_elbows=+30,\n    duration_seconds=3.0,\n)')
    ],
    params: [
      param("waist", "object", "Waist-axis adjustments shown in the engineering example."),
      param("both_elbows", "number", "Signed adjustment applied to both elbows."),
      param("duration_seconds", "number", "Coordinated movement duration in seconds, as shown in the engineering example.")
    ]
  }
];

const additionalActionFunctions: AgentechFunction[] = [
  {
    name: "move_arms_to",
    category: "Actions",
    signature: "Agentech.move_arms_to()",
    summary: "Move Master's right and left arms to explicit coordinated joint targets.",
    example: 'Agentech.move_arms_to(\n    right={\n        "shoulder_pitch": -19.45,\n        "shoulder_roll": 16.68,\n        "shoulder_yaw": 6.36,\n        "elbow": 24.91,\n        "wrist_yaw": 0.58,\n        "wrist_pitch": 2.52,\n        "wrist_roll": -0.03,\n    },\n    left={\n        "shoulder_pitch": -19.45,\n        "shoulder_roll": 16.68,\n        "shoulder_yaw": 6.36,\n        "elbow": 24.91,\n        "wrist_yaw": 0.58,\n        "wrist_pitch": 2.52,\n        "wrist_roll": -0.03,\n    },\n    duration_seconds=8.0,\n)',
    profiles: [
      profile("Right + left arm targets", 'Agentech.move_arms_to(\n    right={\n        "shoulder_pitch": -19.45,\n        "shoulder_roll": 16.68,\n        "shoulder_yaw": 6.36,\n        "elbow": 24.91,\n        "wrist_yaw": 0.58,\n        "wrist_pitch": 2.52,\n        "wrist_roll": -0.03,\n    },\n    left={\n        "shoulder_pitch": -19.45,\n        "shoulder_roll": 16.68,\n        "shoulder_yaw": 6.36,\n        "elbow": 24.91,\n        "wrist_yaw": 0.58,\n        "wrist_pitch": 2.52,\n        "wrist_roll": -0.03,\n    },\n    duration_seconds=8.0,\n)')
    ],
    params: [
      param("right", "object", "Target joint values for the right arm."),
      param("left", "object", "Target joint values for the left arm."),
      param("duration_seconds", "number", "Coordinated movement duration in seconds, as shown in the engineering example.")
    ]
  },
  {
    name: "mirror_arm_pose",
    category: "Actions",
    signature: "Agentech.mirror_arm_pose()",
    summary: "Mirror the selected source arm pose onto Master's opposite arm.",
    example: 'Agentech.mirror_arm_pose(\n    source_side="right",\n    duration_seconds=20.0\n)\n\nAgentech.mirror_arm_pose(\n    source_side="left",\n    duration_seconds=20.0\n)',
    profiles: [
      profile("Mirror from right arm", 'Agentech.mirror_arm_pose(\n    source_side="right",\n    duration_seconds=20.0\n)'),
      profile("Mirror from left arm", 'Agentech.mirror_arm_pose(\n    source_side="left",\n    duration_seconds=20.0\n)')
    ],
    params: [
      param("source_side", "string", "Selects the source arm shown in the engineering examples."),
      param("duration_seconds", "number", "Mirrored movement duration in seconds, as shown in the engineering examples.")
    ]
  },
  {
    name: "move_mirrored_arms_to",
    category: "Actions",
    signature: "Agentech.move_mirrored_arms_to()",
    summary: "Move both of Master's arms to mirrored versions of one supplied joint pose.",
    example: 'Agentech.move_mirrored_arms_to(\n    {\n        "shoulder_pitch": -19.45,\n        "shoulder_roll": 16.68,\n        "shoulder_yaw": 6.36,\n        "elbow": 24.91,\n        "wrist_yaw": 0.58,\n        "wrist_pitch": 2.52,\n        "wrist_roll": -0.03,\n    },\n    duration_seconds=20.0,\n)',
    profiles: [
      profile("Mirrored arm target", 'Agentech.move_mirrored_arms_to(\n    {\n        "shoulder_pitch": -19.45,\n        "shoulder_roll": 16.68,\n        "shoulder_yaw": 6.36,\n        "elbow": 24.91,\n        "wrist_yaw": 0.58,\n        "wrist_pitch": 2.52,\n        "wrist_roll": -0.03,\n    },\n    duration_seconds=20.0,\n)')
    ],
    params: [
      param("pose", "object", "Joint values for the source arm pose."),
      param("duration_seconds", "number", "Mirrored movement duration in seconds, as shown in the engineering example.")
    ]
  },
  {
    name: "movement_b",
    category: "Actions",
    signature: "Agentech.movement_b()",
    summary: "Run Master's predefined coordinated movement B at the requested maximum joint speed.",
    example: "Agentech.movement_b(\n    maximum_degrees_per_second=60.0\n)",
    profiles: [profile("Maximum joint speed", "Agentech.movement_b(\n    maximum_degrees_per_second=60.0\n)")],
    params: [param("maximum_degrees_per_second", "number", "Maximum joint speed in degrees per second, as shown in the engineering example.")]
  }
];

const retainedActionFunctions = masterFunctions
  .filter((item) => item.category === "Actions")
  .map((item) => item.name === "stay"
    ? {
        ...item,
        example: "Agentech.stay(1.0)",
        profiles: [profile("Hold duration", "Agentech.stay(1.0)")]
      }
    : item);

export const masterDocumentationFunctions: AgentechFunction[] = [
  ...postureFunctions,
  ...masterFunctions.filter((item) => item.category === "Sensing" && item.name !== "action_catalog"),
  ...elbowFunctions,
  ...shoulderFunctions,
  ...wristFunctions,
  ...waistFunctions,
  ...upperBodyFunctions,
  ...retainedActionFunctions,
  ...additionalActionFunctions
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
