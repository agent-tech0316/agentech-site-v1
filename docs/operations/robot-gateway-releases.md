# Releasing the EAIC gateway

One bridge routes paid bookings to Master, Navi and Aegis. A robot-only
release may replace that robot's allowlisted runtime files. A shared bridge,
compiler or result schema requires a shared release, even when an installer
would copy identical bytes. For example, both Aegis and Navi import
`aegis-runner-result.py`. SDK directories, OBS settings and gateway credentials
are outside this installer.

1. Prepare a staging directory with the intended files under `scripts/`.
   Review a commit that contains each changed file. Specify the previous
   reviewed Git commit and the candidate commit as full hashes. Once the
   installed lineage has been recorded, the baseline must match its last
   source commit. Package all compatible dependencies before the first shared
   rollout; a robot-only package cannot bootstrap missing shared modules.
2. Generate the exact list with `node scripts/robot-gateway-release.mjs paths`.
   Use `inspect --gateway ROOT --stage STAGE --scope master --baseline-commit OLD --source-commit NEW --targets scripts/trusted-master-runner.py`
   to produce a **draft** JSON manifest. Review the target list, predecessor
   hashes and compatibility pins before approval. `inspect` does not verify
   Git, approve a release or install it.
3. Run `node scripts/robot-gateway-release.mjs verify --manifest MANIFEST --gateway ROOT --stage STAGE --repo CHECKOUT`.
   It compares the complete intended runtime with the pins, checks changed
   bytes against the exact reviewed Git revision, and exercises the candidate
   bridge's real launch path, actual Master/Navi admission modules and all
   three runner CLI entry points. The fixtures replace the robot, SSH, cloud
   claim and process spawn. Master receives the bound deployment/plan, Navi
   receives its booked plan and SHA-256, and Aegis receives its remote plan
   and final-result path. Readiness and execution are simulated for this check.
4. For an approved activation use the exported `activateGatewayRelease(manifest, {gateway,stage,repo}, {reload,verify})`.
   The default Windows check verifies local state and cleanup, process
   identity, Navi's owner lock and the real scheduling database through ten
   minutes ahead. The service account must supply the normal gateway
   environment. The `reload({rollback,gateway})` callback must use the official
   guarded restart. The `verify({rollback,compatibility,routes})` callback
   verifies selected bytes and the running bridge's identity/health. Throw on
   any failure. The guard retains its deployment-wide nonblocking lock across
   apply, restart, verification, and any rollback. A failed reload does not
   authorize interrupting a new booking. If rollback is blocked, the receipt
   remains `rollback-pending` with its exact backup under
   `.robot-stream-runtime/release-receipts/`.

`apply` is a **file installation only** for an operator who will separately
manage the process. Use the activation wrapper for an actual production
restart. A stale installer lock after a crash requires checking the owner,
receipt, prior bytes, booking state and running bridge before recovery.
Noncooperating legacy copy scripts do not participate in this lock. Route
every production gateway script update through the guard.

Windows can withhold the command lines for the two protected Master video
relays. Before exempting one, the guard verifies a session-0 Node child of
PowerShell launched by the running Windows Schedule service, ordered creation
times, and a single loopback listener owned exclusively by that process. Port
4173 must report the preview/proxy role and 4175 the primary role through the
local metadata-only `/health` endpoint. The response must contain the relay
counters and zero pending service calls. The guard checks the same PID,
creation time, ancestry and listener again after that request. An unreadable
Python process, an unclassified Node, changed identity or an unexpected
listener blocks activation. This check opens no robot, camera or video stream.
