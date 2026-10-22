# Navi SDK Explorer implementation evidence

Date: 2026-10-14 (America/Los_Angeles)

Candidate: `/private/tmp/agentech-navi-sdk-explorer-20261014/implementation`

Fresh remote base and rollback SHA: `72c1a4b32554f0f5628d05739f8bbcaa6a6673b1`

Status: implementation Tasks 1–12 complete in the detached candidate; not committed, pushed, published, purchased, or connected to a physical robot. The candidate stops here for category 11 independent acceptance.

## Preservation gate

The preservation manifest at `docs/superpowers/evidence/2026-10-14-navi-sdk-explorer-preservation-manifest.md` passed with one environment limitation. The candidate reconstructs only the accepted visible `.tech`/`.teach` suffix removal, View SDK purpose/next-step copy, and bounded Start Coding behavior. It explicitly excludes the three unapproved Navi connection, protected verification, and dry-run wording deltas. The canonical `standing_actions.teach` mapping remains unchanged while visible Master tooltip text omits both suffixes.

## Red-green evidence

| Task | RED evidence | GREEN evidence |
| --- | --- | --- |
| Public projection | Temporarily reintroduced protected `verification`; the leakage assertion failed on the exact protected string. | Mutation reverted; projection/search suite passed and protected verification/connect kwargs/feature-code fields remain absent. |
| Explorer interactions | `--explorer-only` initially found no category controls or Explorer toolbar. | 130 unique source-order rows, seven exact category totals, six reviewed Common Tasks, search/filter/empty/focus/single-detail behavior passed. |
| URL/history | `--url-only` timed out waiting for the Explorer when a direct `?robot=navi...` URL still hydrated Master. | Direct hydration, 150 ms query replace, explicit push history, sanitation, refresh/copy/Back/Forward, and robot switching passed. |
| Responsive/accessibility | `--matrix` first failed because `Replay simulation` was only 34 px high. | Replay is at least 44 px; six viewport/theme states, keyboard flows, focus, contrast hooks, overflow, typography, and reduced motion passed. |
| Lazy/network evidence | Measurements were added before any Task 11 component change; the first full measurement run passed. | Closed/normal/premium/close boundaries and observer cleanup passed with zero writes and no real checkout. |

Raw task logs are under `.superpowers/sdd/2026-10-14-navi-sdk-explorer/`. The machine-readable browser report is `.codex-artifacts/navi-sdk-explorer/browser-report.json`.

## Automated results

| Check | Result |
| --- | --- |
| `pnpm run test:navi-sdk-explorer` | PASS, 18/18. Includes metadata, public projection, protected-field exclusion, search semantics/ranking/counts, URL state, media inventory, and p95 guard. |
| Navi search benchmark | PASS. Task 4 repeated p95 values: 0.273 ms, 0.102 ms, 0.099 ms. Final production-browser evidence: 0.090542 ms over 2,000 searches; budget is 16.7 ms. |
| Explorer full browser check | PASS against the production build. Functional, URL/history, six-state matrix, keyboard, lazy/network, observer, DOM, and performance scenarios; `errors=[]`, `applicationWrites=[]`. |
| SDK fonts browser check | PASS against the production build, 18 states (3 robots × 3 widths × 2 themes), zero overflow/errors/writes. |
| TypeScript | PASS, `pnpm typecheck`. |
| ESLint | PASS, `pnpm lint`, 0 errors and 0 warnings. |
| Production build | PASS, `pnpm build`; Build ID `2z8dRbQ14tGJloB1IECaM`. |
| Production route | PASS, HTTP 200 at `http://127.0.0.1:3290/agentech-products/eaic-hub/view-sdk?robot=navi`. |
| Diff integrity | PASS, `git diff --check`, no output. |
| Master motor map | PASS, 9/9; visible `.tech` and `.teach` absent while SDK mapping is unchanged. |
| Master simulation previews | PASS, 4/4. |
| Return-to-home access contract | PASS, 4/4. |
| Shared EAIC theme suite | 55/57 PASS with the bundled Python runtime. The exact failures are `renders the login hero as a concise two-line editorial headline` and `renders the login canvas with the shared warm off-white background`. The pre-existing local `/login` HTTP 307-to-home behavior means the fetched HTML is the homepage. Both task-specific new structural tests pass. |
| Full SDK reference wrapper | Environment-bounded 22/23: only `every displayed Master profile, configuration and example passes the actual offline SDK audit` fails because the adjacent private `../agentech_sdk` checkout is unavailable and emits no JSON. The assertion was not changed or skipped. |
| Repository `pnpm test` wrapper | The host runtime has no standalone `npm`, while the repository's `test` script shells out to `npm run`, so the literal wrapper first exits on `npm: command not found`. With a temporary package-manager compatibility shim, every preceding suite passes and the chain reaches only the same 22/23 private-SDK audit limitation. The post-audit suites were run separately: Master previews 4/4, motor map 9/9, live camera 31/31, live test 26/26, heartbeat 35/35, and auth sign-in 31/31. |

## DOM and Navi-selection network measurements

The final measurements used Chrome 155 against an untouched `origin/main` development server and the candidate production server, both cut from the same base SHA. They are useful observed boundaries, not an apples-to-apples benchmark or a claim that structure alone caused every timing difference.

