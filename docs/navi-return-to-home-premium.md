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

When a Navi booking reaches its scheduled end, the trusted robot gateway always
runs the original `return_to_home()` with the default camera-facing heading,
even if the user called it earlier. That SDK function already lowers and damps
after verified arrival; the gateway does not send a second damping command.
Cleanup validates the inert session plan and refuses to override an explicit
`emergency_stop`. Healthy recognized low postures can stand before returning;
faults, uncertain posture, stale cameras, or a changed robot boot fail closed.

The installed gateway now launches a detached trusted supervisor with the absolute
booked deadline. It retains ownership until that deadline even when the inert
program finishes early. At expiry it terminates and verifies the program child
before an exclusive cleanup owner sends SDK stop and the original return-home
operation. This deadline does not wait for bridge cloud/OBS work or a bridge
restart; the action child also has a hard deadline, without a competing SDK stop
publisher. Other robot services and OBS are not terminated by this supervisor.
Launch rechecks expiration after stream/readiness/claim waits.

A structured result must
confirm center within 6 cm (standing before lowering), final heading within
4 degrees, and healthy lowered/damped telemetry. A failed reset stops motion,
does not damp blindly, and blocks the next user even after the three-attempt
retry limit. Stream-delivery status does not imply physical readiness.

Cleanup attempt identity, supervisor PID, child ownership, and an atomic outcome
are persisted privately. Restart recovery waits for an existing owner and
accepts only the matching verified receipt; a dead process is not successful
cleanup. Unknown ownership remains blocked for operator recovery. Gateway state
is replaced atomically; missing or malformed state fails closed rather than
forgetting active ownership. A trusted operator must recover/initialize that
state before restarting, not silently create empty state over an unknown owner.

Next-user readiness requires the verified reset receipt's ROS boot to match the
current enabled calibration and live boot, alongside healthy damped telemetry.
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
for hardware-free handoff/compiler/runner checks. Robot reboot, changed camera
placement or an explicit emergency stop requires operator revalidation; never
clear a blocked reset by marking an old failed session successful.

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

This server-injected cleanup is an operational reset and does not consume the
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
