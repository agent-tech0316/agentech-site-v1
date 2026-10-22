# EAIC View SDK onboarding implementation evidence

## Guardrails

- Candidate workspace: `/private/tmp/agentech-navi-sdk-explorer-20261014/implementation`
- Baseline HEAD: `72c1a4b32554f0f5628d05739f8bbcaa6a6673b1`
- The candidate is an existing externally managed linked worktree with a detached HEAD; no additional worktree was created.
- No commit, push, pull request, deployment, purchase, simulator action, robot action, or Category 11 dispatch is authorized by this implementation task.
- Completion means implemented and locally verified in the candidate workspace, not independently accepted or published.

## Recoverable baseline

- Snapshot directory: `/private/tmp/agentech-eaic-onboarding-baseline-20261014`
- Complete HEAD bundle: `head.bundle` (verified)
- Tracked changes: `tracked.patch`
- Untracked files: `untracked.tar.gz`
- Baseline status rows: 49
- Baseline files hashed: 1,590 / 1,590 verified
- Baseline untracked paths: 41
- Recovery files have their own `recovery-files.sha256` manifest.
- Host finding: the inherited `C.UTF-8` locale is unavailable to Perl-backed `shasum`; evidence commands use `LC_ALL=C LANG=C`. Candidate data was not changed by the failed first hash attempt.

## Pre-implementation verification

Passing checks:

- `pnpm test:navi-sdk-explorer`
- `pnpm test:master-motor-map`
- `pnpm test:master-simulation-previews`
- `pnpm test:return-to-home-access`
- `pnpm test:login-bypass`
- Focused `eaic-task-theme` checks for the approved Start Coding and View SDK boundaries
- `pnpm typecheck`
- `git diff --check`

Known pre-existing limitation:

- `pnpm test:sdk-reference`: 18/23 pass, 5/23 fail before onboarding implementation. The failures are the existing Master profile offline-audit expectations (`canonicalPython` returns `null` for the currently supplied source inputs). Raw log: `/private/tmp/agentech-eaic-onboarding-baseline-20261014/test-logs/test-sdk-reference.log`.

## Task checkpoints

Task-level RED/GREEN commands and final verification evidence will be appended below during implementation.

### Task 1 — typed contract and storage adapter

- RED: `node --test scripts/view-sdk-onboarding-contract.test.mjs` exited 1 because `view-sdk-onboarding.ts` did not exist (`ENOENT`). Raw log: `/private/tmp/agentech-eaic-onboarding-baseline-20261014/test-logs/task-1-red.log`.
- GREEN: 6/6 named contract tests pass, zero fail.
- Serialized fixture is the exact v1 object containing `version`, `lastExplicitlySelectedRobot`, the exact `master`/`aegis`/`navi` evidence keys, and shared `tour` flags. It contains no derived count and no email, account, code, function name, query, price, entitlement, timestamp, or analytics field.
- Defensive parsing rejects malformed JSON, partial robot sets, wrong version/types/enums, and non-exact nested shapes. Storage read/write exceptions degrade to `memory-only` without cookies, URL, session storage, or fetch fallbacks.
- `pnpm typecheck`: PASS. `git diff --check`: PASS.
- Diff boundary: new pure contract, its Node test, and the two planned package scripts only. Pre-existing package additions remain part of the accepted candidate baseline.

### Task 2 — clipboard fallback truth

- RED: focused UI test was 1/2 passing; fallback failed because the existing implementation ignored `document.execCommand("copy")`'s boolean result. Raw log: `/private/tmp/agentech-eaic-onboarding-baseline-20261014/test-logs/task-2-red.log`.
- GREEN: 2/2 focused copy tests pass. The fallback now removes its temporary textarea in `finally`, rejects a false result before success state/callback, and retains the existing 44px control and polite success/error message.
- Callback ordering: a resolved Clipboard API call or `execCommand === true` reaches `onCopied`; a rejection, thrown exception, or `execCommand === false` reaches `onCopyError`.
- Regression: Navi Explorer 18/18 PASS; focused accepted Start Coding/View SDK checks 2/2 PASS; `git diff --check` PASS.
- Diff boundary: one minimal fallback hunk in the existing Workbench plus the planned UI test file.

