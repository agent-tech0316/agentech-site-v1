// Display-only groups for the reviewed Master execution contract.
// The focused regression compares every entry with the shared allowlist.
export type MasterScheduledMethodGroup = {
  id: string;
  title: string;
  description: string;
  methods: readonly string[];
};

export const masterScheduledMethodGroups: readonly MasterScheduledMethodGroup[] = [
  {
    id: "adjustments",
    title: "Guidance, both arms and waist",
    description: "Arm and waist adjustments use verified raw STAND_DEFAULT guidance. Explicit bilateral entry is optional; the first adjustment enters and verifies guidance through the SDK. undo_waist accepts only a saved result from a successful adjust_waist call in the same program.",
    methods: ["enter_stand_hand_guide", "adjust_right_shoulder", "adjust_left_shoulder", "adjust_right_elbow", "adjust_left_elbow", "adjust_both_elbows", "adjust_elbow", "adjust_right_wrist", "adjust_left_wrist", "adjust_wrist", "adjust_upper_body", "adjust_waist", "return_waist_to_neutral", "undo_waist"],
  },
  {
    id: "arm-poses",
    title: "Arm poses and upper-body sequences",
    description: "Absolute and mirrored arm poses and the SDK upper-body sequences use the same raw guidance checks. Existing SDK parameter, torque and timing limits still apply.",
    methods: ["move_arms_to", "move_elbows_to", "move_mirrored_arms_to", "mirror_arm_pose", "movement_b", "showcase", "close_door"],
  },
  {
    id: "movement-a",
    title: "Movement A · right-arm preset",
    description: "Runs the retained SDK right-arm preset through the reviewed session. Completion retains and verifies the Movement A owner; this is separate from raw arm and waist guidance.",
    methods: ["movement_a"],
  },
  {
    id: "native-presets",
    title: "Native standing gestures",
    description: "Native presets require a freshly verified native-ready standing state. The session does not automatically return from raw guidance or add a restore call before a preset. Unsupported state transitions are refused.",
    methods: ["wave", "blow_kiss", "raise_hand", "salute", "handshake", "high_five", "chest_wave", "clap", "cross_arms", "hug", "cheer", "wave_goodbye", "raise_hands", "scratch_head", "heart"],
  },
  {
    id: "golf-stiffness",
    title: "Golf and SDK stiffness controls",
    description: "These calls retain their existing SDK readiness, operator acknowledgement and mechanical-support requirements. Only the current contract parameters are accepted.",
    methods: ["golf", "golf_put", "stiff"],
  },
  {
    id: "restore-ownership",
    title: "Restore and owner controls",
    description: "Pose restoration, owner release and standing-stiffness restoration are separate operations. Each requested outcome needs its own verified result.",
    methods: ["restore_stand_hand_guide", "restore_stand_default", "accept_current_hold", "release_returned_hold", "release_return_hold"],
  },
  {
    id: "status-pause",
    title: "Status and pause",
    description: "Inspect SDK status or pause within the booked session. A status call or a passing static check does not establish physical qualification.",
    methods: ["stay", "status", "get_status", "get_motion_readiness", "action_catalog"],
  },
];

export const masterScheduledMethodCount = masterScheduledMethodGroups.reduce((total, group) => total + group.methods.length, 0);

export const masterMovementAReviewedCode = `from agentech import Agentech
Agentech.use("master")

# Reviewed session: retained SDK right-arm Movement A preset
Agentech.movement_a()`;
