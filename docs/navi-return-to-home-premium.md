# Navi Return to Home Premium Feature

`Agentech.return_to_home()` is the Navi SDK Library's premium positioning
function. It returns the dog to one fixed OBS+Camo home coordinate and then uses
one of four final headings:

```python
Agentech.return_to_home()                       # 0: saved default heading
Agentech.return_to_home(facing_angle_deg=90)   # right
Agentech.return_to_home(facing_angle_deg=180)  # backward
Agentech.return_to_home(facing_angle_deg=270)  # left
```

No website field or public SDK argument can modify the home X/Y coordinate.

## Automatic scheduled-session cleanup

Current policy is **damp-only**, as requested for the October 2026 showcase.
At the booked end, the trusted supervisor stops and damps Navi, verifies healthy
lowered/damped telemetry, and records `home_verified: false`. It does not require
a home-reset receipt or camera calibration before ordinary movement. Admission
still requires exclusive ownership, fresh controller and battery readings, and
a supported starting posture. A reviewed program whose first command is
`Agentech.stand()` can also start from a healthy, stationary `lie_down` state
(action `2`). The runner checks three samples before admission and confirms
normal standing after `stand()` before sending the next command. Explicit
customer `return_to_home()` remains premium. Its fixed home coordinate,
floor geometry, and requested facing direction persist across robot restarts.
The native yaw sensor can restart at a different zero. The SDK resolves that
offset separately so that a reboot does not require recalibrating the cameras.
EAIC's admission check is read-only. It can accept a measured reference for
the current controller session or a recovery procedure already qualified for
this robot, cell, and SDK implementation. Only an explicit home return may run
that procedure. An installation without either reference reports the missing
direction before running earlier commands in the same program. Ordinary
bookings do not depend on home-heading recovery.
Cleanup validates the inert session plan. Explicit return-home cleanup refuses a
plan containing `emergency_stop`; damp-only cleanup instead applies its fresh
posture/telemetry checks. Unknown ownership or unhealthy telemetry never counts
as ready.

On November 5, 2026, booking #100 expired before its first command. A reading
in the booking window showed `standing=false`, action `3`, height 0.120 m,
and zero error, warning, and e-stop flags. A later **direct SDK** test sent one
right sideflip. The SDK reported success and subsequent readings showed Navi
upright and still. That test did not exercise the EAIC scheduler. The owner
then certified an identical copy of #100's six commands through EAIC
(`agentech-20261105204320-q6kvo7`). At that point the updated gateway passed
the lying-start check on Navi and declined the full plan before dispatch because
the SDK could not resolve its home heading. No EAIC flip or home return was
physically qualified by those checks.

The installed gateway now launches a detached trusted supervisor with the absolute
booked deadline. It retains ownership until that deadline even when the inert
program finishes early. At expiry it terminates and verifies the program child
before an exclusive cleanup owner sends SDK stop and damping.
This deadline does not wait for bridge cloud/OBS work or a bridge
restart; the action child also has a hard deadline, without a competing SDK stop
publisher. Other robot services and OBS are not terminated by this supervisor.
Launch rechecks expiration after stream/readiness/claim waits.

A structured cleanup result must confirm healthy lowered/damped telemetry.
It must not claim center or facing qualification. Active/unknown prior ownership
blocks another launch; a later fresh posture check cannot erase a failed command
result. Command outcomes are identity-bound to the session, submission, source,
plan, execution attempt, guardian, child exit, and booked deadline. Video or
successful damping cannot turn a failed command into a successful execution.

Due bookings have independent error boundaries: review/staging/stream/launch
failure for one booking is logged without starving a later valid booking.
The availability query includes reservations already underway at the requested
window start. Database/read failures return retryable JSON503; the scheduling UI
clears available options instead of displaying an empty, apparently free cell.
Conflict-read failure aborts reservation before credit spending. The current
single cell remains shared across robot models; this is not multi-cell routing.

Cloud schedule reads use a single eight-second deadline, including response-body
consumption. A transient network/502/503/504 failure may retry once if time
remains; a fully exhausted deadline is reported and the next normal polling
cycle reads again. A healthy slow first response retains the full deadline.
Writes, including booking claims, are never automatically replayed after an
ambiguous response. Diagnostics identify UTC time, HTTP method/table, failure
category/status, attempts, and elapsed time without account filters, credentials,
or raw upstream response bodies. Local expiry/cleanup ownership is unchanged.
The request helper must be installed together with the bridge; a source/test
pass is not evidence that the running booking program has been updated.

Maintenance restart checks preserve historical failures. A closed legacy record
or exhausted cleanup failure can be treated as settled history only when a later
booking for the same robot has a completed cleanup (Navi additionally requires
its successful healthy damped receipt). A finished, unlaunched booking with no
PID and no cleanup requirement is also settled. Active/future bookings, pending
execution, cleanup owners and unsupported unresolved states still block restart.
This classification neither changes old results nor grants robot readiness.

The cloud-request and maintenance-history changes were installed on November 3,
2026 after idle/ownership checks. One booking-bridge restart activated them; no
robot command, booking mutation, OBS restart, or history rewrite was performed.
Installed schedule reads succeeded and the post-restart error log was empty.
These are no-motion software/deployment results, not physical qualification.

On October 26, a signed-in website movement booking completed all four commands
(stand, short forward/backward commands, stop) and automatic damped cleanup.
A separate read-only booking displayed decoded OBS video in Chrome. Camo stayed
private. Commanded maximum settings did not reach sustained maximum speed;
return-home and full-cell/all-heading qualification remain separate, deferred work.

