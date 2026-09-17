export type CapabilityStatus = "available" | "development" | "unsupported";

export type AgentechParam = {
  name: string;
  type: string;
  defaultValue?: string;
  description: string;
  allowedValues?: string[];
  status?: CapabilityStatus;
  paidOnly?: boolean;
};

export type AgentechFunction = {
  name: string;
  category: "Movement" | "Athletics" | "Actions" | "Joint Adjustments" | "Posture" | "Configuration" | "Safety" | "Sensing";
  signature: string;
  summary: string;
  example: string;
  params: AgentechParam[];
  profiles?: { name: string; syntax: string; syntaxKind?: "parameter-map"; description?: string; customDurationSyntax?: string; number?: number; note?: string; noteLabel?: string; status?: CapabilityStatus }[];
  verification?: string;
  platformNote?: string;
  platformNoteLabel?: string;
  status?: CapabilityStatus;
  creditUsage?: "high";
  access?: {
    tier: "premium";
    featureCode: string;
    includedWithMonthlySubscription: boolean;
    oneTimePurchase: boolean;
  };
};

const p = (name: string, type: string, description: string, defaultValue?: string, status: CapabilityStatus = "available"): AgentechParam =>
  ({ name, type, description, defaultValue, status });

const squatPreparationNote = "Before using this movement, make sure the dog is in squat mode by running Agentech.squat().";
const squatDistanceNote = "Distance traveled is not guaranteed. Squat movement is open loop, so acceleration, stabilization, and stopping can change the actual distance.";

