# Navi SDK Explorer Preservation Manifest

Date: 2026-10-14 (America/Los_Angeles)

Candidate: `/private/tmp/agentech-navi-sdk-explorer-20261014/implementation`

Fresh remote base: `72c1a4b32554f0f5628d05739f8bbcaa6a6673b1` (`2026-10-07T19:16:45-07:00`, `Publish VORLD Build 52 with product showcase`)

This gate defines the only unpublished behavior that may be reconstructed before the Navi Explorer work. It is intentionally narrower than the dirty source checkout. No whole dirty file is copied into this candidate.

## Preservation decisions

| Behavior | Acceptance statement | Source evidence and date | Target and exact hunk or reconstruction rule | Focused test | Reconciliation status | Owner disposition |
| --- | --- | --- | --- | --- | --- | --- |
| Visible `.tech` / `.teach` suffix removal | Hide both suffixes in the Master joint tooltip function and example while retaining the canonical `standing_actions.teach` SDK mapping. | Root `TASK-BOARD.md`, 2026-10-05 entry “EAIC View SDK `.tech` / `.teach` 可见后缀清理”; named current-checkout diff in `master-motor-map.tsx` and `master-motor-map.test.mjs`. | `features/eaic/01-clients/eaic-hub/components/master-motor-map.tsx`: format visible values with `.replaceAll(".teach", "").replaceAll(".tech", "")`; do not mutate `MASTER_MOTOR_MARKERS`. | `Master motor tooltips hide tech and teach suffixes without changing the SDK mapping` | Reconstructed and focused test PASS (1/1). | **INCLUDE** — accepted unpublished UI behavior; identity and runtime mapping remain unchanged. |
| View SDK purpose | Lead with “Start with an action” and “Make your robot do something.” | Root `TASK-BOARD.md`, 2026-10-14 Navi entry and 2026-10-05 View SDK acceptance history; former candidate source is no longer available as a usable checkout. | `agentech-library-workbench.tsx`: reconstruct only the named View SDK heading and supporting purpose copy; do not replace the released renderer or catalogue. | `preserves the approved human-goal-first View SDK purpose and truthful next step` | Reconstructed and focused test PASS. | **INCLUDE** — accepted semantic behavior, rebuilt on the fresh base. |
| View SDK three-step mental model | Present `Find an action`, `See how it works`, and `Try it` in that order. | Same accepted task-board evidence, reviewed 2026-10-14. | Replace only the three tutorial-card titles/bodies; keep the released robot selector and SDK row/detail renderer. | Same View SDK preservation test. | Reconstructed and focused test PASS. | **INCLUDE**. |
| View SDK truthful CTA and physical preview boundary | CTA goes to Code Certification; media is described as pre-recorded reference and never as physical execution. | Same accepted task-board evidence, reviewed 2026-10-14. | Add the real `/agentech-products/eaic-hub/software-check` link and explicit pre-recorded/no-physical-motion statement; make no simulator, write, or robot call. | Same View SDK preservation test. | Reconstructed and focused test PASS. | **INCLUDE**. |
| View SDK copy-next-step | After copying setup code, direct the user to paste it into Code Certification; the reference page does not run a robot. | Same accepted task-board evidence, reviewed 2026-10-14. | Add only the post-copy explanation beneath the existing setup code panel. | Same View SDK preservation test. | Reconstructed and focused test PASS. | **INCLUDE**. |
| Start Coding bounded onboarding | One active step at a time, four steps, visible `Step X of 4`, completion state, focus on navigation, refresh resets to step 1, and no double-step behavior. | Root `TASK-BOARD.md`, 2026-10-05 Start Coding audit and 2026-10-08 recovered-preview entries; old candidate source is no longer a usable source checkout. | Reconstruct `FocusedStartCodingSection` state locally in the fresh-base workbench; initial state is step 1, direct buttons select one step, Continue advances once, and the fourth action enters completion. | `preserves the approved bounded Start Coding onboarding and physical-run boundary`; browser interaction remains required in the final matrix. | Reconstructed; SSR/source-focused preservation test PASS. | **INCLUDE** — accepted page behavior, not a new execution feature. |
| Start Coding truthful safety and prerequisites | State private repository access is required and this page only prepares/copies code; it does not preview, authenticate, send, or run it. | Same 2026-10-05/08 task-board evidence. | Replace only the affected onboarding copy; no auth, simulator, network write, or robot behavior is added. | Same Start Coding preservation test. | Reconstructed and focused test PASS. | **INCLUDE**. |
| Start Coding copy and completion affordances | Copy errors are visible, controls are at least 44 px, completion shows the full file, and links to View SDK and Code Certification are real. | Same 2026-10-05/08 task-board evidence. | Extend the shared copy button with an accessible success/error live message and 44 px size; add full-file completion and two existing-route links. | Same Start Coding preservation test; browser coverage remains required for copy failure, keyboard focus, and target size. | Reconstructed and focused test PASS. | **INCLUDE**. |
| Released View SDK layout, typography, categories, and Master documentation | Preserve the fresh-base released workbench renderer, Manrope/IBM Plex Mono roles, catalogue grouping, and Master reference content. | `origin/main` base `72c1a4b…`, fetched 2026-10-14; production history in `TASK-BOARD.md`. | Inherit from the fresh base. Never copy the old monolithic workbench. Only the named purpose/onboarding blocks and visible suffix formatter may differ before Explorer work. | Existing SDK/Master/theme suites plus `git diff --check`. | Preserved by fresh-base inheritance. | **INCLUDE BASE AS-IS**. |
| Local Navi connection wording delta | Dirty-source candidate proposed replacing `Select Navi once with Agentech.use("navi"). Per-call connection options raise TypeError.` with detailed host/port/timeout/dry-run/client-factory wording. | Unresolved local candidate comparison reviewed 2026-10-14; no task-board owner acceptance. | Keep the exact fresh-base `naviConnection` text. Do not import the proposed connection details. | Public-projection and protected-field tests in later Explorer tasks. | Explicitly reconciled by exclusion. | **EXCLUDE** pending separate product/security review. Cost if wrong: the candidate keeps less detailed internal connection guidance, but does not publish unapproved connection internals. |
| Local `return_to_home.verification` wording delta | Dirty-source candidate proposed changing `Dual-camera preview verified...` to `Dual-camera dry-run verified...`. | Unresolved local candidate comparison reviewed 2026-10-14; no task-board owner acceptance. | Keep the exact fresh-base verification text; verification is protected and will not enter the public projection. | Existing return-to-home access test and later projection leakage tests. | Explicitly reconciled by exclusion. | **EXCLUDE** pending separate product/security review. Cost if wrong: protected internal verification copy remains less precise; no public claim is added. |
| Local Navi safety wording delta | Dirty-source candidate proposed adding `Motion is dry-run unless dry_run=False is selected` to `naviSafetyLimits`. | Unresolved local candidate comparison reviewed 2026-10-14; no owner acceptance of this public safety claim. | Keep the fresh-base `naviSafetyLimits` array unchanged. | Later public projection, safety rendering, and browser copy checks. | Explicitly reconciled by exclusion. | **EXCLUDE** pending product and safety review. Cost if wrong: the candidate omits an unapproved clarification instead of asserting unsupported runtime behavior. |

