# NAVI SDK Explorer Task-First Redesign — Implementation Evidence

**Date:** 2026-10-15
**Implementation owner:** 09 · EAIC Hub 客户端界面
**Independent validation owner:** 11 · 自动化测试与浏览器验收
**Implementation status:** Complete in the accepted local candidate; unpublished and awaiting independent Category 11 acceptance
**Candidate:** `/private/tmp/agentech-navi-sdk-explorer-20261014/implementation`
**HEAD:** `72c1a4b32554f0f5628d05739f8bbcaa6a6673b1` (unchanged; no commit was authorized)
**Approved spec:** `/Users/lsyy/Documents/Agentech/Agentech Website/docs/superpowers/specs/2026-10-15-navi-sdk-explorer-task-first-redesign.md`
**Approved plan:** `/Users/lsyy/Documents/Agentech/Agentech Website/docs/superpowers/plans/2026-10-15-navi-sdk-explorer-task-first-redesign.md`

## Delivered Outcome

- The Navi explorer now leads with one task-focused title, one full-width search field, the seven real category filters plus All, and a throttled live result count.
- Quick Start derives its actions from the reviewed Common Task order: Stand, Move Forward, and Turn are primary; Sit, Stop, and Battery Status remain available through an accessible `More tasks` disclosure. Opening or closing the disclosure does not mutate URL or selected-reference state.
- Desktop uses one bounded reference index beside one complete detail pane. Initial load remains unselected and shows a neutral prompt.
- Tablet and mobile use one index-or-detail flow. A selected reference renders exactly one full-width detail instance; `Back to references` appears before the function title, removes only `ref`, and restores useful focus/position.
- `NaviReferenceDetail` remains the single technical-documentation renderer. Search, category, URL, history, explicit onboarding evidence, premium, media, and copy behavior continue through the existing contracts.
- The redesign preserves the warm Light canvas `#f5f4f1`, page-scoped Light/Dark themes, 44 px targets, keyboard focus, reduced motion, and the 390 px Dark-mode zero-horizontal-scroll regression fix.

## TDD Record

### Expected RED evidence

1. The new source-level presentation contract was run against the pre-redesign implementation. Result: 23 total tests, 19 passing, 4 failing for the missing task-first hierarchy, Quick Start split, responsive master-detail workspace, and single detail renderer. Evidence: `.superpowers/sdd/2026-10-15-navi-sdk-explorer-task-first-redesign/task1-red/summary.md`.
2. The rewritten production-browser contract was run against the previous production build `VKaYpdG_XxTPk6_ZZyuE0`. It failed while waiting for the absent `[data-navi-explorer-title]` hook, proving the old page did not satisfy the new contract. Evidence: `.superpowers/sdd/2026-10-15-navi-sdk-explorer-task-first-redesign/task4-red/summary.md`.
3. Final self-review found that the mobile Back control followed the reference title in DOM order. A new source contract failed 22/23 with `mobile Back control precedes the reference title in DOM order`; the layout was then corrected without duplicating the button or detail renderer.

### Final GREEN gates

| Gate | Final result |
| --- | --- |
| `pnpm test:navi-sdk-explorer` | PASS — 23/23; search benchmark p95 0.100 ms |
| `pnpm test:view-sdk-onboarding` | PASS — 26/26 |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm build` | PASS — 115/115 static pages generated |
| `pnpm test:navi-sdk-explorer-browser` | PASS — 130 rows, six viewport/theme states, `premiumGets=1`, `premiumPosts=0`, no writes or errors |
| `pnpm test:view-sdk-onboarding-browser` | PASS — 20 scenarios and six viewport/theme combinations |
| `git diff --check` | PASS |
| `next-env.d.ts` preservation | PASS — no diff after restoring the generated route reference |

The browser commands used the bundled Playwright installation and connected to the already available Chrome CDP endpoint. The production origin under test was `http://127.0.0.1:3019`.

## Final Production Identity

- **Build ID:** `UaGcv8I3x_vBCw7bqRXg8`
- **Listener PID:** `54232`
- **Listener cwd:** `/private/tmp/agentech-navi-sdk-explorer-20261014/implementation`
- **Latest local Navi URL:** `http://127.0.0.1:3019/agentech-products/eaic-hub/view-sdk?robot=navi`
- **HTTP status:** `200`
- **Publishing state:** local production preview only; no commit, push, PR, or deployment was performed.

## Browser and Visual Evidence

- Machine-readable Navi report: `.codex-artifacts/navi-sdk-explorer/browser-report.json`
- Screenshots:
  - `.codex-artifacts/navi-sdk-explorer/task-first-redesign/1440-light.png`
  - `.codex-artifacts/navi-sdk-explorer/task-first-redesign/1440-dark.png`
  - `.codex-artifacts/navi-sdk-explorer/task-first-redesign/768-light.png`
  - `.codex-artifacts/navi-sdk-explorer/task-first-redesign/768-dark.png`
  - `.codex-artifacts/navi-sdk-explorer/task-first-redesign/390-light.png`
  - `.codex-artifacts/navi-sdk-explorer/task-first-redesign/390-dark.png`
- Onboarding report: `.codex-artifacts/view-sdk-onboarding/browser-report.json`

