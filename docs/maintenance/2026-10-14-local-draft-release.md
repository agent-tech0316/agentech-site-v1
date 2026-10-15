# Local draft integration - October 14, 2026

The release starts from consolidated main `a03d5b5f652882dac43a807cd4837b38029390d6`. The September 11 branch remains unchanged at `c425ad5680a28670f2ae7830c1b73e3848dd4773` and is excluded from this release.

## Reconciliation

- Primary checkout: integrate the recording API and private storage schema, signed-session requirement, Navi handoff/runner changes, outreach report text and website illustration. The latest Master SDK display, profile, stiffness and joint-specific torque documentation already exists in main and is retained.
- Aegis checkout: integrate its smoke examples, runner measurements, restart/process helpers, OBS configuration and status tools. Preserve newer main's battery route, Session 43 diagnosis, emergency-stop cleanup behavior and NVENC health checks.
- Motion Studio checkout: retain main's five binary assets. Current pages use the news image, simulation preview and two program-guide PDFs; the existing wordmark asset is also preserved. Stale checkout deletions must not break current references.
- SDK display checkout: its only remaining difference is generated `next-env.d.ts`; retain the current production configuration.

Every original dirty checkout was copied and hash-checked outside the repository before reconciliation. Older draft versions remain recoverable there and in Git stashes after their checkouts are updated to the verified main commit. No development branch is needed for this release.

## Corrections found during review

- Navi cleanup retries defer while another booking owns the robot and recognize a newer validated reset without rewriting previous failure history.
- Pending captures from launched sessions are collected after expiry cleanup; bookings that never launched are excluded.
- Aegis locomotion results require structured, finite numeric measurements, and failure is persisted before later commands can run.
- Gateway process matching identifies the executed entry script rather than matching a script path used as an unrelated command argument. Restart checks consider the session lifecycle and unresolved cleanup.
- OBS configuration verifies the active profile, encoder, stored settings and actual frame-rate ratio before reporting success.
- Master recording discovery and claims exclude reusable nonpositive live-test reservations. The original recording migration is preserved; a follow-up migration updates the existing service-role functions.

## Release checks

Run the full repository suite, additional theme/login/website/gateway tests, isolated recording-schema checks, lint, typecheck and production build. Verify the deployed Git SHA, public routes and signed-session enforcement after the normal main push. These checks exercise software with offline fixtures and do not constitute a new physical robot qualification or runtime activation.