| Measurement after selecting Navi | Pre-Explorer baseline | Explorer candidate |
| --- | ---: | ---: |
| Canonical rows | 130 | 130 |
| DOM nodes | 6,523 | 1,325 |
| Heavy Navi preview elements | 79 | 0 closed |
| Selection requests | 83 | 1 |
| Navi preview-asset requests | 79 | 0 |
| Observed selection duration | 1,319.953 ms | 156.241 ms |

The baseline selection request mix was 79 media and 4 fetch requests. The candidate selection issued one fetch and no preview request. Development compilation, production bundling, cache state, local hardware, and the different rendering boundary can all affect timing, so duration is recorded without causal attribution.

## Lazy-mount and network boundaries

| State | Detail regions | Heavy previews | Premium requests | Writes | Observer state |
| --- | ---: | ---: | ---: | ---: | ---: |
| Closed | 0 | 0 | 0 | 0 | page baseline; 1,319 DOM nodes |
| Normal `lateral` detail | 1 | 1 MP4 | 0 | 0 | active count rose from 1 to 2 |
| Closed again | 0 | 0 | 0 | 0 | active count returned to 1 |
| Premium `return_to_home` detail | 1 | no extra mounted detail | exactly 1 GET | 0 POST / 0 writes | detail-only |

The only premium request in the full verification was the existing read-only `GET /api/premium-features/return-to-home`. No purchase button was activated, no checkout navigation occurred, and no POST/PUT/PATCH/DELETE application request was made.

## Responsive, theme, and accessibility evidence

The 1440, 768, and 390 px matrix passed in Light and Dark:

- Light canvas is `rgb(245, 244, 241)` (`#f5f4f1`); dark Explorer surface is `rgb(13, 17, 23)`.
- Page horizontal overflow is 0 in all six states.
- No visible controls are below 44×44 px and no visible badge/control crosses the viewport.
- Only code `<pre>` blocks scroll horizontally at 390 px.
- Interface roles use Manrope; code roles use IBM Plex Mono.
- Search, filters, all six Common Tasks, row open/close, Escape focus restoration, and copy complete by keyboard.
- Reduced motion suppresses automatic preview playback and Navi transitions while open/close state changes still work.
- Dark representative contrast minimum is 9.098:1 in all three widths.

The 390 px full-page PNG is 710 px wide because the site-wide hidden mobile navigation drawer is included by Chrome's full-page screenshot capture. Runtime `documentElement.scrollWidth - innerWidth` is 0, and the Explorer controls have no viewport clipping.

## Content hashes and public boundary review

The updated fonts check protects exact normalized documentation hashes across every width/theme state:

- Master: `7c299dfd2ffed6504ccf1822cc11bfbcf3dd9813285c2cce0734743a3deb9530`
- Aegis: `6d58664abd51a2aedd905249678f66c351d22cf6ac90d607e148a5f227a5c92a`
- Navi Explorer index: `8eab7190296d51be6c1972732d228e9556f273237ceb4d1f1e6d3105895c1a5e`

The hashes were recalibrated at the extracted renderer boundary. Master/Aegis exact names, counts, order, and disclosure behavior are independently asserted in the URL browser scenario. The Navi hash covers the closed 130-row index; the model suite separately proves all 130 public projections and protected-field exclusions. Visible `.tech`/`.teach` assertions still run in all six font-check states.

## Screenshots and environment

Primary screenshots:

- `.codex-artifacts/navi-sdk-explorer/task10/1440-light.png`
- `.codex-artifacts/navi-sdk-explorer/task10/1440-dark.png`
- `.codex-artifacts/navi-sdk-explorer/task10/768-light.png`
- `.codex-artifacts/navi-sdk-explorer/task10/768-dark.png`
- `.codex-artifacts/navi-sdk-explorer/task10/390-light.png`
- `.codex-artifacts/navi-sdk-explorer/task10/390-dark.png`
- `.codex-artifacts/navi-sdk-explorer/baseline-navi-selected.png`
- `.codex-artifacts/navi-sdk-explorer/candidate-closed.png`
- `.codex-artifacts/navi-sdk-explorer/candidate-normal-detail.png`
- `.codex-artifacts/navi-sdk-explorer/candidate-premium-detail.png`

Environment: Chrome `155.0.8059.40`; macOS `15.1.1` build `24B91`; Apple Silicon (`arm64`). Screenshots were visually reviewed for hierarchy, clipping, theme consistency, and the expanded detail placement.

## Known non-blocking baseline issues

1. The adjacent private `../agentech_sdk` repository is absent, so the unchanged offline Master audit remains environment-blocked (22/23 wrapper result).
2. This local preview redirects `/login` with HTTP 307 to the homepage, leaving two unrelated login-page HTML assertions red (55/57 shared EAIC theme suite).
3. The host runtime has no standalone `npm`; direct `pnpm` scripts were used, and a temporary compatibility shim was used only to evaluate the repository's nested `npm run` chain.
4. Cross-mode local timings are cache- and compilation-sensitive; only the pure 2,000-sample search p95 is treated as a hard performance gate.

None of these issues changes Navi public data, security boundaries, lazy mounting, Aegis/Master behavior, or the no-write/no-purchase result.
