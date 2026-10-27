# Master scheduled upper-body execution

The EAIC Hub Code Certification page now accepts Master programs through the
normal reviewed-submission and robot-slot flow. Camera-only Master Live Test
remains separate and cannot authorize execution. Walking, head control, bow and
seated actions are excluded from scheduled execution.
The Master SDK and robot controller are unchanged.

## Existing SDK and raw-mode behavior

`scripts/master-command-contract.json` is the shared web/compiler allowlist.
It covers 50 reviewed methods, grouped in the Master editor and View SDK:

| Group | Accepted method names |
| --- | --- |
| Guidance, arms and waist | `enter_stand_hand_guide`, `adjust_right_shoulder`, `adjust_left_shoulder`, `adjust_right_elbow`, `adjust_left_elbow`, `adjust_both_elbows`, `adjust_elbow`, `adjust_right_wrist`, `adjust_left_wrist`, `adjust_wrist`, `adjust_upper_body`, `adjust_waist`, `return_waist_to_neutral`, `undo_waist` |
| Arm poses and upper-body sequences | `move_arms_to`, `move_elbows_to`, `move_mirrored_arms_to`, `mirror_arm_pose`, `movement_b`, `showcase`, `close_door` |
| Retained right-arm preset | `movement_a` |
| Native standing gestures | `wave`, `blow_kiss`, `raise_hand`, `salute`, `handshake`, `high_five`, `chest_wave`, `clap`, `cross_arms`, `hug`, `cheer`, `wave_goodbye`, `raise_hands`, `scratch_head`, `heart` |
| Golf and SDK stiffness controls | `golf`, `golf_put`, `stiff` |
| Restore and owner controls | `restore_stand_hand_guide`, `restore_stand_default`, `accept_current_hold`, `release_returned_hold`, `release_return_hold` |
| Status and pause | `stay`, `status`, `get_status`, `get_motion_readiness`, `action_catalog` |

Existing SDK parameter, torque, timing, operator acknowledgement and mechanical
support requirements remain enforced. `undo_waist` accepts only a result captured
from a successful `adjust_waist` in the same program, such as
`waist_move = Agentech.adjust_waist(yaw=2)` followed by
`Agentech.undo_waist(waist_move)`. Pasted result maps and return-to-neutral results
cannot supply undo evidence. The full SDK documentation remains complete;
documentation of a method does not add it to this execution allowlist.

An explicit `Agentech.enter_stand_hand_guide(side="both")` is required before
arm or waist adjustments. Certification and the trusted plan validator reject
omitted or late entry before any command runs. Only the explicit entry call may
enter guidance through the existing SDK; later adjustments recheck that same
owner and never bootstrap another one. Restore/release and native-mode operations
require another explicit entry before subsequent adjustments. Booking expiry,
controller faults, and owner changes prevent further dispatch.

Native standing presets require fresh native-ready standing evidence. The
separate proposed rule for switching from raw guidance to presets is undecided.
This integration does not add an automatic full return or require a new
user-authored restore line for that transition. Incompatible state is refused;
acceptance by the static checker does not establish current native readiness.

The reviewed-source call `Agentech.movement_a()` is connected to the retained SDK
right-arm Movement A preset through the gateway adapter. It preserves the SDK
source and its existing ownership checks. This path retains a verified Movement A
owner in native `MANIPULATE_DEFAULT`; it is distinct from bilateral raw guidance.
It does not claim a completed endpoint when the underlying call or verification
fails. The editor offers this example for the normal review and scheduling flow:

```python
from agentech import Agentech
Agentech.use("master")
Agentech.movement_a()
```

Loading or copying an example does not execute it. A reviewed submission, an
approved booking and fresh execution-time checks are still required.

## Runtime boundary

Reviewed source is parsed into an inert plan; raw Python is never executed.
The gateway binds that plan to the booking, submission, source and plan hashes,
and an execution attempt. The runner verifies the selected SDK file hashes,
revalidates calls through the actual SDK dry-run methods, acquires an exclusive
target lease, and checks expiry/cancellation before each command.

