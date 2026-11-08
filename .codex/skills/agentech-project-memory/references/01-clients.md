# 01 — Clients and Website Experience

## Ownership and current state

This layer owns EAIC Hub and the public Next.js experience. EAIC Hub is current/alpha; EAIC CLI is the near-term companion; World macOS and World iOS remain future clients. All clients consume shared contracts rather than databases, and World iOS is intended to connect through World macOS.

Implementation anchors:

- `app/` — public and internal routes.
- `components/` — shared UI, forms, header, page experiences.
- `features/eaic/01-clients/eaic-hub/` — EAIC Hub home, workbench, controls, and client contracts.
- `app/globals.css` — global tokens plus page-scoped visual adapters.
- `lib/site-data.ts` — navigation data; do not duplicate it in components.
- `docs/agentech-ui-change-playbook.md` — proven visual-change workflow.

## Current product experience

EAIC Hub exposes five numbered tasks:

1. Start Coding.
2. View SDK for Aegis, Navi, and Master.
3. Code Certification: Physical Hardware Check before Software Check.
4. Schedule Time.
5. Watch Live Run during the scheduled session.

The Hub also contains the Master motor map, joint-motion guide, live gateway heartbeat, code upload/paste, validation/simulation results, scheduling, and live-view controls. Routes remain under `app/agentech-products/eaic-hub`; task definitions live in `features/eaic/01-clients/eaic-hub/contracts/agentech-library-tasks.ts`.

Previously committed client work also includes the three-mode theme system, history-aware Back controls, local-preview auth bypass, a restyled Account workspace, complete About/News theme scopes, EAIC task light/dark states, official Master web-model tooling, sign-in failure handling, and the current `/coming-soon` robot scene. Detailed Account and EAIC hero decisions are appended to `docs/agentech-ui-change-playbook.md`.

## Current uncommitted UI work

Treat the following as working-tree state, not proof of publication:

- Header navigation is now `Platform / Service / Education / Talents`, driven by `lib/site-data.ts` and the new `components/service-menu.tsx` + `service-menu.css`.
- Desktop category menus open on hover, keep a 10px pointer bridge, delay close long enough to cross the gap, support Arrow Down/Escape/focus, and close exclusively. Mobile uses click-to-expand opaque inline panels.
- Platform: EAIC links to the Hub; EAIS is intentionally a label only; NAVI STORE links to the existing Navi learning page. Clicking the Platform trigger itself opens EAIC Hub.
- Service: ROBOTICS RENT is label-only; ROBOTICS SALE links to `/agentech-robotic`; AI-DEVELOPMENT opens a third level containing AI-WEBSITE, AI-APP DEV, and AI-SERVICE, currently label-only; DATA COLLECTION is label-only. Do not invent pages or URLs.
- Education links to K-8, 9-12 HIGH SCHOOL, and UNIVERSITY / COLLEGE using the `pathway` query and `#program-pathways`. `resolveEducationPathway()` is the source of truth.
- Talents links to real Club, Intern, and Workshop pages. The Talents cards expose separate Explore and Apply actions: Club `/ai-robotics-club` + `/apply`; Internship `/career-intern` + `/apply`; Workshop `/tech-education` + `#workshop-application`.
- Light/dark/system themes use page-specific scopes. About has a complete light theme; News has a complete dark theme; Login, Navi, Club, and Internship journeys now follow the selected theme.
- The highlighted EAIC safety completion reminder has no decorative exclamation marks and uses the same engineering-yellow treatment as the temporary boundary warning.
- The EAIC hero replaced the dog blueprint with approved light/dark humanoid wireframes. Both assets remain mounted and CSS selects by theme to avoid hydration swaps; the light artwork has an image-only scale/translation compensation.
- Robotics mobile now uses one product at a time with previous/next controls, wraparound, a mobile specification list, and 44px controls. Desktop retains the comparison grid/table.
- Robotics mobile hero keeps the image and wordmark in one composed frame instead of separating copy from the robot.
- Education mobile carousel is shorter, controls are 44px, and play/pause is explicit. The Navi feature artwork is visible in light mode and blended into empty space with a white-to-transparent overlay that protects black copy.
- Navi's language selector belongs to the hero and is not fixed over scrolled content.
- News cards stack full metadata/title, full-width 16:9 image, excerpt, and Read More on phones; desktop returns to the two-column card.
- AI & Robotics Club navigation wraps; mobile topic/project detail uses disclosure sections; the Apply action is in document flow rather than a fixed overlay. English and Chinese pages stay aligned.
- Homepage has a stable mobile hero fallback and uses the white Agentech logo. The homepage mobile theme selector is intentionally hidden; other eligible mobile pages keep accessible 44px theme targets.
- Talents light hero uses a stronger mobile copy-protection overlay and full-width stacked actions.

The largest current delta is `app/globals.css`, so never replace it wholesale. Stable `data-*` hooks are deliberate test seams.

## Visual and interaction language

- Light canvas: `#f5f4f1`; light surfaces are white or `#fbfaf7`; dark canvas is near-black, with blue/cyan accents.
- Display = Oxanium; Interface = Manrope; Technical = IBM Plex Mono. Do not make body copy or navigation monospaced.
- Use at least 44px mobile targets. Keep long navigation labels on one line where the tested menu width permits it.
- Cards/actions/navigation generally use a 12px interaction radius; page hero cards may use larger editorial radii.
- A menu item without subdivisions is one full clickable surface when it has a real route.
- A hover menu must remain usable when the pointer moves diagonally from trigger to panel; never close immediately on trigger leave.
- Keep desktop compositions intact when fixing phone density. Desktop nav begins at the `lg` breakpoint so the brand and controls do not collide.

## Relevant tests

```bash
pnpm test:site-header-visibility
pnpm test:theme
pnpm test:talents-page
node --experimental-strip-types --test lib/mobile-priority-ui.test.ts lib/mobile-medium-priority-ui.test.ts lib/robotics-product-browser.test.ts
node --test scripts/ai-robotics-club-ux.test.mjs
pnpm typecheck
pnpm build
```

Browser-check helpers exist for Service, Platform, hover tolerance, navigation cards, Login themes, and Navi themes in `scripts/*browser-check.mjs`. Use a real browser at the exact route/theme/viewport; a source test alone is not visual verification.

Snapshot verification note: navigation passed 23/23, theme passed 25/25, and Talents passed 9/9. The combined mobile suite passed 10/11. Its single failure is a brittle source regex in `lib/mobile-medium-priority-ui.test.ts`: it requires `className` to be the first `<section>` attribute, while the implementation now places `data-navi-hero` before `className`; `LanguageToggle` is still inside the hero. Re-verify in a browser, then make the assertion attribute-order-independent if that test is in scope.

## Common failure modes

- Editing a bitmap before checking CSS opacity, filter, mask, or overlay.
- Adding a global light/dark override that breaks unrelated routes.
- Making a submenu visually open but impossible to reach across the hover gap.
- Treating label-only future categories as working links.
- Hiding text or images to make mobile fit instead of changing composition.
- Testing only `localhost:3000`, which may be a stale process; use a free port such as 3001 and verify the exact process.
- Giving a phone `127.0.0.1`; that address points to the phone itself. Use the development Mac's LAN address with a server bound to the network, or a verified public preview URL.