### Task 3 — coordinator, hydration, and synchronous persistence

- RED: 0/3 focused coordinator/controller tests passed because the planned coordinator module did not exist. Raw log: `/private/tmp/agentech-eaic-onboarding-baseline-20261014/test-logs/task-3-red.log`.
- GREEN: 3/3 focused tests and 11/11 aggregate onboarding tests pass.
- Hydration: server/initial render is neutral (`hydrated=false`, `coachOpen=false`); a single empty-dependency client effect performs the validated storage read. Mount, hydration, anchor registration, and robot prop changes never dispatch evidence.
- Storage mode: unavailable/throwing storage enters `memory-only`; valid, empty, or corrupt readable storage remains usable and reports `persistent` while corrupt content is replaced only in memory until the next explicit action.
- Dispatch ordering: reducer computes from `stateRef.current`, advances the ref, then attempts persistence synchronously before returning. Only explicit typed controller methods can create evidence.
- Forbidden-dependency scan: no URL parser, network fetch, premium/simulator/analytics behavior, cookie/session fallback, DOM query evidence, observer, or generic completion event.
- `pnpm typecheck`: PASS. `git diff --check`: PASS.
- Diff boundary: one new coordinator module and the planned Task 3 UI assertions.

### Task 4 — persistent checklist and contextual next actions

- RED: 0/4 focused surface tests passed because the checklist/prompt did not yet exist. Raw log: `/private/tmp/agentech-eaic-onboarding-baseline-20261014/test-logs/task-4-red.log`.
- GREEN: 4/4 focused tests and 15/15 aggregate onboarding tests pass.
- Stable DOM hooks: `data-eaic-sdk-onboarding`, `data-eaic-sdk-onboarding-step`, `data-eaic-sdk-onboarding-step-state`, and `data-sdk-next-actions`.
- Accessible names/state: labelled four-step group, `aria-busy` neutral hydration, disabled pre-hydration controls, exactly one post-hydration current step, readable `Complete`/`To do`, and separate labelled `Instructions reviewed` / `Setup code copied` subchecks.
- Routes: primary Code Certification uses `getEaicHubTaskPath("software-check")`; secondary Start Coding uses `getEaicHubTaskPath("start-coding")`; EAIC Hub uses `eaicHubPath`. Activation records the typed choice without preventing navigation. The helper explicitly says navigation does not certify, install, connect, or run code.
- Checklist selection updates ephemeral presentation and uses `scrollIntoView({ behavior: "auto" })` only for a registered anchor; it dispatches no evidence. Later steps remain available.
- Server-rendered screenshot was not produced at this checkpoint because the repository's lightweight TypeScript test loader preserves TSX; browser screenshots are reserved for Task 8's real production harness.
- `pnpm typecheck`: PASS. `git diff --check`: PASS.

### Task 5 — non-modal coach, focus, and placement

- RED: 0/4 focused coach/placement tests passed because no coach, halo, focus return, or geometry existed. Raw log: `/private/tmp/agentech-eaic-onboarding-baseline-20261014/test-logs/task-5-red.log`.
- GREEN: 4/4 focused tests and 19/19 aggregate onboarding tests pass.
- Non-modal boundary: `role="dialog"` with labelled/described content, no modal attribute, portal, page overlay, inert state, focus trap, body lock, or positive tab order. The registered-target halo is pointer-transparent.
- Controls: Back is disabled on Step 1; Next changes only the ephemeral explanation; Finish is rendered only on Step 4; Skip is always available; Restart preserves reducer evidence.
- Focus: first automatic open never invokes focus. Checklist/Back/Next/Restart schedule focus on the updated coach heading. Skip/Finish/coach-local Escape return focus to the same registered checklist control. No document/window key listener can consume Navi's Escape behavior.
- Geometry: while open, placement reads the registered target rectangle and listens to window resize, capture-phase scroll, and available `visualViewport` resize/scroll with complete cleanup. Desktop tries right/left/below/above, tablet prefers below/above, and phone uses a 16px-inset bounded bottom card after immediate centered target scrolling.
- Motion/live region: coach and halo include reduced-motion transition removal; no pulse/bounce/autoplay was added. One onboarding polite live region announces first open and idempotent evidence changes without moving target focus.
- Manual code inspection confirmed listener symmetry and checklist focus-return refs. `pnpm typecheck`: PASS. `git diff --check`: PASS.

