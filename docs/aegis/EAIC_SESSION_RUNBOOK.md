# AEGIS EAIC qualification and evidence runbook

This is the complete source-to-result procedure for AEGIS `192.168.4.88`.
Customer Python never goes to the robot. The Gateway translator accepts only
literal supported calls, produces a reviewed JSON plan, hashes it, and stages
that inert plan plus trusted runner modules.

## 1. Pin and verify both repositories

```powershell
git clone https://github.com/agent-tech0316/agentech_sdk.git
git clone https://github.com/agent-tech0316/agentech-site-v1.git

cd agentech_sdk
git switch main
git pull --ff-only origin main
python -m pip install -e ".[aegis]"
$sdkCommit = git rev-parse HEAD
python -m unittest discover -s tests -v

cd ..\agentech-site-v1
git switch main
git pull --ff-only origin main
npm ci
$gatewayCommit = git rev-parse HEAD
npm test
npm run lint
npm run typecheck
npm run build
```

Every command must exit `0`. This is an offline gate, not physical evidence.
Record both commits, package versions, FF build, review ID, submission ID,
session ID, correlation ID, AEGIS D1 model, and UTC/Pacific timestamps.

## 2. Compile tomorrow's canonical source offline

```powershell
$source = 'docs/aegis/examples/aegis-29-command-qualification.py'
$plan = '.robot-stream-runtime/offline-aegis-29.plan.json'
New-Item -ItemType Directory -Force '.robot-stream-runtime' | Out-Null
python scripts/compile-robot-plan.py $source OFFLINE-REVIEW-ID $plan
python -c "import json; p=json.load(open(r'$plan')); print({'version':p['version'],'model':p['robot_model'],'commands':len(p['commands']),'source_sha256':p['source_sha256'],'profile':p['device_profile']})"
Get-FileHash -Algorithm SHA256 $source
Get-FileHash -Algorithm SHA256 $plan
```

Expected output:

- plan version `2`, model `aegis`, exactly `29` literal calls;
- device `192.168.4.88`;
- `battery_present=true`, source `ecal:battery_state.power`;
- source hash matches and customer source text is absent from the plan;
- turn pair is `+90/-90` at positive `60 deg/s` magnitude;
- yaw/pitch/roll pair is `+0.25/-0.25 rad` at `0.30 rad/s`.

The translator rejects variables, loops, expressions, unknown names/keywords,
nonfinite or out-of-range values, invalid resolved diagonals, and conflicting
turn forms. The trusted runner validates the whole plan again before dispatch.

## 3. Physical preflight

Stop unless every item is true:

- booked session and explicit operator authorization;
- flat nonslip marked 2 m by 2 m area, robot near center;
- OBS and Camo/external camera show changing frames and the complete boundary;
- no duplicate OBS or Gateway bridge process;
- handheld controller and separate emergency path ready;
- no other client owns motion;
- SDK/Gateway commits match the reviewed versions;
- Gateway clock shows correct UTC and Pacific conversion.

Velocity/time profiles are open-loop; they do not promise exact distance.
Watch the physical boundary and stop if acceleration, braking or traction makes
travel larger than expected.

## 4. Tomorrow's ordinary 29-call sequence

Use [`aegis-29-command-qualification.py`](examples/aegis-29-command-qualification.py)
without editing it after review. It stands once, qualifies squat, returns to
stand once, performs paired translations, low-gait pairs, `+90/-90` turns,
bounded visible attitude pairs, stay, integer battery percentage and final sit.

Ordinary actions do not repeatedly call stand. The robot stays upright between
standing actions. Squat uses `dog_task`'s localhost command channel without
replacing `/dev/input/js0` or restarting `dog_task`; success requires unchanged
physical-controller ownership.

Jump, backflip, stop and emergency stop are separate supervised recordings:

- jump/backflip need full landing clearance and individual video;
- stop must zero velocity while preserving supported posture/controller;
- emergency stop must send command `90` once, immediately enter DAMPING and
  latch SDK motion until a successful stand recovery.

Do not express “stop during motion” as two sequential customer calls: the first
motion call is synchronous and would finish first. Use a separate trusted
operator safety channel for the interruption capture.

## 5. Gateway and OBS operation