Expiry closes command admission. It does not kill the persistent controller,
send a generic stop/damping command, or replace a held target. An in-flight SDK
operation can finish after the deadline; the receipt records the overrun. Failed
or ambiguous commands are not retried. Final hold faults are execution failures.

A healthy completed program may hand off a freshly verified continuous bilateral
raw-mode hold, a continuous retained Movement A owner, or verified native standing
without an active publisher. Retained owners require the same owner identity;
native standing requires initial and final native-state evidence without an
invented publisher identity. Owner release is reported separately and truthfully.
The next session cannot start before the prior booked window ends and must perform
fresh admission. A retained owner does not itself claim neutral-pose restoration.

The existing OBS/LiveKit path remains in use; this change does not reconfigure
encoders, rooms, camera services, or OBS scenes.

## Prepared configuration and activation

`scripts/prepare-master-gateway.py` prepares a disabled manifest with the chosen
local SDK root and file hashes. It contacts no robot and edits no SDK files:

```powershell
python scripts/prepare-master-gateway.py --sdk-root <current-sdk-root> --host <Master-address> --output <new-manifest-path>
```

Website booking configuration:

- `AGENTECH_MASTER_EXECUTION_ENABLED=true`
- `AGENTECH_MASTER_GATEWAY_PROTOCOL=master-arm-session-v1`

Gateway configuration:

- `AGENTECH_MASTER_DEPLOYMENT_FILE`: trusted manifest path; activation requires
  its `enabled` field to be true.
- `AGENTECH_MASTER_SSH_PASSWORD`: environment-only credential.
- Existing Supabase, OBS, Python and bridge configuration remains required.

These flags describe deployment configuration, not live physical readiness.
An unconfigured Master booking is refused before charging booking credits.

Master sessions default to the shared external OBS/LiveKit camera used by Navi.
Choosing **Robot cameras** opens the dedicated Master camera wall and individual
robot-camera views; choosing **External camera** returns to the shared feed.

The gateway allows 180 seconds for the SDK client acknowledgment while preserving
the SDK's default motion speed and force. Adaptive trajectories and settling can
outlast the SDK client's short default wait. A timeout still fails the session;
relative adjustments are never replayed automatically.

After a failed Master session, a separately reviewed and booked program containing
only `Agentech.restore_stand_hand_guide()` can use the SDK's qualified fault recovery.
The gateway binds it to the failed attempt's exact request ID and publisher PID;
the SDK must freshly admit that retained owner before dispatch. The original failed
receipt remains failed. Later sessions become eligible only after the new restore
verifies both arms and the waist and fresh post-release native ownership.

Master receipts retain complete SDK endpoint, warning, and timing evidence within
a 16 MiB limit. Previously finalized receipts rejected by the generic 512 KiB
limit are read and identity-checked once under the Master limit; no command is
replayed and malformed or mismatched results still fail closed.

Deploy the bridge together with `master-session-gateway.mjs`,
`robot-stream-session-policy.mjs`, `robot-session-execution-result.mjs`,
`compile-robot-plan.py`, `master-command-contract.json`, `master_gateway_spec.py`,
`trusted-master-runner.py`, and `master-movement-a-adapter.py`. The installed gateway and the development tree
already differed before this work; reconcile and back up the actual selected
candidate before activation. Do not overwrite unrelated Navi changes or restart
an active session. Publication, activation, and physical testing are separate
from local verification.

## Verification

```powershell
npm.cmd run test:master-gateway
node --test scripts/robot-stream-bridge.test.mjs scripts/navi-session-handoff.test.mjs
npm.cmd run typecheck
npm.cmd run build
```

The focused suites cover mandatory explicit mode entry, expiry during entry,
invalid plans, target lease conflicts, timeouts, faults, receipt identities,
view-only rejection, booking authorization and billing, and the normal UI path.
These checks and SDK dry runs do not establish physical qualification.