### Task 6 — Workbench robot, setup, anchors, and destination wiring

- RED: 0/5 focused integration tests passed because the Workbench had no coordinator, stable onboarding refs, setup acknowledgement/copy evidence, or explicit destination reporting. Raw log: `/private/tmp/agentech-eaic-onboarding-baseline-20261014/test-logs/task-6-red.log`.
- GREEN: 5/5 focused tests and 24/24 aggregate onboarding tests pass; Navi Explorer remains 18/18 passing.
- Scope: exactly one coordinator wraps only `FocusedBrowseFunctionsSection`; one surface is the first child of the existing purpose/setup card. Existing task visibility/access selection remains authoritative.
- Robot evidence: every explicit Master/Aegis/Navi activation records the typed robot before the same-robot early return. State/history push remains conditional on an actual robot change.
- Setup evidence: the selected setup panel owns the stable panel/review/copy hooks. The persistent `aria-pressed` acknowledgement is idempotent; only the selected starter-code copy success reports setup copy. Recipe/example copy buttons remain evidence-neutral.
- Next Action: the existing top-card Code Certification link reports `software-check`; together with the three contextual links, these are the only reporters and all use allowlisted destinations.
- Anchors: choose, setup, explore, and next use typed React refs; no query/observer registration or completion was introduced.
- Changed Workbench hunks were inspected against the accepted baseline; edits are limited to imports, the clipboard correction, coordinator integration, explicit callbacks/hooks, and closing structure. `pnpm typecheck`: PASS. `git diff --check`: PASS.

### Task 7 — explicit Navi, Aegis, and Master detail evidence

- RED: 0/2 focused detail-evidence tests passed because Navi had no optional callback and native Master/Aegis details had no trusted open-intent guard. Raw log: `/private/tmp/agentech-eaic-onboarding-baseline-20261014/test-logs/task-7-red.log`.
- GREEN: 2/2 focused tests, 26/26 aggregate onboarding tests, and 18/18 Navi unit tests pass.
- Navi semantics: Common Task activation reports its canonical function; a row reports only when an explicit toggle changes it from closed to open. URL hydration, canonicalization, close buttons, Escape close, filtering cleanup, and focus restoration never report.
- Master/Aegis semantics: a trusted native summary click creates a one-shot intent; the following native toggle consumes it and reports only if the concrete function detail is open. Category disclosures have no handlers.
- Browser counter evidence: direct `?robot=navi&ref=stand` hydration = 0 reports; explicit close = 0; explicit reopen = 1. Full report: `.codex-artifacts/navi-sdk-explorer/browser-report.json`.
- Full Navi browser result: PASS with 130 rows, six 1440/768/390 Light/Dark entries, no clipped/bad targets, `applicationWrites=[]`, premium GET=1, premium POST=0, and zero captured errors.
- Debug finding: the first full ordered run exposed a phone-only scroll feedback loop: placement's scroll listener re-centered the guide target on every user scroll and could trigger a duplicate identical media request. Root correction moved immediate centered scrolling to explicit checklist/Restart actions only; geometry listeners now only measure/reposition. The complete ordered harness then passed without relaxing its original request assertion.
- Canonical SDK and premium component hashes still exactly match the verified pre-implementation manifest (`1f377d…f940` and `15a4d4…3a1e` respectively); Task 7 did not change them.
- `pnpm typecheck`: PASS. `git diff --check`: PASS.

### Task 8 — browser, theme, accessibility, storage, and no-write proof

