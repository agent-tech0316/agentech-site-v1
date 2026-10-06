# Master SDK adjustment documentation — October 1 local review

Earlier local preview: http://127.0.0.1:3013/agentech-products/eaic-hub/view-sdk. This contract update did not restart the preview server or perform a new browser review.

This change is local only. No commit, push, deployment, robot command, or new physical qualification was performed. Existing physical-verification notes and simulation previews are preserved.

## Implemented website changes

- Retain the existing compact function rows, expandable details, sequential profile numbers, default/custom timing companions, parameter explanations, and copyable Python examples.
- Show 43 reference cards: 18 joint-adjustment functions, 7 posture/status functions, and 18 existing actions. The adjustment cards contain 233 request forms, including 22 offline torque-planning forms.
- Apply the existing Navi/Aegis purple `x` convention to every Master profile. Preserve quoted joint-map keys and fixed selectors. Explain degrees, relative versus absolute angles, seconds, degrees/second, N.m, and mapping/result inputs.
- Show `Agentech.stiff(level="hard")`, `Agentech.stiff(level="medium")`, and `Agentech.stiff(level="soft")`, with only the level field in its website parameter table and examples.
- List all 19 upper-body native joint effort magnitudes individually, with signed reference spans. Keep SDK torque request ceilings and live owner allowances distinct from those native model values.

## Earlier website verification

The September 30 sibling SDK working tree at `../agentech_sdk` was tested, including its pre-existing local edits. Its full Master offline suite passed: **2,780 tests plus 1,255 subtests**. The JUnit report has 4,035 test cases, zero failures, and zero errors. Report: `C:/Users/wesle/AppData/Local/Temp/master-sdk-offline-20260930.xml`. These are historical results for that checkout, not fresh verification of the October 1 SDK changes.

The September 30 profile audit imported and invoked the SDK methods with networking blocked. For that displayed catalog, **275 calls passed offline, 3 unbound undo results were correctly refused, and 5 status/center calls required live telemetry; zero calls were unexpectedly rejected**. Undo examples require the signed receipt from an actual earlier waist operation. Telemetry-required calls cannot be validated against an offline robot. Report: `C:/Users/wesle/AppData/Local/Temp/master-website-profile-audit-20260930.json`.

The earlier website SDK reference tests passed (14 tests), and the focused Master page checks covered profile numbering, all mapping forms, Python syntax, parameter schemas, colors, and the independent torque fixture. Master simulation-preview checks passed (4 tests). Production build and type validation were also checked for that revision.

The earlier 211 adjustment forms were inspected in the browser at desktop and 390-pixel mobile widths, in light and dark themes. The inputs used purple `x`, no profile line overflowed, and copying the stiffness example returned exactly the three level-only calls. No browser console errors were observed. Screenshot: `C:/Users/wesle/AppData/Local/Temp/master-sdk-torque-final-20260930.jpg`.

The broader 41-test page suite has two remaining login-page assertions: requests to `/login` on this local environment intentionally redirect to the homepage, so the login hero/canvas assertions inspect the wrong route. These are separate from the Master SDK checks. The stale Master safety-row count was corrected to two ordinary limits plus one highlighted completion-verification row.

These results verify implementation and offline contracts. They do not establish a new physical PASS. Existing physical evidence remains applicable only to its recorded robot, configuration, operation, and conditions; a copied example or successful dry-run does not extend that evidence.

## Specific runtime gaps and withheld extensions

1. **Standing head motion:** The SDK's `_execute_head_motion_sequence()` explicitly raises `standing head motion has no validated standing controller; no motion was requested`. The new standing `turn_head`, `return_head_to_center`, `center_head`, and `shake_head` cards are withheld from the displayed catalog. Their handoff forms remain in the internal catalog. Inactive seated forms are also withheld for this standing website scope. This does not discard existing seated physical test evidence.
2. **Position-only upper-body mappings:** Explicit `waist` plus `both_elbows` selects the coordinated position route. The eight historical position-only general-map forms remain internal drafts and are withheld from the website. The current torque-bearing arm route is implemented and requires active-owner per-joint admission; these position-only drafts do not describe that route.
3. **Proposed stiffness extensions:** The eighteen proposed side/duration profiles do not match the current SDK signature and are withheld. The current SDK implements level selection, but its modes have distinct behavior: hard applies the Heart gain profile at the admitted bilateral golf hold; medium restores standing defaults; soft returns both arms and waist. Medium and hard currently share numerical gains.
4. **Level-only hard stiffness live execution:** The requested level-only display binds correctly and passes dry-run. The actual SDK still requires its operator/support acknowledgements before a live hard transition, as well as the golf-hold controller admission. Those protections were preserved. The level-only hard example must remain a local draft until a runtime integration supplies the required verified admission; do not publish it as an unrestricted one-line live recipe. This is a specific integration gap, not a rejection of stiffness or of its existing physical evidence.
5. **Status and centering:** Read-only status needs a connected robot. Existing `center()` dispatches through the currently validated posture owner; the missing standing head controller must not be represented as a working standing centering implementation.