export const aegisFunctions: AgentechFunction[] = [
  {
    name: "forward", category: "Movement", signature: "Agentech.forward()",
    summary: "Move forward using one positive speed-magnitude profile and a controlled stop.",
    example: "Agentech.forward(speed_mps=0.4, duration_s=1.0)",
    profiles: [
      { name: "Default: 0.4 m/s for 1 second", syntax: "Agentech.forward()" },
      { name: "Direct speed", syntax: "Agentech.forward(speed_mps=0.4, duration_s=1.0)", note: "Distance is an estimate, not a guarantee: the robot needs time to accelerate to the requested speed, so the actual distance traveled may differ from the value you calculate." },
      { name: "Distance + time", syntax: "Agentech.forward(distance_m=1.0, duration_s=2.0)", noteLabel: "Speed note", note: "The SDK derives the open-loop speed from distance divided by duration. The result must remain within the supported speed range." },
      { name: "Percentage", syntax: "Agentech.forward(speed_percent=40, duration_s=1.0)" },
      { name: "Speed level", syntax: "Agentech.forward(speed_level=100, duration_s=1.0)" }
    ],
    params: [
      p("speed_mps", "float [0.05, 3.00]", "Direct positive forward speed in meters per second. Values outside the range are rejected."),
      p("duration_s", "float (0, 10]", "How long to hold the movement command. Must be greater than 0 and no more than 10 seconds.", "1.0"),
      p("distance_m", "float (0, 5]", "Requested open-loop travel distance. The SDK divides distance by duration to derive a speed, which must remain between 0.05 and 3.0 m/s."),
      p("speed_percent", "int [1, 100]", "Integer percentage rounded to the nearest supported 5% increment before conversion to a maximum 3.0 m/s scale."),
      p("speed_level", "int [0, 511]", "Select one of 512 integer speed levels. Level 0 maps to 0.05 m/s and level 511 maps to 3.0 m/s.")
    ]
  },
  {
    name: "backward", category: "Movement", signature: "Agentech.backward()", summary: "Move backward using one positive speed-magnitude profile; direction is applied internally.", example: "Agentech.backward(speed_mps=0.4, duration_s=1.0)",
    profiles: [
      { name: "Default: 0.4 m/s for 1 second", syntax: "Agentech.backward()" },
      { name: "Direct speed", syntax: "Agentech.backward(speed_mps=0.4, duration_s=1.0)", note: "Distance is an estimate, not a guarantee: the robot needs time to accelerate to the requested speed, so the actual distance traveled may differ from the value you calculate." },
      { name: "Distance + time", syntax: "Agentech.backward(distance_m=1.0, duration_s=2.0)", noteLabel: "Speed note", note: "The SDK derives the open-loop speed from distance divided by duration. The result must remain within the supported speed range." },
      { name: "Percentage", syntax: "Agentech.backward(speed_percent=40, duration_s=1.0)" },
      { name: "Speed level", syntax: "Agentech.backward(speed_level=100, duration_s=1.0)" }
    ],
    params: [
      p("speed_mps", "float [0.05, 3.00]", "Enter a positive backward speed magnitude in meters per second; the SDK applies the negative body-X direction internally."),
      p("duration_s", "float (0, 10]", "How long to hold the movement command. Must be greater than 0 and no more than 10 seconds.", "1.0"),
      p("distance_m", "float (0, 3]", "Requested open-loop travel distance. The SDK divides distance by duration to derive a speed, which must remain between 0.05 and 3.0 m/s."),
      p("speed_percent", "int [1, 100]", "Integer percentage rounded to the nearest supported 5% increment before conversion to a maximum 3.0 m/s scale."),
      p("speed_level", "int [0, 511]", "Select one of 512 integer speed levels. Level 0 maps to 0.05 m/s and level 511 maps to 3.0 m/s.")
    ]
  },
  {
    name: "lateral", category: "Movement", signature: "Agentech.lateral_left() / Agentech.lateral_right()", summary: "Move sideways using the matching left or right function.", example: "# Distance + speed\nAgentech.lateral_left(distance_m=1.0, speed_mps=0.5)\nAgentech.lateral_right(distance_m=1.0, speed_mps=0.5)\n\n# Speed + time\nAgentech.lateral_left(speed_mps=0.5, duration_s=2.0)\nAgentech.lateral_right(speed_mps=0.5, duration_s=2.0)",
    profiles: [
      { name: "Default: 0.5 m/s for 2 seconds", syntax: "Agentech.lateral_left()\nAgentech.lateral_right()" },
      { name: "Distance + speed", syntax: "Agentech.lateral_left(distance_m=x, speed_mps=x)\nAgentech.lateral_right(distance_m=x, speed_mps=x)", noteLabel: "Time note", note: "Completion time remains an estimate because acceleration, stabilization, and controller timing can change how long the movement takes." },
      { name: "Speed + time", syntax: "Agentech.lateral_left(speed_mps=x, duration_s=x)\nAgentech.lateral_right(speed_mps=x, duration_s=x)", noteLabel: "Distance note", note: "Distance traveled is an estimate, not a guarantee. Acceleration and stopping can change the actual distance." }
    ],
    params: [p("speed_mps", "float [0.10, 1.0] m/s", "Positive lateral speed in meters per second. The supported range is 0.10 m/s through 1.0 m/s, inclusive.", "0.5"), p("duration_s", "float (0, 10] seconds", "How long to apply the lateral movement command.", "2.0"), p("distance_m", "float (0, 10] meters", "Requested open-loop lateral travel distance. Distance divided by speed must complete within 10 seconds.")]
  },
  {
    name: "diagonal", category: "Movement", signature: "Agentech.diagonal()", summary: "Move diagonally with public X/Y coordinates or an angle, combined diagonal speed, and duration. The combined speed is the hypotenuse of the resolved X/Y velocity components.", example: "# Coordinate + duration\nAgentech.diagonal(x_m=0.5, y_m=1.0, duration_s=2.0)\n\n# Angle + combined speed + duration\nAgentech.diagonal(angle_deg=45, speed_mps=0.5, duration_s=2.0)",
    profiles: [
      { name: "Default: forward-right at 45 degrees, 0.5 m/s for 2 seconds", syntax: "Agentech.diagonal()", noteLabel: "Distance note", note: "The theoretical path is 1 meter. Diagonal movement is open loop, so acceleration, stopping, and wheel slip can change the actual distance." },
      { name: "X/Y coordinates + time", syntax: "Agentech.diagonal(x_m=0.5, y_m=1.0, duration_s=2.0)", noteLabel: "Coordinate note", note: "Positive X moves right and negative X moves left. Positive Y moves forward and negative Y moves backward. Both X and Y must be nonzero." },
      { name: "Angle + combined speed + time", syntax: "Agentech.diagonal(angle_deg=45, speed_mps=0.5, duration_s=2.0)", noteLabel: "Angle note", note: "The speed is the hypotenuse of the forward and lateral velocity components. 0 degrees is forward. Positive angles point right and negative angles point left. Use forward, backward, or lateral for cardinal directions." }
    ],
    params: [
      p("x_m", "float (nonzero)", "Open-loop right/left displacement. Positive is right; negative is left."),
      p("y_m", "float (nonzero)", "Open-loop forward/backward displacement. Positive is forward; negative is backward."),
      p("angle_deg", "float [-180, 180]", "Direction measured from forward. Positive points right and negative points left.", "45"),
      p("speed_mps", "float > 0, component-limited", "Positive combined diagonal speed. The resolved forward component must be 0.05-3.0 m/s and the resolved lateral component must be 0.1-1.0 m/s.", "0.5"),
      p("duration_s", "float (0, 10]", "How long to apply the diagonal velocity command.", "2.0")
    ]
  },
  {
    name: "squat_forward", category: "Movement", signature: "Agentech.squat_forward()",
    summary: "Walk forward in the latched low-gait squat stance, then stop and remain squatted.",
    example: "Agentech.squat_forward(speed_mps=0.5, duration_s=2.0)",
    profiles: [
      { name: "Speed + time", syntax: "Agentech.squat_forward(speed_mps=0.5, duration_s=2.0)", noteLabel: "Distance note", note: squatDistanceNote }
    ],
    params: [
      p("speed_mps", "float [0.05, 3.00] m/s", "Required positive forward speed magnitude. Negative values and values outside the inclusive range are rejected."),
      p("duration_s", "float (0, 10] seconds", "Required time for the low-gait forward command.")
    ],
    platformNote: squatPreparationNote,
    platformNoteLabel: "Before movement"
  },
  {
    name: "squat_backward", category: "Movement", signature: "Agentech.squat_backward()",
    summary: "Walk backward in the latched low-gait squat stance, then stop and remain squatted.",
    example: "Agentech.squat_backward(speed_mps=0.5, duration_s=2.0)",
    profiles: [
      { name: "Speed + time", syntax: "Agentech.squat_backward(speed_mps=0.5, duration_s=2.0)", noteLabel: "Distance note", note: squatDistanceNote }
    ],
    params: [
      p("speed_mps", "float [0.05, 3.00] m/s", "Required positive backward speed magnitude; the method applies the backward direction internally. Negative values and values outside the inclusive range are rejected."),
      p("duration_s", "float (0, 10] seconds", "Required time for the low-gait backward command.")
    ],
    platformNote: squatPreparationNote,
    platformNoteLabel: "Before movement"
  },
  {
    name: "squat_lateral", category: "Movement", signature: "Agentech.squat_lateral()",
    summary: "Walk left or right in the latched low-gait squat stance, then stop and remain squatted.",
    example: "Agentech.squat_lateral(direction=\"left\", speed_mps=0.5, duration_s=2.0)\nAgentech.squat_lateral(direction=\"right\", speed_mps=0.5, duration_s=2.0)",
    profiles: [
      { name: "Direction + speed + time", syntax: "Agentech.squat_lateral(direction=\"left\", speed_mps=0.5, duration_s=2.0)", noteLabel: "Distance note", note: squatDistanceNote }
    ],
    params: [
      p("direction", "enum {left, right}", "Required low-gait lateral direction. Use a positive speed magnitude; do not encode direction in the speed."),
      p("speed_mps", "float [0.10, 1.00] m/s", "Required positive lateral speed magnitude in the inclusive supported range."),
      p("duration_s", "float (0, 10] seconds", "Required time for the low-gait lateral command.")
    ],
    platformNote: squatPreparationNote,
    platformNoteLabel: "Before movement"
  },
  {
    name: "squat_diagonal", category: "Movement", signature: "Agentech.squat_diagonal()",
    summary: "Move diagonally in the latched low-gait squat stance using coordinates or an angle, speed, and duration, then remain squatted.",
    example: "Agentech.squat_diagonal(angle_deg=45, speed_mps=0.5, duration_s=2.0)",
    profiles: [
      { name: "Default: forward-right at 45 degrees, 0.5 m/s for 2 seconds", syntax: "Agentech.squat_diagonal()", noteLabel: "Distance note", note: squatDistanceNote },
      { name: "X/Y coordinates + time", syntax: "Agentech.squat_diagonal(x_m=0.5, y_m=1.0, duration_s=2.0)", noteLabel: "Coordinate note", note: `${squatDistanceNote} Positive X points right and positive Y points forward; both values must be nonzero.` },
      { name: "Angle + speed + time", syntax: "Agentech.squat_diagonal(angle_deg=45, speed_mps=0.5, duration_s=2.0)", noteLabel: "Distance and angle note", note: `${squatDistanceNote} Both resolved components must be nonzero and within their limits, so cardinal angles are rejected. Positive angles point right; negative angles point left.` }
    ],
    params: [
      p("x_m", "float (nonzero)", "Open-loop right/left displacement. Positive points right and negative points left."),
      p("y_m", "float (nonzero)", "Open-loop forward/backward displacement. Positive points forward and negative points backward."),
      p("angle_deg", "float [-180, 180], non-cardinal", "Angle-mode direction measured from forward. Positive points right and negative points left; cardinal angles are invalid because both components must move."),
      p("speed_mps", "float > 0, component-limited", "Angle-mode positive combined diagonal speed. The resolved forward magnitude must be 0.05-3.0 m/s and the resolved lateral magnitude must be 0.1-1.0 m/s."),
      p("duration_s", "float (0, 10] seconds", "Time for the coordinate or angle profile.", "2.0")
    ],
    platformNote: squatPreparationNote,
    platformNoteLabel: "Before movement"
  },
  {
    name: "squat_turn", category: "Movement", signature: "Agentech.squat_turn()",
    summary: "Turn by an IMU-measured angle while remaining in the latched squat gait.",
    example: "Agentech.squat_turn(angle_deg=90)",
    profiles: [
      { name: "Angle", syntax: "Agentech.squat_turn(angle_deg=90)", noteLabel: "Direction note", note: "Positive angles turn right and negative angles turn left. The low-gait turn rate is selected automatically." }
    ],
    params: [
      p("angle_deg", "float (nonzero, unbounded)", "Required signed target angle in degrees. Positive turns right and negative turns left.")
    ],
    platformNote: squatPreparationNote,
    platformNoteLabel: "Before movement"
  },
  {
    name: "turn", category: "Movement", signature: "Agentech.turn()", summary: "Turn using signed angles or rates. Direction note: all negative values turn left, and all positive values turn right. The default is +45 degrees (right).", example: "Agentech.turn()",
    profiles: [
      { name: "Default: turn right 45 degrees", syntax: "Agentech.turn()" },
      { name: "Angle + rate", syntax: "Agentech.turn(angle_deg=45, turn_rate_deg_s=22.5)\nAgentech.turn(angle_rad=0.7854, turn_rate_rad_s=0.3927)", noteLabel: "Angle note", note: "One full circle is 360 degrees, which equals 2pi radians. If you omit the rate, it defaults to 2 rad/s." },
      { name: "Rate percentage + time", syntax: "Agentech.turn(rate_percentage=40, duration_s=2.0)" },
      { name: "Turn level + time", syntax: "Agentech.turn(turn_level=256, duration_s=2.0)" },
      { name: "Rate + time", syntax: "Agentech.turn(turn_rate_deg_s=45, duration_s=2.0)\nAgentech.turn(turn_rate_rad_s=0.7854, duration_s=2.0)" },
      { name: "Fixed right: 90 degrees", syntax: "Agentech.turn_right()" },
      { name: "Fixed left: 90 degrees", syntax: "Agentech.turn_left()" },
      { name: "Fixed U-turn: 180 degrees left", syntax: "Agentech.u_turn()" }
    ],
    params: [p("angle_rad", "float (unbounded)", "Signed target angle in radians. Negative turns left; positive turns right. One full circle is 2pi radians (360 degrees)."), p("turn_rate_rad_s", "float [-3, 3]", "Signed turn rate in radians per second. Negative turns left; positive turns right."), p("angle_deg", "float (unbounded)", "Signed target angle in degrees. Negative turns left; positive turns right. One full circle is 360 degrees."), p("turn_rate_deg_s", "float [-171.887, 171.887]", "Signed turn rate in degrees per second. Negative turns left; positive turns right."), p("rate_percentage", "int [-100, 100]", "Signed integer percentage of the maximum turn rate. Values are normalized to supported 5% increments."), p("turn_level", "int [-511, 511]", "Signed turn-rate level: -511 is maximum left, 0 is neutral, and 511 is maximum right."), p("duration_s", "float > 0 (no maximum)", "How long to apply a rate-based turn command. There is no maximum duration.")]
  },
  {
    name: "yaw", category: "Posture", signature: "Agentech.yaw()", summary: "Adjust the body's yaw posture using a positive speed and signed target position. Direction note: negative position moves left, and positive position moves right.", example: "Agentech.yaw()",
    profiles: [
      { name: "Default: 0.4 rad/s, position +0.4426 rad (maximum right)", syntax: "Agentech.yaw()" },
      { name: "Speed + position", syntax: "Agentech.yaw(speed_rad_s=0.4, position_rad=0.4426)", noteLabel: "Direction and time note", note: "Negative position moves left; positive position moves right. Completion time cannot be guaranteed because acceleration, stabilization, and controller timing can change how long the movement takes." }
    ],
    params: [p("speed_rad_s", "float [0.01, 0.6]", "Positive yaw speed magnitude in radians per second."), p("position_rad", "float [-0.466, 0.4426]", "Signed target position in radians. Negative moves left; positive moves right.")]
  },
  {
    name: "pitch", category: "Posture", signature: "Agentech.pitch()", summary: "Adjust the body's pitch posture using a positive speed and signed target position. Direction note: negative position moves down, and positive position moves up.", example: "Agentech.pitch()",
    profiles: [
      { name: "Default: 0.4 rad/s, position 0.4 rad (maximum up)", syntax: "Agentech.pitch()" },
      { name: "Speed + position", syntax: "Agentech.pitch(speed_rad_s=0.4, position_rad=0.4)", noteLabel: "Direction and time note", note: "Negative position moves down; positive position moves up. Completion time cannot be guaranteed because acceleration, stabilization, and controller timing can change how long the movement takes." }
    ],
    params: [p("speed_rad_s", "float [0.01, 0.6]", "Positive pitch speed magnitude in radians per second."), p("position_rad", "float [-0.3685, 0.4011]", "Signed target position in radians. Negative moves down; positive moves up.")]
  },
  {
    name: "roll", category: "Posture", signature: "Agentech.roll()", summary: "Adjust the body's roll posture using a positive speed and signed target position. Direction note: negative position rolls left, and positive position rolls right.", example: "Agentech.roll()",
    profiles: [
      { name: "Default: 0.4 rad/s, position -0.463 rad (maximum left)", syntax: "Agentech.roll()" },
      { name: "Speed + position", syntax: "Agentech.roll(speed_rad_s=0.4, position_rad=-0.463)", noteLabel: "Direction and time note", note: "Negative position rolls left; positive position rolls right. Completion time cannot be guaranteed because acceleration, stabilization, and controller timing can change how long the movement takes." }
    ],
    params: [p("speed_rad_s", "float [0.01, 0.6]", "Positive roll speed magnitude in radians per second."), p("position_rad", "float [-0.463, 0.461]", "Signed target position in radians. Negative rolls left; positive rolls right.")]
  },
  {
    name: "stay", category: "Posture", signature: "Agentech.stay(duration_s=1.0)", summary: "Holds the posture the dog has moved to while all four feet remain planted on the ground.", example: "Agentech.stay(duration_s=1.0)",
    profiles: [
      { name: "Holding time", syntax: "Agentech.stay(duration_s=1.0)" }
    ],
    params: [p("duration_s", "float > 0 (no maximum)", "How long to hold the current four-foot planted posture. Duration must be greater than 0 and has no maximum.")]
  },
  {
    name: "backflip", category: "Movement", signature: "Agentech.backflip(wait=True)", summary: "Run the official standard backflip preset without automatic retry.", example: "Agentech.backflip(wait=True)",
    params: [p("wait", "bool", "Wait for the preset call to finish before returning.", "True")]
  },
  {
    name: "jump", category: "Movement", signature: "Agentech.jump(wait=True)", summary: "Run the official standard jump preset.", example: "Agentech.jump(wait=True)",
    params: [p("wait", "bool", "Wait for the preset call to finish before returning.", "True")]
  },
  {
    name: "stand", category: "Posture", signature: "Agentech.stand()", summary: "Raise the dog into its full standing stance so it is ready to move forward.", example: "Agentech.stand()",
    params: []
  },
  {
    name: "squat", category: "Posture", signature: "Agentech.squat()", summary: "Put the Aegis dog into its squat stance and keep it ready for squat movement commands.", example: "Agentech.squat()",
    params: []
  },
  {
    name: "sit", category: "Posture", signature: "Agentech.sit()", summary: "Put the dog into damping mode.", example: "Agentech.sit()",
    params: []
  },
  {
    name: "stop", category: "Safety", signature: "Agentech.stop()", summary: "Stop the current motion while the dog remains standing.", example: "Agentech.stop()",
    params: []
  },
  {
    name: "emergency_stop", category: "Safety", signature: "Agentech.emergency_stop()", summary: "Immediately stop the dog and put it into damping mode.", example: "Agentech.emergency_stop()",
    params: []
  },
  {
    name: "get_battery_status", category: "Sensing", signature: "Agentech.get_battery_status()", summary: "Read the current battery status without changing the dog's body mode.", example: "battery = Agentech.get_battery_status()\nprint(battery)",
    params: []
  },
  {
    name: "get_body_state", category: "Sensing", signature: "Agentech.get_body_state()", summary: "Return the current body mode as Stand, Squat, or Damp.", example: "mode = Agentech.get_body_state()\nprint(mode)  # Mode: Stand",
    params: []
  },
  {
    name: "capture_image", category: "Sensing", signature: "Agentech.capture_image(output=\"agentech_capture.jpg\", source=\"default\")", summary: "Capture one frame from the selected Aegis camera source and save it to the requested output path.", example: "image = Agentech.capture_image(output=\"agentech_capture.jpg\", source=\"default\")",
    profiles: [
      { name: "Default output and source", syntax: "image = Agentech.capture_image()" },
      { name: "Selected output and source", syntax: "image = Agentech.capture_image(output=\"capture.jpg\", source=\"default\")", noteLabel: "Scheduled-run note", note: "The supervised website runner stores captures under a safe session-managed filename before displaying them." }
    ],
    params: [
      p("output", "str | pathlib.Path", "Destination path for the captured image.", "\"agentech_capture.jpg\""),
      p("source", "str", "Camera source name passed to the Aegis SDK.", "\"default\"")
    ]
  }
] as const;

export const aegisStarterCode = `from agentech import Agentech
Agentech.use("aegis")`;
