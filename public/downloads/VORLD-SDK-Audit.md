# VORLD SDK audit — Build 51

Compared all 243 SDK Library entries against Agentech GitHub commit `8c9af30fdaa16969901f63fd75411a7e23dcb22f`.

The corrected library offers 237 supported bundled methods. The same catalog feeds Agentech Agent, Codex, Gemini, and MCP.

## Removed from the available-command list

- `master:replay_standing_action`: live standing replay is not connected to the runtime; no command was sent
- `master:putting`: Not present in the current GitHub public API.
- `master:door_closing`: Not present in the current GitHub public API.
- `master:release_sit`: release_sit is permanently disabled: seated support must not transition to passive, global damping, or zero torque
- `navi:recovery_stand`: recovery_stand is under development: the required fallen starting orientation for each direction has not been physically verified; no robot command was sent
- `navi:backflip`: Navi does not support backflip(); use sideflip(direction='left' or 'right') instead

Backflip is also rejected through generic action and behavior calls, including action ID 260. The vendor refusal remains in place.

## Newer GitHub parameters absent from this runtime

The app keeps its real executable parameter sets and labels these methods as using an older parameter set. This release does not upgrade the bundled motion runtime.

- `master:adjust_right_elbow` — added upstream: torque; changed upstream: none.
- `master:adjust_waist` — added upstream: expected_start_degrees, stop_at_native_pitch_limit, torque; changed upstream: none.
- `master:adjust_upper_body` — added upstream: torque; changed upstream: none.
- `master:adjust_left_elbow` — added upstream: torque; changed upstream: none.
- `master:adjust_both_elbows` — added upstream: torque; changed upstream: none.
- `master:adjust_elbow` — added upstream: position, speed, torque; changed upstream: degrees, side.
- `master:adjust_right_wrist` — added upstream: torque; changed upstream: none.
- `master:adjust_wrist` — added upstream: torque; changed upstream: none.
- `master:adjust_left_wrist` — added upstream: torque; changed upstream: none.
- `master:adjust_right_shoulder` — added upstream: torque; changed upstream: none.
- `master:adjust_left_shoulder` — added upstream: torque; changed upstream: none.

## GitHub methods not included in the bundled runtime

- `master:plan_upper_body_torque_assist`
- `master:arm_stiffness_interface`
- `master:plan_arm_stiffness_transition`
- `master:assess_arm_hold`
- `master:hold_arm_pose`
- `master:accept_current_hold`
- `master:release_returned_hold`
- `master:release_return_hold`
- `master:stiff`
- `master:golf`
- `master:golf_put`
- `master:get_motion_readiness`
- `master:watch_motion_readiness`
- `master:standing_actions.stiff`
- `master:standing_actions.golf`
- `master:standing_actions.golf_put`
- `master:seated_actions.stiff`
- `master:seated_actions.golf`
- `master:seated_actions.golf_put`

## Scope

The SDK Library comparison covers Master, its standing/seated action groups, teaching-session controls, and Navi. Codey Rocky uses the separate Makeblock MicroPython adapter; the Agentech repository has no Codey robot API. Console shortcuts and aliases belong to the app adapter and are not extra GitHub SDK methods.

No physical robot actions were run. Offline tests verify catalog membership, parameter metadata, and rejection of unsupported submissions.

Regenerate the catalog with `python scripts/generate-sdk-catalog.py`. To update the pinned comparison, supply `--upstream <SDK export folder> --revision <full Git SHA>` and review `data/sdk-audit.json`.
