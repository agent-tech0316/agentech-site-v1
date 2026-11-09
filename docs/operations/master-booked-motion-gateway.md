# Booked Master motion packages

The gateway downloads the signed account's booked object into its private runtime directory. The immutable source, plan, account, session, asset ID, archive SHA-256, and individual media SHA-256 values bind preparation and dispatch. The native selector uses the full upload digest. Each package has its own directory. Only the movement policy and selected PCM WAV enter that directory.

## Release order

Apply the validated-motion booking migration, then install the matching gateway release and its runtime dependencies on the assigned Ultra PC. Verify the gateway can prepare a new policy with the installed simulator before serving the website change that offers generic motion bookings. The older gateway protocol flag alone cannot distinguish a PC running the Happy Dance-only runner. Existing bookings must retain their original receipt and scheduled window during rollout.

## Preparing a gateway

Use the commissioned Master Ultra gateway and the Python interpreter selected by the bridge. The interpreter needs NumPy, ONNX Runtime with the CPU execution provider, MuJoCo, Paramiko, and pywin32 on Windows. Preserve the existing SSH host-key trust, deployment identity, gateway lease, and credentials. Keep the runtime directory writable only by the gateway account and trusted local maintainers. The runtime directory holds immutable assets and trusted cached evaluation results.

Set `AGENTECH_MASTER_ULTRA_SIM_SCENE` to the absolute path of `x2_rl_deploy_mujoco/configuration/robot/lx2501_3_t2d5/model_info/scene.xml` from AimDK X2 SDK v1.1.0. For a persistent Windows watchdog, the default scene path is `master-config/ultra-simulator/model_info/scene.xml` under the gateway root. Keep the accompanying `x2.xml` and sibling `meshes` directory in their original locations. The gateway checks the scene, joint model, and mesh set against the captured Ultra profile. The profile also records digests of the deployed Ultra native joint model and BMIMIC configuration. A different target, changed profile, or unsupported Edu deployment produces an admission failure.

The bounded local worker evaluates each booked frame at 50 Hz. For new policy bytes it uses a floating-base simulation of the Ultra, applies the qualified gains and joint order, checks finite outputs, limits, collisions and contact with the ground, and observes the terminal simulated posture. The previously demonstrated Happy Dance policy reuses its exact policy digest and native profile while checking all runtime frames. Changing a soundtrack changes the booked package identity. A passing simulation describes the selected model and simulated conditions. It does not measure a physical run or certify every possible feedback trajectory.

To exercise preparation offline on staged files, run `python scripts/master_booked_body.py --prepare PLAN_PATH UPLOAD_PATH`. The bridge runs this during normal staging, including for a first-time policy. The worker has a memory cap and a wall-clock deadline. The gateway binds its private cache to the package, profile, probe code, and interpreter dependencies.

## Site operating conditions

Native playback uses the same commissioned, identity-bound signed-booking conditions on the selected Ultra for every user. The site owner controls access to the physical cell and its emergency stop. A fresh terminal standing observation, exclusive native MC ownership, joint state and IMU health, active booking, viewer countdown, and a single claim are required. Those measurements establish robot state. They provide no measurement of nearby people or obstacles. Unattended operation in an uncontrolled or occupied space has no established clearance protection or physical qualification.

Sites with an independent facility interlock can set `AGENTECH_MASTER_CELL_INTERLOCK` to an absolute path updated atomically by their protected local equipment integration. The record contains `schema` set to `eaic-cell-interlock-v1`, the robot `serial`, an offset-qualified ISO `observed_at`, boolean `perimeter_clear`, `emergency_stop_ready`, and `protective_stop_active`. The maximum input age is two seconds. A configured feed must establish a clear perimeter, a ready stop and an inactive protective stop immediately before dispatch. Missing, stale, mismatched or faulted configured input blocks playback. Without a configured feed the receipt contains no independent cell measurement. No facility-feed producer or site sensor was commissioned as part of this implementation.

## Installation, receipts and handoff

The claimed runner checks the live SSH identity, robot serial and native model files. It verifies staged and installed bytes, promotes a private staging directory using a no-overwrite atomic rename, and rejects different or extra content in an existing destination. It opens an observer for the exact native selector and sends one native playback request. A timed-out or ambiguous request remains a failure. The native controller retains ownership throughout observation.

The motion receipt records the native transitions, observed duration, displacement, fault state, and terminal settled ownership. With bundled audio, completion requires the matched WAV's speaker-board playback interval. A movement-only receipt records no soundtrack result. The original session 108 archival evidence rules continue to apply to its original report.

After a failed generic attempt, a waiting booking can obtain two independent read-only observations of the same terminal native controller. The signed evidence binds the failed receipt and its plan. Accepted playback additionally requires the exact installed package. A positively recorded pre-dispatch failure may be observed without an installed package. An ambiguous dispatch stays unresolved. Handoff preserves the original failed outcome.