- Structural theme RED: the new `scopes View SDK onboarding Light and Dark styles beneath eaic-task-theme` test failed because no onboarding-specific scoped rules existed. GREEN now proves the existing `#f5f4f1` page canvas, explicit Light/Dark onboarding scope, no body/global overlay selector, phone `inset-inline: 16px`, and reduced-motion `transition: none` / `animation: none`.
- Browser RED sequence first corrected two precise harness-fixture issues (the pre-existing read-only `/api/master-heartbeat` classification and a dismissed-tour seed), then found real product failures: robot selector controls were below 44px and the coach retained a `0.15s` transition in reduced motion. Minimal owning-boundary corrections add `min-h-11` to the three robot buttons and scoped onboarding motion rules.
- Visual review found a further Dark contrast defect not covered by the first numeric matrix: phone progress and step-label text retained Light-only colors. A new structural RED required semantic progress/step tokens; scoped CSS now resolves to progress `rgb(183, 193, 203)` and step labels `rgb(229, 237, 245)` in every Dark viewport.
- GREEN browser result: `View SDK onboarding browser check passed: 20 scenarios, 6 viewport/theme combinations.` Chrome `155.0.8059.40`. Machine report: `.codex-artifacts/view-sdk-onboarding/browser-report.json`.
- The report contains 20/20 named behavior scenarios, 6/6 1440/768/390 × Light/Dark rows, 11 required visual states per row (hydration, Steps 1–4, partial, one/two setup subchecks, prompt, copy error, coach closed, Restart, complete return, and memory-only), and 21 screenshots.
- Geometry/colors: zero horizontal overflow; phone coach left/right are exactly 16/374 at 390px; Light canvas is `rgb(245, 244, 241)`; Dark canvas/coach/heading/progress/step tokens are respectively `rgb(4, 5, 6)`, `rgb(13, 17, 23)`, `rgb(229, 237, 245)`, `rgb(183, 193, 203)`, and `rgb(229, 237, 245)`.
- No-side-effect proof: `unexpectedErrors=[]`, `applicationWrites=[]`, `checkoutActions=[]`, `robotOrSimulatorCalls=[]`, and `onboardingNetworkRequests=[]`; premium states perform GET-only intercepted reads with zero POST.
- Auth proof: the harness records the documented development access bypass and automatically exercises signed-out/locked/error gate shells through current account request interception when run against the production server/non-local hostname. It adds no test escape hatch and submits no credentials.
- Visual inspection: 1440 Light/Dark, 768 Dark, and fresh 390 Dark were manually inspected. Card hierarchy, target visibility, coach geometry, wrapping, prompt controls, and themes are intact. The initial 390 Dark inspection exposed the contrast issue above; the refreshed visual confirms readable progress/labels and an unobstructed 16px-inset bottom card.
- Focused gates: onboarding contract/UI suite 26/26 PASS; theme onboarding test PASS; full theme suite 56/58 with only the two unchanged local `/login` shell assertions failing; TypeScript PASS; `git diff --check` PASS. The Python syntax test requires the bundled Python directory on `PATH`, after which it passes.
- Diff boundary: planned browser harness, scoped global CSS, theme assertions, halo hook, and the two browser-required Workbench corrections (44px robot buttons plus the earlier explicit evidence wiring). No commit was created.

### User-added visible `.tech` / `.teach` suffix check

- The current candidate already carries the isolated display-only formatter from the earlier verified suffix-cleanup task: both `.teach` and `.tech` are removed from Master motor-map function/example text while canonical SDK mapping remains `standing_actions.teach`.
- Current live 3019 verification shows `standing_actions` and `Agentech.standing_actions("left", ...)`; a full visible-DOM scan returns zero `.tech` / `.teach` matches.
- `scripts/master-motor-map.test.mjs`: 9/9 PASS. The font/browser matrix retains explicit all-body and tooltip assertions for both suffixes; canonical data is intentionally unchanged.

## Final production verification and Category 11 handoff packet

### Production artifact and preview

- `pnpm build`: PASS, 115/115 static pages generated.
- Build ID: `_zR-du40yBBD1LX_dPyyi`.
- Production server: `http://127.0.0.1:3019`, listener PID `35031`.
- Listener cwd: `/private/tmp/agentech-navi-sdk-explorer-20261014/implementation`.
- Exact review URL: `http://127.0.0.1:3019/agentech-products/eaic-hub/view-sdk?robot=master` returned HTTP 200 after the production server started.
- HEAD remains the detached baseline `72c1a4b32554f0f5628d05739f8bbcaa6a6673b1`; commits since baseline: 0.