## Reconstruction scope review

The reconstructed baseline changes only:

- `features/eaic/01-clients/eaic-hub/components/agentech-library-workbench.tsx`
- `features/eaic/01-clients/eaic-hub/components/master-motor-map.tsx`
- `scripts/eaic-task-theme.test.mjs`
- `scripts/master-motor-map.test.mjs`

No change was made to `navi-sdk-reference.ts` during this gate. The three unresolved Navi deltas above are deliberately absent.

## Baseline commands and results

The repository is pnpm-locked and this host does not expose a standalone `npm` command in the task runtime, so the plan's package-script invocations were run as the equivalent `pnpm run <script>`. The bundled Node directory was added to `PATH`; `/usr/bin/python3` was supplied for syntax-only Python checks.

| Command | Result |
| --- | --- |
| `pnpm run test:sdk-reference` | **ENVIRONMENT-BOUNDED FAIL**: 21/22 tests pass. Only `every displayed Master profile, configuration and example passes the actual offline SDK audit` fails because the expected adjacent `../agentech_sdk` checkout is absent, so the audit emits no JSON and the harness reports `Unexpected end of JSON input`. This test is unrelated to the four reconstructed files; it is retained and not weakened. |
| `pnpm run test:master-motor-map` | **PASS**, 9/9. |
| `pnpm run test:return-to-home-access` | **PASS**, 4/4. |
| `pnpm run test:login-bypass` | **PASS**, 3/3. |
| `pnpm run test:theme` | **PASS**, 26/26. |
| Focused View SDK and Start Coding preservation tests | **PASS**, 2/2. |
| `git diff --check` | **PASS**, no output. |