## Torque provenance and meaning

Source: saved native MC configuration captured September 17, 2026, `/agibot/software/mc_param/robot/lx2501_3_t2d5/robot_model.yaml`. Captured source SHA-256: `614b0644976204e4f458f2c3a9d6f92f9a463730ddcaec5bc1cbdd9748727670`. Independent fixture: `scripts/fixtures/master-native-model-effort.json`.

| Native joint group | Configured effort magnitude | Signed model reference span |
| --- | ---: | ---: |
| Waist yaw | 120 N.m | -120 to +120 N.m |
| Waist pitch / roll | 48 N.m | -48 to +48 N.m |
| Head yaw | 2.6 N.m | -2.6 to +2.6 N.m |
| Head pitch | 0.6 N.m | -0.6 to +0.6 N.m |
| Left / right shoulder pitch / roll | 36 N.m | -36 to +36 N.m |
| Left / right shoulder yaw / elbow / wrist yaw | 24 N.m | -24 to +24 N.m |
| Left / right wrist pitch / roll | 4.8 N.m | -4.8 to +4.8 N.m |

The signed model spans are ± the captured `max_effort` magnitudes. They are configuration references, not established continuous-duty ratings or universally admitted SDK command ranges. Adjustment `torque` supplies signed feedforward effort: positive assists the requested anatomical direction and negative resists it. The SDK request ceilings are ±24 N.m for shoulders, elbows and wrist yaw, and ±2.2 N.m for wrist pitch/roll. Live arm effort must also fit the active owner's admitted per-joint limits. The elbow setup allowance is 0–24 N.m and defaults to zero in the local SDK update. These values are distinct from the captured native MC model magnitudes.

## October 1 correction: all-joint torque and 20 N.m planning

The earlier global live ±2 N.m gate and individual-elbow setup restriction are removed by the current local SDK update. Existing per-joint request ceilings and the active owner's independently admitted limits still apply. The preserved `ArmEffortProfile` accepts 20 N.m on shoulders, elbows and wrist yaw within its per-joint bounds. The current `plan_upper_body_torque_assist` supports all fourteen arm joints plus all three waist joints using supplied per-joint bounds; that method remains offline planning.

The local website now contains 43 cards, including the offline torque planner's 22 profiles: seventeen individual joints, left arm, right arm, both arms, waist, and combined arms plus waist. Its six parameters match the current SDK: `arm_effort_nm`, `waist_effort_nm`, `max_additional_effort_nm`, `duration_seconds`, `ramp_seconds`, and `limit_source`. Every joint-adjustment card has its relevant joint torque reference inside its details. Both shoulder functions show pitch/roll ±36 and yaw ±24 N.m; both elbows show the ±24 N.m native model reference. Wrist pitch/roll retain their smaller ±4.8 N.m MC model reference. The complete adjustment catalog now has 233 profile forms.

Fresh pure-planner checks accepted ±20 N.m at the plateau and zero added effort at both endpoints for thirteen joints, covering 26 signed cases. All reports retained `liveEnabled=False` and `controlRequestWritten=False`. The four wrist pitch/roll axes were excluded from the 20 N.m claim because their captured model magnitudes are smaller. These supplied offline bounds are not authenticated live limits.

The SDK at `6ad3e9d` accepts `torque` on all eleven `adjust_*` APIs: the three individual-elbow selectors, bilateral elbows, both shoulders, both wrists, the right-wrist alias, waist and upper body. The website signatures, parameters and profile forms now match those implemented arguments. Absolute movement methods such as `move_arms_to` retain their existing signatures without a torque keyword. Nonzero waist torque is a valid dry-run input, but the distributed live waist position interface has no torque receiver and refuses it before commanding the robot.