### Final static gates

- `pnpm typecheck`: PASS.
- `pnpm lint`: PASS with 0 errors and 0 warnings. Two initial hook dependency warnings were removed without changing behavior, then the onboarding suite was rerun.
- `pnpm test:view-sdk-onboarding`: 26/26 PASS.
- `pnpm test:navi-sdk-explorer`: 18/18 PASS; search p95 `0.107 ms` in the preservation run.
- `pnpm test:master-motor-map`: 9/9 PASS.
- `pnpm test:master-simulation-previews`: 4/4 PASS.
- `pnpm test:return-to-home-access`: 4/4 PASS.
- `pnpm test:login-bypass`: 3/3 PASS.
- `git diff --check`: PASS after final evidence/test edits.

### Final production-browser gates

- Onboarding: 20/20 named scenarios and 6/6 `1440/768/390 × Light/Dark` combinations PASS in Chrome `155.0.8059.40`; 21 screenshots. The production-only signed-out, locked, and access-error shells were all exercised and mounted zero onboarding DOM.
- Onboarding negative proof remains exact: `unexpectedErrors=[]`, `applicationWrites=[]`, `checkoutActions=[]`, `robotOrSimulatorCalls=[]`, `onboardingNetworkRequests=[]`.
- Navi Explorer: 130 rows, six responsive/theme combinations, search p95 `0.105 ms`, premium GET=1, premium POST=0, `applicationWrites=[]`, `errors=[]`. Direct hydration/close/reopen evidence remained `0/0/1`.
- SDK font/tooltip matrix: 18/18 robot/viewport/theme states PASS for Master, Aegis, and Navi; zero visible `.tech` and zero visible `.teach` matches in both page text and Master tooltip assertions, `errors=[]`, `writes=[]`.
- Production timing hardening in the browser harness waits for the eventual Back/Forward URL, waits for an access shell to settle before classifying it, and treats the intentionally intercepted account-500 console line as expected only inside the explicit access-error scenario. No production bypass or application behavior was added.

### Preserved boundaries and known environment limitations

- Canonical Navi reference file remains hash `1f377d0cfc1708309f1682e606fe83639e683be50067152f5fc15a39bef8f940`.
- Premium panel remains hash `15a4d4cef01ce6a904bf9b75aa55ce5bf21cab5717be7ef5ee7d83ba00dd3a1e`.
- `pnpm test:sdk-reference`: 22/23 in the final environment; the sole remaining failure is the pre-existing offline private-SDK audit parse (`SyntaxError: Unexpected end of JSON input`) because `../agentech_sdk` is unavailable. This is not presented as a product pass.
- Full `scripts/eaic-task-theme.test.mjs`: 56/58 with only the two unchanged local `/login` shell assertions failing under the existing local auth-bypass behavior. The focused onboarding theme check passes.
- No real credentials, payment, checkout, simulator, physical robot, production data, or deployment was used.

### Precise implementation-owned inventory relative to the verified recovery snapshot

Product/runtime:

- `app/globals.css`
- `features/eaic/01-clients/eaic-hub/components/agentech-library-workbench.tsx`
- `features/eaic/01-clients/eaic-hub/components/navi-sdk-explorer.tsx`
- `features/eaic/01-clients/eaic-hub/components/view-sdk-onboarding.tsx` (new)
- `features/eaic/01-clients/eaic-hub/contracts/view-sdk-onboarding.ts` (new)

Tests/package wiring:

- `package.json`
- `scripts/eaic-task-theme.test.mjs`
- `scripts/navi-sdk-explorer-browser-check.mjs`
- `scripts/view-sdk-onboarding-browser-check.mjs` (new)
- `scripts/view-sdk-onboarding-contract.test.mjs` (new)
- `scripts/view-sdk-onboarding-ui.test.mjs` (new)

Evidence generated or refreshed by final browser runs:

