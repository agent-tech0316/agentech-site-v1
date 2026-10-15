# EAIC Hub Master Motion Studio Design

**Date:** 2026-08-03  
**Status:** Approved in conversation; written review pending  
**Companion SDK spec:** `2026-08-03-master-calibrated-seated-motion-design.md`

## Goal

Add an authenticated Master Motion Studio to EAIC Hub. It lets a user design a
complete slow seated arm motion before execution, preview it on an
Agentech-calibrated X2 digital twin, inspect exact joint values and validation
evidence, and submit the immutable asset for engineering characterization.

The website does not directly control Master and does not claim that a visual
preview is physically verified. Only an SDK asset marked
`physically-approved` can reach the existing scheduling and supervised-run
workflow.

## Cross-repository contract

The website and SDK share one canonical version 1 JSON schema, canonical JSON
serialization rules, digest test vectors, joint-name list, units, validation
status vocabulary, and error codes.

The SDK is authoritative for validation and execution. Client-side checks
exist for immediate feedback but cannot issue an offline-validation or
physical-approval status.

## EAIC Hub placement

Add `motion-studio` as a first-class EAIC Hub task at:

`/agentech-products/eaic-hub/motion-studio`

The task appears after View SDK and before Code Certification. It uses a
dedicated component boundary rather than adding the 3D editor to the existing
large workbench component. The EAIC Hub home card explains that Motion Studio
creates simulation drafts; it does not promise immediate robot execution.

The page remains authenticated and `noindex`. Existing EAIC tasks, legacy
redirects, software checks, scheduling, and live-run behavior remain intact.

## Version 1 editor

### 3D stage

The stage displays the exact calibrated kinematic transforms and a simplified
render mesh. Visual mesh simplification may improve browser performance but
must never change joint axes, link transforms, collision geometry, or limits.

The initial pose is Our Sit. The stage shows the chair, floor, planted feet,
pelvis support region, collision geometry toggle, wrist fiducials, onboard
camera frustums, and optional external-camera frustums.

Raw vendor archives are not published. Web assets are generated from the
approved model source, hashed, versioned, and reviewed for redistribution
rights before deployment.

### Joint controls

Version 1 exposes exact shoulder, elbow, and wrist controls for the selected
left arm, right arm, or both arms. Each control shows:

- canonical joint name;
- degrees at the user boundary and radians in technical details;
- configured limit and conservative motion margin;
- current waypoint value and change from Our Sit;
- collision or uncertainty warning tied to that joint.

Changing a subset of joints carries other arm joints forward from the previous
waypoint. The compiled asset always contains all 14 arm joints.

Hand dragging through inverse kinematics and live command streaming are not
part of version 1. A later hand-drag editor must still resolve to the same
complete joint asset and validation pipeline.

### Video-assisted draft creation

Motion Studio may create a draft from one or more uploaded reference videos.
This feature is not VR and creates no VR product dependency. It calibrates the
video camera where calibration evidence is available, extracts timestamped
body/hand landmarks, reconstructs a depth-assisted or multi-view 3D motion,
retargets that motion to the X2 skeleton, solves the arm joints, and applies
conservative time scaling.

A single monocular video is accepted only as an approximate draft source. The
interface shows landmark confidence, occluded intervals, depth uncertainty,
retargeting residuals, and every generated joint value. Video never produces
raw torque, gains, support-joint commands, physical approval, or a direct Run
operation. The resulting draft must pass the same complete SDK validation and
characterization workflow as a manually authored motion.

Uploaded reference videos are private to the authenticated author. Raw uploads
are deleted after the derived draft is created or after 24 hours, whichever
comes first. Immutable validation reports retain only source digests and
derived evidence unless the author explicitly submits a reference clip for
engineering characterization.

### Timeline

The timeline supports add, duplicate, reorder, and delete waypoint operations.
Every segment has a positive finite duration. Authors cannot edit velocity,
acceleration, jerk, snap, gains, effort, support joints, watchdog thresholds,
or the return controller.

The first waypoint is locked to Our Sit. The final return is generated and
locked to Our Sit. Preview includes outbound motion, holds, return, and the
smooth-brake path at selectable checkpoints.

### Whole-support visualization

The preview distinguishes:

- user-planned arm targets;
- predicted waist, hip, knee, and ankle support behavior;
- live or replayed measured support behavior;
- uncertainty bounds;
- smooth-brake behavior.

Users never edit support joints. For slow S1 motions, support uses the current
bounded posture keeper and current-angle leg brace. Faster S2 motion remains
locked until the SDK reports verified foot and seat contact-force capability
and a separately approved controller profile.

## Calibration and measurement presentation