During the authorized window, run the deployed bridge normally. For a bridge
repair use:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/restart-robot-stream-gateway.ps1 -ConfirmNoDueSession
```

That script restarts only the exact Gateway bridge process. It never restarts
Windows, the robot, OBS or Camo. The watchdog retains one bridge and one OBS
process; duplicate OBS fails closed instead of competing for the camera. The
default bridge poll is `1000 ms` and may be configured down to `500 ms` without
creating duplicate capture owners.

Before passing `-ConfirmNoDueSession`, verify that Hub/Supabase has no due,
staged or active booking. Both restart entry points check local session and
cleanup state, reject active trusted runners, require one persistent watchdog
and one bridge at the exact configured path, and wait for a replacement PID.
Expired bookings that never launched do not block a repair solely because
their execution result still says `pending`.

For an authorized OBS profile change, first check its read-only status:

```powershell
node scripts/obs-stream-status.mjs
.\scripts\configure-robot-stream-low-latency.ps1 -Apply -ObsProfileDirectory "<active profile directory>"
```

The configuration command requires an inactive stream and recording, verifies
the selected active profile and its Advanced NVENC CBR encoder, saves a backup,
then restarts OBS hidden. It verifies 1280x720 at 30 fps and reads back the
3500 kbps configuration, one-second keyframes, preset `p3`, tune `ull`, disabled
multipass/lookahead and zero B-frames. It does not start a stream. Changing these
settings requires an authorized maintenance window; publication of this script
does not apply it to a Gateway. Measure actual glass-to-glass latency during a
separately authorized session.

The focused sources [stand preflight](examples/aegis-stand-preflight.py),
[backward smoke](examples/aegis-backward-smoke.py), and
[forward/backward smoke](examples/aegis-forward-backward-smoke.py) can be compiled
for review with the same offline translator. They are separate supervised
checks, not evidence that a physical run has passed. The trusted runner rejects
missing, non-finite or boolean locomotion measurements and persists failures;
its minimum displacement check does not certify precise path tracking.

## 6. Expected trusted result

```json
{
  "schema_version": 1,
  "outcome": "completed",
  "command_count": 29,
  "completed_count": 29,
  "error": null
}
```

The result must include matching IDs, hashes, timestamps, device profile,
Diary path and 29 contiguous records. The runner intentionally stops at the
first exception, preserves it, attempts a normal stop, omits later commands,
and persists `failed`. It must never mark Hub complete from compilation alone.

## 7. Evidence index

For each action retain the exact command/parameters, UTC/Pacific time, model,
structured `status/result/error/logs`, Diary/raw log, readable screenshot and
external video. For the chain retain review PASS, schedule, Gateway claim,
runner start/result, capture return, and Hub `Completed`/Gateway `finished`
using one ID tuple.

| Delivery item | Conclusion | Evidence | Time | IDs | Versions |
| --- | --- | --- | --- | --- | --- |
| SDK/L0.5 action | PENDING_LIVE | per-action log/JSON/screenshot/video/Diary | TBD | submission/session/correlation | SDK/Gateway commits |
| EAIC Hub chain | NOT_COVERED until captured | review/schedule/claim/result/Hub/Gateway | TBD | same tuple | Gateway commit |
| Device model/adapter/wrapper | PENDING_LIVE | connection/state/error/recovery logs + video | TBD | same tuple | SDK commit |
| Primary 17 rows | PENDING_LIVE | direct links for every conclusion | TBD | same tuple | both commits |

Registration, heartbeat, lease, `last_seen` and reconnect remain `NOT_COVERED`
unless actual platform evidence is attached.

## 8. Session 38 root cause and repairs

Session 38 proved review, scheduling, compilation, delivery and Diary logging.
It failed because `stand()` returned before authoritative state stabilized;
`squat()` then began during the transition, chose the wrong controller state
and timed out waiting for `18/17`. The fail-fast runner correctly omitted later
commands, so that session did not test forward/backward.

The repairs wait for stable stand/squat state, perform only bounded owned-route
recovery, restore the physical controller, validate resolved profiles, use the
working robot-side heading route, separate normal stop from DAMPING, issue only
one emergency command, read real eCAL battery percentage, and make the trusted
runner result authoritative for Hub status. Earlier `0.20 m/s` translation was
also too small to be visually diagnostic after acceleration; tomorrow uses the
live-visible paired values while external video enforces containment.

## 9. Session 43 focused squat rerun

Use [`aegis-session-43-squat-qualification.py`](examples/aegis-session-43-squat-qualification.py)
without retyping it. It compiles to nine calls. `emergency_stop()` is terminal,
so the runner records `cleanup_skipped` instead of sending a duplicate stop.

Session 43 submission `agentech-20260825233939-p16kmc` compiled correctly and
completed `stand()`, but `squat()` ended at public state `51/999`. The failure
was in the SDK Adapter, not the translator: after stand, public state was
`18/1` while `dog_task`'s private action cache was stale, so action `106`
selected its `51/0` fallback. The repaired SDK sends native no-motion action
`138` once to synchronize that cache, then action `106` once to enter `18/17`.

The rerun passes only with stable and retained `18/17`, unchanged controller
owner PID, `dog_task_restarted=false`, completed squat movements, one final
e-stop, a complete Diary/result, and synchronized video. The original Session
43 remains failure evidence and must not be relabeled PASS.