All six Navi screenshots were visually inspected. Desktop shows one readable index plus one detail pane. Tablet and mobile show one dedicated detail view with the Back control before the function title. Light and Dark surfaces remain legible, focus/controls stay inside the viewport, and the page has no horizontal overflow. The only horizontal scrollers at 390 px are intentional code `<pre>` regions.

The machine report records:

- `status: passed`
- 130 index rows and one detail instance when selected
- zero duplicate IDs, bad targets, clipped focus targets, page overflow, console errors, or application writes
- representative contrast minimum 4.505:1 in Light and 9.098:1 in Dark
- one lazy premium GET only after the premium detail is explicitly opened
- zero premium POSTs and zero unintended checkout, payment, purchase, simulator, robot, execution, or live-run writes

## Preservation Evidence

- The public index contains all 130 unique canonical reference names in original source order.
- Category totals remain derived from data and total 130: Movement 6, Athletics 6, Actions 92, Posture 13, Configuration 6, Safety 2, Sensing 5.
- The reviewed tasks remain `stand`, `forward`, `turn`, `sit`, `stop`, and `get_battery_status`; no second hard-coded function manifest was introduced.
- Canonical Navi source SHA-256 remained `1f377d0cfc1708309f1682e606fe83639e683be50067152f5fc15a39bef8f940`.
- View SDK onboarding source SHA-256 remained `f54e5fa922153762e91513ddbd020ba6662957f8195555ad9dbdc7de189bc426`.
- This redesign did not modify the canonical Navi reference file, Master, Aegis, onboarding source, global header, authentication, payment, simulator, or robot-control flows.

## Redesign-Owned File Inventory

The accepted candidate already contained unrelated tracked and untracked work. The following is the inventory owned by this redesign, not a claim that the entire candidate has only these changes:

- `package.json` — adds the UI contract to the focused Navi test command.
- `scripts/navi-sdk-explorer-ui.test.mjs` — task-first hierarchy, Quick Start derivation, single renderer, responsive layout, mobile Back order, evidence, and URL source contracts.
- `features/eaic/01-clients/eaic-hub/components/navi-sdk-explorer.tsx` — task-first controls, compact Quick Start, and responsive single master-detail workspace.
- `features/eaic/01-clients/eaic-hub/components/navi-reference-detail.tsx` — category header and one responsive Back/Close control while preserving all documentation sections.
- `scripts/navi-sdk-explorer-browser-check.mjs` — full production-browser behavior, URL/history, focus, responsive/theme, accessibility, network, side-effect, and screenshot verification.
- `docs/superpowers/evidence/2026-10-15-navi-sdk-explorer-task-first-redesign-evidence.md` — this handoff record.

Process-only, gitignored task logs remain under `.superpowers/sdd/2026-10-15-navi-sdk-explorer-task-first-redesign/`.

## Known Limitations and Boundaries

- This is an unpublished local production preview. No commit, push, PR, or deployment was authorized or performed.
- Reference media is approved prerecorded content. Its first frame is black in the captured screenshots; browser verification covers lazy single-instance loading and reduced-motion behavior, not live robot output.
- One onboarding browser run failed an existing immediate focus assertion after coach Escape. Investigation traced it to onboarding's deliberate `requestAnimationFrame` focus restoration while the unchanged test asserts synchronously on the same turn. The unchanged suite then passed all 20 scenarios and six viewport/theme combinations. No onboarding source or test was changed; this rAF-sensitive test remains a known nondeterministic limitation outside the redesign scope.
- No physical robot, simulator execution, purchase, checkout, or payment action was performed. Premium POST was zero in the final gate.
- Final review was a checklist-based self-review because this session explicitly prohibited creating a fresh reviewer subagent. No P0–P3 findings remain after the mobile Back-order fix. Independent Category 11 acceptance is still required.

## Category 11 Independent Acceptance Checklist

1. Verify a fresh Navi load has no automatic selection, no detail instance, and no added `ref`; desktop shows the quiet selection prompt.
2. Verify Quick Start exposes exactly Stand, Move Forward, and Turn initially; `More tasks` exposes Sit, Stop, and Battery Status; opening or closing the disclosure leaves URL and current selection unchanged.
3. Verify 1440 px has one index and one complete detail pane; 768/390 px have one index-or-detail flow; no viewport renders duplicate detail DOM, and mobile Back precedes the function title.
4. Verify direct filtered `q` + `category` + `ref`, invalid and filter-hidden selection cleanup, zero-result recovery, browser Back/Forward, refresh, copied URL, focus return, and useful list position.
5. Verify explicit-only onboarding evidence, copy failure then success, premium/media single-instance lazy behavior, and 390 px Dark open/close/browser-back/drawer interactions with body and document `scrollLeft === 0`.
6. Reconfirm 130 unique references in canonical order, the seven derived category totals, the six reviewed task mappings, and complete public detail sections.
7. Reconfirm six Light/Dark viewport visuals, no horizontal page overflow, 44 px targets, visible focus, reduced motion, minimum text contrast, no console errors, and zero unintended application writes.
8. Re-run both onboarding gates and record any recurrence of the known rAF-sensitive immediate focus assertion separately from Navi functional results.