- `.codex-artifacts/view-sdk-onboarding/` (new report plus 21 screenshots)
- `.codex-artifacts/navi-sdk-explorer/browser-report.json`, three candidate screenshots, and six `task10` screenshots (refreshed)
- `.codex-artifacts/eaic-sdk-fonts/` sixteen existing screenshots (refreshed)
- `docs/superpowers/evidence/2026-10-14-eaic-view-sdk-onboarding-implementation-evidence.md` (new)

The build-generated `next-env.d.ts` route-reference change was restored to the verified candidate baseline and is not part of the handoff. Existing Navi implementation files, prior evidence, Master suffix formatter/tests, canonical reference, premium panel, and other accepted dirty-worktree content remain attributed to the recovery snapshot rather than to onboarding.

Final status: **implemented but not committed, pushed, deployed, purchased, or independently accepted**.

## P1 follow-up — 390px Dark copy-success horizontal shift

An independent Category 11 acceptance run against the preceding production build found one P1 defect: at 390×1000 in Dark mode, after a rejected clipboard attempt followed by a successful copy, `document.body.scrollLeft` could become `296`; the main content moved to `left=-296/right=94`, while the fixed coach remained visible. Light mode remained aligned.

### Root cause and minimal correction

- Runtime geometry isolated the source to the global sticky site header's Dark-mode `backdrop-filter`. That filter creates a containing block for the header's fixed mobile drawer; while the closed drawer was translated to the right, it expanded `body.scrollWidth` from 390 to 710. The successful-copy state update then allowed browser scroll anchoring to select the resulting 296px horizontal range.
- The Light theme already disables this filter, which explained why the same interaction remained at zero there.
- The minimal correction is one EAIC-page-scoped rule at the existing mobile-drawer breakpoint (`max-width: 1279px`) that disables only the site header's backdrop filter. It does not write or reset `scrollLeft`, hide the drawer, change clipboard behavior, or alter SDK/auth/payment/data code.
- The drawer itself remains functional: at 390px Dark its closed rect is `390..709.796875`, its open rect is `70.203125..390`, and after closing it returns off-canvas; throughout all three states `body.scrollWidth=390` and `body.scrollLeft=0`.

### Regression-first proof

- RED against the old production build: the extended browser harness reproduced the exact failure at the `copy-resolved` stage with `AssertionError: 390px dark copy-resolved: body stays horizontally aligned` and actual `296 !== 0`.
- GREEN against the corrected production build: `View SDK onboarding browser check passed: 20 scenarios, 6 viewport/theme combinations.`
- At 390px in both Light and Dark, all five recorded stages (`copy-rejected`, `copy-resolved`, `coach-next-after-copy`, `coach-escape`, `coach-finish`) report `bodyScrollLeft=0`, `documentScrollLeft=0`, `bodyScrollWidth=390`, `documentScrollWidth=390`, and main rect `left=0/right=390`.
- Navi production browser gate remains PASS with 130 rows and 6/6 viewport/theme combinations; `applicationWrites=[]`, `errors=[]`, premium GET=1, premium POST=0.
- SDK font/tooltip production matrix remains 18/18 PASS for Master/Aegis/Navi, with zero visible `.tech` / `.teach`, `errors=[]`, and `writes=[]`.

### Refreshed production artifact

- `pnpm build`: PASS, 115/115 static pages generated.
- Build ID: `iis0I_HRlFNqinyuINk-F`.
- Production server: `http://127.0.0.1:3019`, listener PID `44570`.
- Listener cwd: `/private/tmp/agentech-navi-sdk-explorer-20261014/implementation`.
- Exact review URL: `http://127.0.0.1:3019/agentech-products/eaic-hub/view-sdk?robot=master`, HTTP 200.
- Focused and preservation gates: onboarding 26/26, Navi 18/18 with 130 canonical references, Master motor map 9/9, Master simulation previews 4/4, return-to-home 4/4, login-bypass 3/3, TypeScript PASS, lint PASS, build PASS, and `git diff --check` PASS.
- HEAD remains `72c1a4b32554f0f5628d05739f8bbcaa6a6673b1`; no commit, push, deployment, purchase, checkout, simulator action, robot action, or application write was performed.