Verification for this correction: 17 SDK-reference/profile tests, 22 focused rendered-page tests, typecheck and production build passed. The actual preview was inspected, including the left shoulder's three torque rows and the 22-profile all-joint planner, with no captured browser console errors. No SDK runtime changes, robot commands, deployment or new physical qualification were performed.

## October 1 physical evidence review

The historical record includes physical tests. Describing all Master adjustments or stiffness as only offline-tested would be incorrect. This review inspected saved run receipts and native command/state captures without connecting to the robot. The statements above about no new physical qualification describe the website editing session, not the absence of earlier physical runs.

| Operation or measurement | Saved physical evidence | Observed result |
| --- | --- | --- |
| All seven right-arm axes | `../agentech_sdk/agentech/robots/master/arm_adjustments/right_arm/evidence/2026-08-17-uninterrupted-twenty/run-summary.json` | Twenty physical steps completed with the same owner, adjusted holds and no recorded faults. |
| All seven left-arm axes | `../agentech_sdk/docs/master/archive/EVIDENCE_RECORDS.md`, August 21 left-arm section | Wrist pitch/roll/yaw, elbow and shoulder pitch/roll/yaw were physically exercised. The record retains the loaded shoulder-pitch settling boundary. |
| Waist yaw, pitch and roll | `../agentech_sdk/docs/master/evidence/standing-waist-public-yaw-qualification-2026-08-28.json`, `standing-waist-public-pitch-qualification-2026-08-28.json`, `standing-waist-roll-three-axis-qualification-2026-08-28.json` | Signed yaw/pitch trials and roll, two-axis and three-axis combinations passed their recorded endpoint checks, with native balance retained. |
| Both arms plus waist | `../agentech_sdk/docs/master/evidence/upper-body-movement-b-waist-2026-09-08.json` | All fourteen arm endpoints and waist yaw endpoint verified, balance retained, no fault. Joint completion times differed. |
| Shoulder torque above 20 N.m | `../Master Robot/output/upper-body-20260902/heart-startup-comparison/late-heart-four.samples.json` | Across 8,098 arm-state frames, left shoulder roll reached -35.01832 N.m and right shoulder roll +34.90109 N.m. All 4,123 corresponding native arm-command frames had zero added effort. These are measured transient joint loads under position/gain control. |
| Explicit elbow feedforward | `../Master Robot/output/movement-b-effort-warm-20260917/trial-analysis.json`, `../Master Robot/output/movement-b-negative015-20260917/three-trial-analysis.json` | Native effort delivery of +0.06 N.m and signed 0.15 N.m trials was captured. These receipts also retain incomplete settling and fault outcomes; delivery alone is not endpoint qualification. |
| Explicit waist-yaw feedforward | `../Master Robot/output/waist-force-20260922/r12-assisted-5nm-45deg-v1p8-lead0p02-20260923.json`, `r13-10nm-local-arm-20260924-c.json` | +5 N.m outward run verified its measured endpoint; +10 N.m delivery and physical movement were captured. The +10 capture has no complete endpoint-pass receipt. |
| Hard stiffness on all fourteen arm joints | `../Master Robot/output/golf-yaw-20261001/slow-waist-preparation-20261001T131224-0700.json`, `hard` section | `succeeded=true`, `stiffnessVerified=true`; native gains changed from 12/1.5 to shoulder pitch/roll 100/1, shoulder yaw/elbow 50/1 and wrists 30/1. The separate arm-entry endpoint remained unverified and its warning is retained. |

The historical audit confirms physical all-joint adjustments and measured shoulder torque above 20 N.m. It did not locate a saved native receipt proving an explicit added-feedforward request of 20 N.m on an elbow or every generalized arm joint. This is a bounded evidence-search result, not a claim that the operator never performed such a run. The captured native elbow model magnitude is 24 N.m; request acceptance, measured joint effort and qualified feedforward delivery remain separate evidence. This contract update performs no new physical qualification.

## Current compact torque contract