The page shows a calibration badge with four independently versioned layers:

1. vendor model;
2. Master robot calibration;
3. seated session/chair calibration;
4. action residual evidence.

The user can inspect source hashes, robot identity, installed hand, camera
calibration error, wrist-pose disagreement, encoder repeatability, IMU
reference, chair identity, and invalidation reasons.

The camera section may display read-only onboard RGB-D/stereo frames and a raw
external calibration feed. It never modifies OBS, LiveKit, or the existing
robot stream. OBS/LiveKit output is not accepted as calibration evidence.

Camera evidence passes only when intrinsic reprojection RMS is at most 1.0
pixel and onboard/external wrist estimates agree within 15 millimeters and 2.0
degrees where both are visible. Occluded intervals are shown as missing
evidence.

## Validation experience

Validation results are grouped into:

- model identity and calibration;
- joint limits and margins;
- velocity, acceleration, jerk, snap, and higher derivatives;
- self-collision and chair clearance;
- full outbound, hold, return, abort, and reversal coverage;
- predicted whole-support authority;
- telemetry replay and injected failures;
- camera visibility and residuals;
- uncertainty and missing evidence.

Each result has an exact pass, refusal, or missing-evidence state. Warnings
cannot override a refusal. The interface never converts a failed draft into a
passing motion automatically.

## Asset workflow

The user-visible state machine is:

1. Draft
2. Validating
3. Offline validated
4. Submitted for characterization
5. Characterized 10%
6. Characterized 30%
7. Characterized 65%
8. Physically approved
9. Retired

Drafts and offline-validated assets have Preview and Submit controls only.
They never have a Run control. Only a physically approved asset can appear in
the existing scheduling flow, and scheduling transfers only asset ID, digest,
robot/calibration identity, and trusted runner metadata.

Every status transition records actor, timestamp, prior digest, new evidence
digest, and reason. Editing a motion creates a new draft digest and never
mutates characterized evidence.

## Website service boundary

Add authenticated API boundaries for:

- creating and updating draft metadata;
- requesting SDK-backed offline validation;
- reading validation reports;
- submitting immutable assets for characterization;
- reading characterization evidence and status;
- retiring an asset;
- listing physically approved assets for scheduling.

The website never evaluates uploaded Python or executes arbitrary robot
commands for Motion Studio. Requests accept strict JSON only, reject unknown
fields and non-finite numbers, enforce asset/waypoint size limits, and verify
the canonical digest returned by the SDK service.

## Failure behavior

- Network loss preserves the last saved draft and never submits a partial
  asset.
- Schema-version disagreement blocks validation and scheduling.
- Model or calibration mismatch invalidates the preview result.
- Missing camera evidence is displayed explicitly.
- A retired or digest-mismatched asset cannot be scheduled.
- A robot-side brake, failure, or watchdog result is shown as physical evidence
  and can never be relabeled as a successful action.
- OBS/LiveKit availability remains separate from motion validation.

## Accessibility and interaction

All joint editing and timeline operations must work with keyboard controls.
Exact values and validation states are available as text, not only color or
3D graphics. The 3D stage has pause, reduced-motion, reset-view, and camera
view controls. Mobile may inspect previews and reports; authoring requires a
desktop-width layout.

## Test requirements

Implementation follows test-driven development and covers:

- the `motion-studio` route and EAIC task order;
- strict SDK/website schema fixture parity and digest vectors;
- exact 14-joint expansion and degree/radian presentation;
- locked Our Sit start and return;
- refusal of support-joint, gain, limit, or S2 edits;
- deterministic timeline serialization;
- video confidence, occlusion, retargeting, and raw-upload deletion behavior;
- collision, derivative, camera, uncertainty, and missing-evidence displays;
- no Run control for unapproved states;
- scheduling only for matching physically approved digests;
- read-only camera behavior and OBS/LiveKit separation;
- keyboard and text alternatives;
- existing robot-stream, return-to-home, SDK-reference, lint, typecheck, and
  production-build checks.

## Delivery order

1. Land the SDK schema, digest vectors, model audit, calibration bundle, and
   offline validator.
2. Land the website schema fixtures and read-only Motion Studio editor/preview.
3. Add authenticated SDK-backed validation and immutable submission.
4. Add engineering characterization evidence.
5. Expose only physically approved assets to the existing scheduling flow.

Both repositories update documentation together. Neither repository publishes
an incompatible schema or user-visible capability alone.
# Historical proposal

Preserved during the October 14, 2026 branch consolidation. This August design records proposed Motion Studio behavior; it is not evidence of a deployed controller or public capability. Current website and SDK contracts take precedence.