P1 follow-up status: **corrected and locally verified; ready for independent re-acceptance, not independently accepted or published**.

## Follow-up — four-step card title alignment

The approved bounded layout change requires `Choose Robot`, `Explore Commands`, `Set Up SDK`, and `Next Action` to share one structural title start rather than allowing the browser to vertically center each button's contents according to its text height. It also requires four equal-height cards, a 4/2/1-column responsive grid, and no loss of Step 3 subchecks or onboarding behavior.

### Regression-first implementation

- The browser harness now measures the real card and title rectangles in every `1440/768/390 × Light/Dark` state. It independently asserts the expected row count, equal card height, identical title offset from the card top, same-row title top/bottom alignment, single-line unobscured titles, and zero page overflow.
- RED against the preceding production build `k-KxX_-1nCnFQfqR7ZlQo`: `1440px light onboarding cards: every title starts from the same top padding`. The measured old layout placed the Step 3 title 42.5px above the other three titles.
- Minimal GREEN: the existing grid now uses one column below `sm`, two columns from `sm`, four from `lg`, and equal implicit row heights; each existing card button is an explicit `flex flex-col justify-start` container. No per-card margin/padding exception or content-specific selector was added.

### Production geometry and visual evidence

- Production browser result: 20/20 named scenarios and 6/6 viewport/theme combinations PASS.
- 1440 Light/Dark: one four-card row; every card is 147px high; every title is 17px from its card top and 20px high, so title top and bottom differences are exactly 0px.
- 768 Light/Dark: two rows of two; all four cards are 127px high; every title offset is 17px and every title is 20px high, so both row pairs have exact top/bottom alignment.
- 390 Light/Dark: four single-card rows; all four cards are 127px high; every title offset is 17px, each title remains one 20px line, and page overflow is 0.
- Step 3 retains both `Instructions reviewed` and `Setup code copied`; current/complete/to-do states remain visible. Representative screenshots: `.codex-artifacts/view-sdk-onboarding/alignment-1440-light.png`, `alignment-768-dark.png`, and `alignment-390-dark.png` (six alignment screenshots total).
- The existing 390px copy reject → resolve → Next → Escape → Finish protection remains exact in both themes: body/document scrollLeft 0, body/document width 390, and main rect 0..390 at all ten checkpoints.
- Negative proof remains exact: `unexpectedErrors=[]`, `applicationWrites=[]`, `checkoutActions=[]`, `robotOrSimulatorCalls=[]`, and `onboardingNetworkRequests=[]`.

### Refreshed gates and production artifact

- Onboarding unit/contract suite: 26/26 PASS.
- Navi unit suite: 18/18 PASS with 130 canonical references and search p95 0.100ms.
- Navi production browser: 130 rows and 6/6 responsive/theme states PASS; premium GET=1, POST=0, `applicationWrites=[]`, `errors=[]`.
- Preservation: Master motor map 9/9, Master simulation previews 4/4, return-to-home access 4/4, login bypass 3/3.
- Project-level suite audit: the literal `pnpm test` cannot start in the bundled runtime because its script shells out to unavailable `npm`. Running all 18 constituent scripts with `pnpm` completed every suite; the sole failure remained the documented `test:sdk-reference` offline private-SDK audit (22/23, `Unexpected end of JSON input` because `../agentech_sdk` is unavailable). All later constituent suites were still run and passed.
- TypeScript, ESLint, 115/115 production build, and `git diff --check`: PASS.
- Build ID: `aLhdEbOvvMzbIX--_LVol`; production listener PID `47487`; cwd `/private/tmp/agentech-navi-sdk-explorer-20261014/implementation`.
- Exact HTTP 200 review URL: `http://127.0.0.1:3019/agentech-products/eaic-hub/view-sdk?robot=master`.
- HEAD remains `72c1a4b32554f0f5628d05739f8bbcaa6a6673b1`; commits since baseline remain 0. No commit, push, deployment, checkout, payment/purchase, simulator call, robot call, or application write was performed.

Alignment follow-up status: **implemented and locally verified; ready for Category 11 independent acceptance, not published**.