The torque parameter heading shows its name, type, signed SDK input range and
Details control. The range remains visible with Details closed. Wrist rows
separate yaw from pitch/roll; the waist range is marked planning only. Native
model ranges stay in the two-column joint tables. Public preview text contains
no "legacy" or wrapper labels.

All eleven adjustment APIs show their implemented optional `torque` argument without development, proposed or integration labels. The eight recently extended families use independent maps for multiple joints. Their historical selector and timing families remain intact, and the numerical movement examples continue to omit optional effort. The current audited catalog includes torque; the September 30 handoff fixture and proposed stiffness/general-map profiles remain distinct historical drafts. The total stays at 43 function cards and 233 adjustment profile forms.

All fourteen displayed `adjust_upper_body` profile forms now assign torque only to supported arm receivers: `left_arm={"elbow": ...}` and `right_arm={"elbow": ...}`. The `both_elbows` motion selector is not a torque group key. Waist position stays in the coordinated request. Nonzero waist torque is described separately as dry-run planning because the distributed SDK has no waist torque receiver. Historical native waist-yaw assistance is a separate implemented route; it does not establish live support for this SDK keyword.

## October 1 focused verification

A minimal regression first failed on the stale development status (`adjust_both_elbows: implemented torque must be available`). After the correction, all **24** profile, SDK-reference and simulation-preview tests passed against both the temporary `6ad3e9d` snapshot and the updated local SDK checkout at `C:/sdk-torque-20261001`. The fresh audit of that updated checkout bound all **323 calls**: **315 offline passes**, **3 expected unbound undo refusals**, **5 live-telemetry-required calls**, and **zero unexpected rejections**. Report: `C:/Users/wesle/AppData/Local/Temp/master-website-profile-audit-20261001.json`.

The website audit validates signatures and dry-run payloads against the inspected SDK source. SDK live admission changes are verified separately in the local SDK checkout; this website audit does not prove deployment, active owner allowances or physical torque qualification. Typecheck and production build are separate integration checks for this update; the earlier results above apply to their recorded revision.

## Reproduce the current offline checks

```powershell
$env:MASTER_SDK_ROOT = 'C:/sdk-torque-20261001'
$env:MASTER_SDK_PYTHON = 'C:/Users/wesle/OneDrive/Documents/Agentech/agentech_sdk/.venv/Scripts/python.exe'
node --test scripts/master-adjustment-profiles.test.mjs scripts/sdk-reference-consistency.test.mjs scripts/master-simulation-previews.test.mjs
node scripts/audit-master-sdk-profiles.mjs $env:MASTER_SDK_ROOT 'C:/Users/wesle/AppData/Local/Temp/master-website-profile-audit-20261001.json'
npm.cmd run typecheck
npm.cmd run build
```

Run the full SDK suite from `../agentech_sdk` with its own interpreter:

```powershell
& '.venv/Scripts/python.exe' -m pytest tests/master -q --junitxml=C:/Users/wesle/AppData/Local/Temp/master-sdk-offline-20260930.xml
```

## Historical torque integrations

### Local removal of the fixed live cap

The isolated SDK checkout at `C:/sdk-torque-20261001`, based on `6ad3e9d`,
removes the fixed ±2 N.m live gate from adjustment validation, owner-limit
normalization, elbow SDK setup, current-hold bootstrap and runner arguments.
Recorded request ceilings remain ±24 N.m for shoulders, elbows and wrist yaw,
and ±2.2 N.m for wrist pitch/roll. Active-owner admission, receiver and publisher
limit checks, identity/nonce checks, fault reporting and smooth release remain.

Focused SDK checks passed: 571 tests and 14 subtests. Separate integration
checks passed: 210 tests and 107 subtests. The final range regression passed
64 cases, including signed ±20 native-frame delivery, ±2.2 wrist delivery,
changed owner limits and refusal before publication. These runs use synthetic
telemetry and transport; they do not command a robot.

The final website checks passed: 20 SDK-reference/profile tests, nine focused
rendered-page tests, typecheck and the production build (112 pages). The fresh
audit bound all 323 displayed calls: 315 offline passes, three expected undo
refusals, five calls requiring live telemetry, and zero unexpected rejections.
The actual local browser showed the shoulder's ±24 N.m request ceiling with
compact torque controls and no captured console errors. Screenshot:
`C:/Users/wesle/AppData/Local/Temp/master-torque-cap-removed-preview.png`.