Cleanup attempt identity, supervisor PID, child ownership, and an atomic outcome
are persisted privately. Restart recovery waits for an existing owner and
accepts only the matching verified receipt; a dead process is not successful
cleanup. Unknown ownership remains blocked for operator recovery. Gateway state
is replaced atomically; missing or malformed state fails closed rather than
forgetting active ownership. A trusted operator must recover/initialize that
state before restarting, not silently create empty state over an unknown owner.

### Historical return-home reset evidence (superseded cleanup policy)

The following September/early-October results describe the older automatic-home
policy, not the current damp-only handoff. That policy required the verified
reset receipt's ROS boot to match the enabled calibration and live boot,
alongside healthy damped telemetry.
A trusted supervised reset can be imported at every admission from
`C:\AgentechRobotGateway\.robot-stream-runtime\navi-supervised-baseline.json`:
`{"version":1,"verified_at":"<UTC ISO timestamp>","result":<verified cleanup receipt>}`.
This dedicated file is never overwritten by the bridge's cached state; do not
update the live bridge's `state.json` to inject a new baseline. Invalid/future
receipts fail closed, and a supervised baseline cannot supersede an active
cleanup owner.

OBS remains the viewer feed; Camo is a private calibration camera. The fixed
cell center is saved in calibration, so no paper or green marker is required.
Earlier inset-corner trials took 21–27 seconds from healthy standing;
standing up first adds time. These are measured trials, not every-pose guarantees.

The local gateway rollout on 2026-09-29 uses an isolated verified SDK at
`C:\AgentechRobotGateway\navi-sdk` (override with `AGENTECH_NAVI_SDK_ROOT`).
The bridge passes that exact path to the runner; a missing deployment fails closed.
Private calibration stays outside both Git repositories. A supervised deployed
cleanup passed in 27.2 seconds including standing, with 2.2 cm estimated
standing center error and 0.52 degrees final heading error. No customer booking
was created for this check. Deployment backups and the reset receipt are under
`C:\AgentechRobotGateway\backups\navi-return-20260929`.

Run `npm run test:robot-stream-bridge` and `npm run test:navi-cli-gateway`
for hardware-free handoff/compiler/runner checks. For an explicit home return,
robot reboot or changed camera placement requires a valid heading/calibration
binding. Ordinary scheduled movement does not require that home receipt. Never
clear an explicit emergency stop or mark an old failed session successful.

The deadline-supervisor/restart/receipt changes were installed on 2026-10-05
(local time), after hardware-free regression tests and independent review.
A local supervisor test used an inert `get_battery_status` plan, without a
customer/cloud booking. Cleanup began 0.045 seconds after the booked deadline;
the verified ready receipt arrived 22.925 seconds after expiry. The original
return action took 18.453 seconds, with 3.0 cm camera-estimated standing-center
error and 0.43 degrees final lowered heading error, ending healthy/damped.
The program-completion SDK stop and expiry cleanup were automatic, not a manual
return call. Earlier obscured-view attempts failed closed without readiness.

The private calibration and separate current-boot reset baseline are enabled
for the tested framing and restricted clear operating bounds. Twenty installed
Navi SDK files match published SDK commit `fb7864f`; the gateway-only supervisor
and receipt logic is maintained in this repository's existing scripts. Backups
are under `C:\AgentechRobotGateway\backups\navi-automatic-expiry-20261005`.
Actual customer-booking execution and every-position/every-heading coverage
were not tested. The rear strip obstructed by the screen remains outside the
restricted motion envelope; this is not blind navigation around obstacles.

The current server-injected damp-only cleanup does not consume the
customer's premium entitlement. A customer-authored `return_to_home()` call is
still subject to the access rules below. A direct SDK return also ends damped;
subsequent movement therefore requires standing again.
The validator and trusted runner accept only `0`, `90`, `180`, or `270`.

## Access Policy

The server grants access when any one condition is true:

- The signed-in account has an `active` or `trialing` monthly subscription
  whose period has not ended.
- The signed-in account has an active `navi_return_to_home` lifetime
  entitlement from a completed one-time purchase.
- The account is an internal Agentech company account used for operations,
  support, or testing.

All other physical submissions containing `return_to_home()` are denied with
HTTP `402` and `PREMIUM_FEATURE_REQUIRED`. The access check runs in the
server-side code-submission route, so hiding or changing the browser UI does not
bypass it. Local preview remains available without entitlement because it does
not command the physical robot.

## Production Configuration

Apply the tables in `supabase-schema.sql`:

- `agentech_subscriptions`
- `agentech_feature_entitlements`
- `agentech_feature_payments`

Configure these server-only environment variables:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
AGENTECH_RETURN_TO_HOME_PRICE_CENTS=
```

`AGENTECH_RETURN_TO_HOME_PRICE_CENTS` must be a positive integer amount in USD
cents. There is intentionally no source-code default. Until it is configured,
the SDK Library displays `Price coming soon` and the purchase endpoint returns
`503`; subscribers and existing entitlement holders are unaffected.

## One-Time Purchase Flow

1. The signed-in customer starts checkout from the premium SDK card.
2. The server creates a Stripe Checkout Session in one-time payment mode and
   records a pending feature payment in Supabase.
3. Stripe sends a signed `checkout.session.completed` webhook.
4. After `payment_status=paid`, the webhook marks the payment paid and upserts
   a non-expiring `navi_return_to_home` entitlement.
5. Subsequent server access checks allow the function.

Do not grant access from the browser success URL alone. The Stripe webhook is
the authoritative fulfillment event and is verified using
`STRIPE_WEBHOOK_SECRET`.
