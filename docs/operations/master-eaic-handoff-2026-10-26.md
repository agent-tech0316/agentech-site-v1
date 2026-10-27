# Master EAIC integration and test handoff — October 26, 2026

Physical testing stopped at the operator's request. The operator reported
powering off Master after session 91. The final recorded run verified both arms
and all three waist axes restored and the arm owner released. Do not schedule
or execute an overnight test from this handoff.

## Start with the existing results

The SDK repository holds the canonical
[test matrix and next-session checklist](https://github.com/agent-tech0316/agentech_sdk/blob/main/docs/master/eaic-test-record-2026-10-26.md)
and [sanitized receipt ledger](https://github.com/agent-tech0316/agentech_sdk/blob/main/docs/master/evidence/eaic-live-tests-2026-10-26.json).
Reuse those exact-case results instead of repeating completed baseline work.
They retain failures, command parameters, version identities, measured timing,
full-restore evidence, and receipt hashes. A changed timing path still needs its
targeted regression, and current physical readiness is always a fresh check.

| Evidence | Result |
| --- | --- |
| Left-arm sequence 72 | 14/14 commands passed, including full restore; older shoulder/elbow speed defaults. |
| Bilateral elbows at default 20°/s planned peak, 90/91 | Both programs passed 4/4; two adjustment calls decreased from 19.875 s to 16.281 s. Some improvement was variation in right-elbow settling. |
| Waist pitch +15°, 89 | Adjustment and full restore passed; pitch error +0.192° within existing tolerance. |
| Waist roll +15°, 80; corrected full restore, 83 | Outward roll and later full restore passed separately. Old undo/return failures are retained. A single roll-plus-restore program remains pending. |
| Both elbows +45° with waist yaw +30°, 88 | 3/3 passed, including full restore. Recheck after the new shared transport integration. |
| Bilateral absolute shoulder roll +30°, 73 | **Open:** left endpoint missed ±0.25° tolerance. Full restore 74 succeeded. Do not call this case qualified. |
| External-camera viewing | EAIC LiveKit video was visible at 1280×720 during scheduled runs. OBS session 88 reported zero output-skipped frames and no congestion/reconnection. This does not measure camera-to-browser latency. |

**Explicit/custom speed and effort/torque testing remain pending through real
EAIC scheduling.** Default speed is not proof of custom-speed support; historical
SDK golf/effort runs do not qualify those operations through this integration.
Wrist default stays 10°/s. Native waist and restore use their separate timing
contracts. Other named presets and robot-camera wall/focus were not qualified
by these runs.

## Working product contract

The shared gateway supports Master, Navi, and Aegis. This work did not replace
the gateway with a Master-only runner or physically retest the other robots.
Master upper-body programs use the existing SDK controller, not customer Python
execution or a new native command owner:

`website Agentech calls → literal validation → account/review policy → booking → inert hashed plan → trusted runner → pinned SDK → structured receipt and live view`

- `Agentech.enter_stand_hand_guide("both")` must explicitly precede adjustments.
  Missing entry is an error. Never silently add it.
- Use only supported website-listed Agentech functions. Movement A is optional;
  ordinary arm/waist adjustment programs do not require it. No walking is in
  this test scope.
- An unqualified restore is `Agentech.restore_stand_hand_guide()`: both arms
  and all waist axes, with measured endpoints. Do not substitute undo history
  or infer standing-stiffness restoration from pose restoration.
- The specifically authorized owner account skips the paid/monthly AI review.
  Existing policies for other accounts remain. Command validation, code/plan
  identity, bookings, and physical admission checks still apply. No quota was
  raised or reset for these tests.
- External camera uses the established OBS → LiveKit path. Robot-camera wall
  and focus are used only when the user selects Robot cameras. See the separate
  [robot-camera operations guide](master-livekit-production.md); that guide is
  not evidence that the robot-camera path passed this day's test.
- A failed or ambiguous motion stops the program, preserves its receipt and
  powered hold, and does not replay a relative command. Recovery uses a newly
  admitted, exact-owner-bound full restore.

## Implementation and deployment state

| Website commit | Change | State at physical-test shutdown |
| --- | --- | --- |
| `750760c` | Owner-only paid review exemption and truthful account-exemption UI/audit. | Published and used through the website; account charge remains zero for exempt review. |
| `60b56d8` | Allow a verified restore to resolve a chain of failed attempts with the same exact retained owner. | Published and installed; failure history preserved. |
| `3e80cf9c441533a04fc62747f013c63221f56e7b` | Normalize Postgres fractional timestamp precision for Python 3.10. | Published and installed. Session 90 initially failed preflight on five fractional digits, then ran after this fix. No motion was sent by the rejected preflight. |
| `184f429c6c49598b8cb38b51fd102c603b422319` | Open one finite transport scope for a booked program when supported by the pinned SDK. | **Offline verified; local gateway installation and supervised validation pending.** |

The transport integration pairs with SDK
`d4fe8d73e3e05d51a6e1d0f92fd17895f042d5c7`. It covers shoulders, elbows, wrists,
full-arm requests, and waist discovery. It retains fresh observations, exact
owner binding, all motion/endpoint protections, and booking admission. Resource
reuse lasts only for the program, with bounded time for observing an already
admitted call after booking expiry. It does not authorize a new command after
expiry or retry an ambiguous command. Older selected SDKs keep their original
transport behavior.

The last physically tested local client is SDK `81ceba6`; the retained robot
controller is the `c887405` deployment. **GitHub publication and website
deployment do not activate a new local gateway or robot controller.** Match the
selected SDK digest manifest and installed runner before tomorrow's tests.
Keep existing OBS/LiveKit settings and unrelated Navi/Aegis configuration.

## Verification completed before publication

- `pnpm typecheck` — passed.
- `pnpm build` — production build passed.
- `pnpm test` — the complete configured suite passed, including Aegis/Navi
  runner regressions, shared gateway, SDK reference audit, camera/viewing,
  bookings, account/authentication, and recording schema checks.
- `pnpm test:master-gateway` — 62 Python tests and 58 Node tests passed.
- SDK related client/waist/combined/restore suites — 366 tests and 199 subtests
  passed. These are offline results, not physical qualification.
- Timestamp precision regressions cover one through six fractional digits and
  still reject missing timezone. Transport regressions cover fresh reads,
  exact policies, expiration, closed connections, no replay, and cleanup after
  failure. Existing raw-entry and booking checks remain tested.

The SDK reference audit loads the real local SDK. When the website checkout is
not beside `agentech_sdk`, set `MASTER_SDK_ROOT` to that checkout's absolute
path before `pnpm test`. Its default interpreter is the SDK's
`.venv/Scripts/python.exe`; `MASTER_SDK_PYTHON` can explicitly select another
prepared interpreter. An initial run from the isolated website worktree failed
because the default sibling path did not exist; the complete rerun passed with
the actual SDK path. Audit failures now report the subprocess error before
attempting to parse its JSON output. No audit was skipped.

No schema migration, account-wide bypass, new robot service, OBS change, or
robot power operation is needed for these code changes.

## Tomorrow's handoff

After the operator powers on Master, perform fresh setup/readiness checks and
select the reviewed candidate at a verified idle boundary. Use the real EAIC
website and booking flow, with explicit raw entry and default speed first.
Follow the SDK checklist: affected arm cases, waist, then arms + waist and full
restore. Record custom speed and effort as separate later cases with chosen,
admitted parameters. Do not mark unexecuted commands after a failure as passed.

Append a new dated record rather than editing prior failures into successes.
Record the scheduled session, code/plan identity, selected SDK/runtime digests,
actual timing, warnings, full restore, and delivery observations. This keeps
coworkers from duplicating completed tests while making the remaining work clear.