Raw logs are stored under `.superpowers/sdd/2026-10-14-navi-sdk-explorer/task1-baseline/` in the isolated candidate. The missing private SDK checkout is a baseline environment limitation, not permission to change or skip the SDK test later; it must be reported again unless the dependency is supplied.

## Gate result

**PASS WITH ONE RECORDED ENVIRONMENT LIMITATION.** The accepted unpublished UI behaviors are reconstructed from named evidence, released behavior stays inherited from `origin/main`, and every unresolved Navi wording/safety delta has an explicit exclusion disposition before any Explorer change to the canonical Navi file.

## Final Task 12 reconciliation

Every row above was compared with the final production candidate. The final classification is exhaustive; no row remains ambiguous.

| Manifest row | Final classification | Final evidence |
| --- | --- | --- |
| Visible `.tech` / `.teach` suffix removal | **reconstructed** | Master tooltip/browser assertions omit both visible suffixes; `standing_actions.teach` remains the canonical mapping; motor-map suite passes 9/9. |
| View SDK purpose | **reconstructed** | The approved human-goal-first heading and supporting purpose copy are present; focused structural and production browser checks pass. |
| View SDK three-step mental model | **reconstructed** | `Find an action`, `See how it works`, and `Try it` remain in the approved order. |
| View SDK truthful CTA and physical preview boundary | **reconstructed** | Code Certification link is real, preview copy remains explicitly pre-recorded, and the full browser run records zero application writes. |
| View SDK copy-next-step | **reconstructed** | The setup-code panel directs copied code to Code Certification and does not expose an execution action. |
| Start Coding bounded onboarding | **reconstructed** | Four-step single-active-step flow, reset behavior, completion state, and navigation were retained; focused checks pass. |
| Start Coding truthful safety and prerequisites | **reconstructed** | Private repository prerequisite and prepare/copy-only boundary remain present; no auth, simulator, or robot execution was added. |
| Start Coding copy and completion affordances | **reconstructed** | Accessible copy state, 44 px controls, full-file completion, and both real links remain present. |
| Released View SDK layout, typography, categories, and Master documentation | **preserved** | Aegis/Master browser invariants and exact normalized hashes pass in all 18 width/theme/robot states. |
| Local Navi connection wording delta | **owner-resolved** | Excluded under the approved preservation decision; final public projection retains the fresh-base connection wording and no private connect kwargs. |
| Local `return_to_home.verification` wording delta | **owner-resolved** | Excluded under the approved preservation decision; projection mutation coverage proves `verification` cannot enter public Explorer data. |
| Local Navi safety wording delta | **owner-resolved** | Excluded under the approved preservation decision; final global safety limits match the fresh-base array. |
