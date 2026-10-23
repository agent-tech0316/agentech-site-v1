# Master scheduled upper-body execution

The EAIC Hub Code Certification page now accepts Master programs through the
normal reviewed-submission and robot-slot flow. Camera-only Master Live Test
remains separate and cannot authorize execution. Walking commands are excluded.
The Master SDK and robot controller are unchanged.

## Existing SDK and raw-mode behavior

`scripts/master-command-contract.json` is the shared web/compiler allowlist.
It covers 21 existing SDK calls for bilateral guidance, shoulder/elbow/wrist
adjustments, waist and coordinated upper-body adjustments, absolute/mirrored arm
poses, existing presets, and explicitly requested restoration.

An explicit `Agentech.enter_stand_hand_guide(side="both")` is recommended but
optional. At execution, the runner reuses a verified current bilateral raw
`STAND_DEFAULT` owner or enters guidance through the existing SDK before the
first adjustment. It verifies mode and owner, then checks the booking deadline
again before sending the requested adjustment. Entry failure prevents the
adjustment. It never substitutes `MANIPULATE_DEFAULT`.

The separate proposed rule for switching from raw guidance to presets is
undecided. This integration does not add an automatic full return or require a
new user-authored restore line for that transition.

`movement_a` is not exposed as an executable method: the current SDK public
replay has no live transport. The historical launcher is not substituted.
Certification rejects it before booking. Existing SDK documentation is retained.

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

A healthy completed program may hand off its retained, freshly verified
bilateral raw-mode hold. The next session cannot start before the prior booked
window ends and must perform fresh admission. No neutral-pose restoration is
claimed. Explicit owner release and uncertain handoffs remain separate evidence.

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

Deploy the bridge together with `master-session-gateway.mjs`,
`robot-stream-session-policy.mjs`, `robot-session-execution-result.mjs`,
`compile-robot-plan.py`, `master-command-contract.json`, `master_gateway_spec.py`,
and `trusted-master-runner.py`. The installed gateway and the development tree
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

The focused suites cover optional/automatic mode entry, expiry during entry,
invalid plans, target lease conflicts, timeouts, faults, receipt identities,
view-only rejection, booking authorization and billing, and the normal UI path.
These checks and SDK dry runs do not establish physical qualification.