No commit, push, robot deployment, activation or physical trial was performed.

Earlier source review found implemented publishing connections in the September 17 installed arm runtime (`standing_right_arm_runtime.py`, effort application before publishing), the native waist-yaw modifier and golf assist, and `../Master Robot/local_development/waist_yaw_effort/ros_endpoints.py` plus `ros_relay.py`. The general ROS component creates a joint-group subscription and publisher and invokes the effort output stage; it was exercised on private localhost topics. These historical integrations are preserved. The current eleven adjustment signatures are supported by the inspected SDK source and its offline audit; live waist effort remains the specific receiver gap described above.

## October 1 local display verification after the newest pushes

The isolated SDK checkout now includes published commit `4e357d5` and retains
the local fixed-cap removal. Fresh focused SDK checks passed 342 tests.

The website keeps the existing cards, accordions and numbered profiles. Setup
shows `Agentech.use("master")` without controller configuration fields. Normal
arm examples use `torque=` directly, including signed 20 N.m examples and
separate wrist-axis maps. Displayed code adds no `dry_run` or planning-budget
flags. Normal waist profiles use position control, and combined upper-body
examples put additional torque in supported arm maps. This display change
does not change the standalone SDK constructor's execution-mode default.

Fresh website verification passed 21 reference/profile tests, 13 focused
rendered-page tests, typecheck and the production build (112 pages). All 323
displayed calls bound to the updated SDK: 315 offline passes, three expected
unbound undo refusals, five live-telemetry-required calls and zero unexpected
rejections. The local browser showed the compact shoulder torque description
and normal example with no captured console errors. Screenshot:
`C:/Users/wesle/AppData/Local/Temp/master-sdk-normal-example-preview.png`.

Preview: `http://127.0.0.1:3013/agentech-products/eaic-hub/view-sdk`.
No commit, push, robot deployment, activation or physical trial was performed.

The subsequent display correction puts `Range:` directly in all eleven torque
parameter headings and removes duplicate range text from their explanations.
All 21 reference/profile tests, 13 rendered-page tests, typecheck and production
build passed again. The browser confirmed the shoulder range stays visible
with Details closed and recorded no console errors. Screenshot:
`C:/Users/wesle/AppData/Local/Temp/master-sdk-visible-torque-range.png`.

All eleven relative adjustment functions now show `Range: Dynamic · current
position` on every relative angle field, including elbow `position`, named
wrist/waist axes and upper-body maps. Details explain that available travel
changes after each adjustment; shared angles must fit every selected joint.
Absolute-target methods and the waist measured-start check retain their
separate contracts. Torque ranges are unchanged. The updated checks passed
22 reference/profile tests, 14 rendered-page tests, typecheck and the production
build. Browser screenshot:
`C:/Users/wesle/AppData/Local/Temp/master-sdk-dynamic-degree-range.png`.

The current display replaces that temporary Dynamic label with numerical
per-joint bounds minus the current angle, plus a worked remaining-range
example. Arm bounds use public SDK coordinates, including the existing 3°
elbow and 8° wrist-roll margins. Shoulder-roll command bounds exclude the
separate measured load-sag allowance. Waist bounds use calibrated native
offsets, include the existing per-call constraints and are described as
approximate because of step rounding. These are reference calculations;
the page has no live joint-position snapshot.

All public torque units now use `N·m`, including ranges, descriptions, joint
tables, profiles and example comments. Master range labels use `(Range: …)`.
Fresh checks passed 22 reference/profile tests, 15 rendered-page tests,
typecheck and the production build. Browser verification recorded no console
errors. Screenshot:
`C:/Users/wesle/AppData/Local/Temp/master-sdk-numeric-ranges-correct-unit.png`.
No SDK behavior, robot state, commit or remote publication was changed.

### Optional types and stiffness explanations

Master parameter headings now omit Python's `| None` spelling; the SDK
signatures and optional-input behavior are unchanged. Torque appears as
`torque number (Range: -24 to +24 N·m)` where that joint's range applies.
Each stiffness profile has its own explanation and actual stiffness values.

