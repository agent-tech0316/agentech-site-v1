import { masterNativeModelEffort } from "./master-sdk-documentation";

export type MasterJointTorqueReferenceRow = {
  joint: string;
  label: string;
  maxEffortNm: number;
  additionalTorqueInputRange: string | null;
};

const sides = ["left", "right"] as const;
const shoulderJoints = (side: string) => ["pitch", "roll", "yaw"].map((axis) => `${side}_shoulder_${axis}_joint`);
const wristJoints = (side: string) => ["yaw", "pitch", "roll"].map((axis) => `${side}_wrist_${axis}_joint`);
const elbowJoints = sides.map((side) => `${side}_elbow_joint`);
const waistJoints = ["yaw", "pitch", "roll"].map((axis) => `waist_${axis}_joint`);
const armJoints = sides.flatMap((side) => [...shoulderJoints(side), `${side}_elbow_joint`, ...wristJoints(side)]);
const jointsByFunction: Readonly<Record<string, readonly string[]>> = {
  adjust_left_elbow: ["left_elbow_joint"],
  adjust_right_elbow: ["right_elbow_joint"],
  adjust_elbow: elbowJoints,
  adjust_both_elbows: elbowJoints,
  move_elbows_to: elbowJoints,
  adjust_left_shoulder: shoulderJoints("left"),
  adjust_right_shoulder: shoulderJoints("right"),
  adjust_left_wrist: wristJoints("left"),
  adjust_right_wrist: wristJoints("right"),
  adjust_wrist: wristJoints("right"),
  adjust_waist: waistJoints,
  return_waist_to_neutral: waistJoints,
  undo_waist: waistJoints,
  adjust_upper_body: [...waistJoints, ...armJoints],
  move_arms_to: armJoints,
  mirror_arm_pose: armJoints,
  move_mirrored_arms_to: armJoints,
  plan_upper_body_torque_assist: [...armJoints, ...waistJoints],
};
const torqueInputFunctions = new Set([
  "adjust_left_elbow", "adjust_right_elbow", "adjust_elbow", "adjust_both_elbows",
  "adjust_left_shoulder", "adjust_right_shoulder", "adjust_left_wrist", "adjust_right_wrist",
  "adjust_wrist", "adjust_waist", "adjust_upper_body",
]);

// Model limits describe the joints. A torque keyword is a separate wrapper
// capability, so native effort support never invents a callable parameter.
export function masterJointTorqueReference(functionName: string): MasterJointTorqueReferenceRow[] {
  return (jointsByFunction[functionName] ?? []).map((joint) => {
    const label = joint.replace(/_joint$/, "").replaceAll("_", " ");
    return {
      joint,
      label: label[0].toUpperCase() + label.slice(1),
      maxEffortNm: masterNativeModelEffort[joint],
      // These are request ceilings. Live arm admission also needs the owner's
      // per-joint allowance; nonzero waist effort remains dry-run planning only.
      additionalTorqueInputRange: torqueInputFunctions.has(functionName)
        ? joint.endsWith("wrist_pitch_joint") || joint.endsWith("wrist_roll_joint")
          ? "-2.2 to +2.2 N·m" : "-24 to +24 N·m"
        : null,
    };
  });
}
