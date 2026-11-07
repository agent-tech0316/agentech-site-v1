# Master EAIC activation — November 7, 2026

The gateway now runs the published Master booking preparation and measured
head-result checks. Its selected PC SDK also contains the published head
feedback acknowledgement fix. Physical verification of booked movements is
still pending.

## Reviewed sources

- Website/runtime source: `fc988180e9b375a93bbd63cfbe870951b58c8e36`.
- Installed gateway release: `5c7579af60c8f39b6ef47acb8898d4543acb649a`, on
  `codex/master-eaic-repair-20261107`. This records the exact upgrade from
  the installed predecessor `60c32d9056bf1aca1f2fe5207e24c3076a8fd027`.
  Its runtime files match the current website repository's reviewed versions.
- PC SDK overlay: four client modules from
  `be8aa804d9fb47ac402fab5c92e05879ce198b71`. Every other selected SDK file
  retains its previous integrity pin; this is not a replacement of the full
  selected SDK with SDK main.

## Result

The release prepares Master bookings ahead of their start, retains the
viewer countdown, and binds dispatch to fresh command-specific readiness.
Measured shake sequences are accepted only with the requested signed angle,
whole cycles, every measured endpoint and dwell, verified centre return, and
unchanged ownership and other joint targets/gains. The SDK distinguishes
fresh native acknowledgement feedback from older frames without resending an
ambiguous head increment.

Activation used the deployment-wide guard and official dispatcher restart.
Five runtime files were replaced and all 28 compatibility pins verified. The
other 23 runtime files, including Navi and Aegis runners, retained their bytes.
The SDK selection changed under the same activation lock with a verified
rollback path. No robot controller, OBS configuration, or robot mode was
changed. No movement or new booking was sent; historical failures remain
failed.

## Verification

- Master gateway: 90 Python tests and 78 Node tests passed.
- Head SDK and connection tests: 135 tests and five subtests passed.
- Release/admission regression tests: 12 passed.
- Exact staged SDK: 31 preset/head variants planned with network and process
  access blocked; the retained measured shake replay passed, and an
  incomplete endpoint was rejected.
- Candidate and activated release: real dispatch/CLI smoke fixtures verified
  separate Master, Navi and Aegis routing without hardware or cloud claims.
- Post-activation: selected SDK pins verified; the replacement dispatcher
  remained running with the expected compatibility hashes.

## Open physical check

The operator reports Master lying down. Fresh read-only telemetry reports
`PASSIVE_DEFAULT`, inactive standing control and no active manipulation
publisher. Refusal of a standing preset in that state is expected. Complete
the current standing setup and operator checks before any physical test;
then obtain fresh native ownership/handoff evidence and run a supervised
booking. Connection health alone is not a standing-readiness attestation.

The literal reported “invalid gateway” message was not reproduced in the
local browser: the public heartbeat was online and the account showed no
new Master booking after November 5. Do not describe this activation as a
successful new physical booking or as proof that every reported UI error
has been reproduced and resolved.