Fresh GitHub inspection at `4e357d508b8f03c475d77c0f1363b46cfbc6e22c`
confirms Hard still uses the admitted golf hold, Medium uses the same arm
gains as Hard with default-pose requirements, and Soft returns both arms
and waist while using lower arm gains. The website states these current
behaviors. Three distinct levels that hold any current pose are not yet
implemented in this change; the question about extending SDK scope remains
pending.

Fresh checks passed 22 reference/profile tests, 16 rendered-page tests,
typecheck and the production build. Browser verification showed the clean
torque type and all three stiffness explanations, with no console errors.
Screenshots:
`C:/Users/wesle/AppData/Local/Temp/master-sdk-clean-torque-type.png` and
`C:/Users/wesle/AppData/Local/Temp/master-sdk-stiffness-level-explanations.png`.
No commit, push, deployment or physical robot command was performed.

### 2026-10-05: Custom Movements and display cleanup

The Master page now has four groups: Joint Adjustment Commands, Posture
Commands, Action Commands, and Custom Movements. Custom Movements contains
one Golf card (`golf_put`) and one Close Door card (`close_door`), with six
profiles covering default/custom golf timing and left/right door timing.
Published signatures were checked from GitHub `origin/main` at `8594975`.
The removed `door_close` and `putting` aliases are not displayed.

Source grouping, rendered tests and browser DOM inspection all confirm
45 unique Master cards and no duplicates. Existing profile wording now
capitalizes Degrees in labels and sentence openings while preserving Python
identifiers. Selected values share the purple x color in all robot profiles.
Parameter headings show each allowed-values list only once.

The project `npm test` command, 32 SDK page checks, typecheck and production
build passed. The broader 53-test page run exposed two unrelated login-page
checks (headline and warm canvas); those routes were not changed. An initial
example-count assertion was updated to include the two new movement cards.
Browser inspection verified all six movement profiles and no console errors.
Preview screenshot:
`C:/Users/wesle/AppData/Local/Temp/master-sdk-custom-movements-preview.png`.
The local preview remains on port 3013. Publication awaits the user's requested
preview review; no commit, push, deployment or robot command was performed.

### 2026-10-05: Compact upper-body profiles and responsive parameters

The shared parameter layout keeps each name/type together, aligns status and
Details controls, and renders multi-axis ranges in labeled rows. Numerical
bounds and current-position formulas are unchanged. Allowed values appear
once. Short axis labels use a compact column; full arm tables keep every row
aligned, including the elbow.

The public Upper Body card now has four representative profiles: One arm,
Both arms, Arms + waist, and Waist + both elbows. Optional duration is shown
within each profile instead of duplicating default/custom timing variants.
The six real parameters include right_arm and left_arm, with all seven joint
keys accepted per arm and all three waist axes. The card explains that general
arm-map movement requires nonzero arm torque, while position-only general maps
return plans. The torque range covers shoulder/elbow/wrist yaw separately from
wrist pitch/roll; nonzero waist torque still has no live receiver.

The fetched GitHub main at 35e68a0 was inspected for the upper-body signature
and dispatch behavior. The 18 profile/contract checks include the actual
offline SDK call audit. All 34 focused rendered-page checks, npm test,
typecheck, and production build passed. Browser checks covered desktop,
Master at 320/390 px, and Aegis/Navi at 390 px, with no horizontal page or
visible parameter-row overflow. Console errors were absent.

Preview: http://127.0.0.1:3013/agentech-products/eaic-hub/view-sdk
Screenshots:
`C:/Users/wesle/AppData/Local/Temp/master-sdk-parameter-layout-desktop.png`
and `C:/Users/wesle/AppData/Local/Temp/master-sdk-parameter-layout-mobile.png`.
This supersedes the earlier elbow-and-waist-only website display. SDK runtime
behavior was not changed. Publication still awaits preview review; no commit,
push, deployment, or physical robot command was performed.

### 2026-10-05: Approved publication checks

The user approved the local preview and authorized publication. The release
was prepared from website main at 25ba7c1 with only the SDK display,
documentation, and related tests. Unrelated local work was preserved.
The frozen-lockfile install, focused ESLint, typecheck, production build,
full project test command, and 34 SDK page checks against the production
build passed. The SDK call audit used the current SDK checkout at 35e68a0.
The JSX quotation escaping correction has no visible display change.
Vercel deployment and public-page verification follow the push.
