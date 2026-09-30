# Motion Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing `/skill-market` placeholder in place with a responsive, accessible Motion Store powered by centralized mock data.

**Architecture:** Keep `app/skill-market/page.tsx` as the existing route and server metadata boundary, then render one client-owned store composition. Separate catalog data, preview rendering, reusable cards, and modal behavior so real media and API data can replace placeholders without changing the browsing UI.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, CSS Modules, Node test runner, PostCSS, browser automation through the existing AgentTech browser-check pattern.

**Spec:** `docs/superpowers/specs/2026-09-29-motion-store-design.md`

## Global Constraints

- Keep the existing `/skill-market` route and existing Platform navigation position; create no `/motion-store` or per-motion routes.
- Rename the visible navigation item from `SKILL MARKET` to `MOTION STORE`.
- Preserve shared header, footer, global architecture, typography responsibilities, themes, and unrelated pages.
- Use local mock data only; do not add backend, API, database, authentication, checkout, payments, licensing, downloads, CMS, or real motion assets.
- Keep preview media visually dominant and make the preview boundary replaceable by image, video, WebGL, 3D, or animation later.
- Preserve the unrelated modified file `public/assets/aigc/full-animation-showcase.mp4` and exclude it from all commits.
- Use at least 44px touch targets on mobile and respect `prefers-reduced-motion`.
- Run `pnpm typecheck` and `pnpm build` sequentially, never concurrently.

## Review Focus

- A search containing uppercase letters or leading/trailing whitespace must match names, categories, and descriptions case-insensitively; Task 2 pins normalization.
- A category plus search query yielding zero results must show the resettable empty state rather than a blank grid; Task 2 pins the empty result and Task 4 pins its presentation and reset action.
- Unknown or source-less preview descriptors must render the abstract fallback instead of an empty or broken media area; Task 3 pins preview fallback.
- Modal dismissal by Escape, backdrop, and close button must restore focus and background scrolling; Task 4 pins every dismissal path.
- Narrow viewports must avoid page-level horizontal overflow while keeping featured cards and category chips independently scrollable; Task 5 pins layout hooks and browser verification.

---

### Task 1: Route Identity and Central Motion Catalog

**Files:**
- Create: `lib/motion-store-data.ts`
- Create: `lib/motion-store-data.test.ts`
- Modify: `lib/site-data.ts`
- Modify: `lib/service-navigation.test.ts`
- Modify: `scripts/platform-menu-browser-check.mjs`
- Modify: `app/skill-market/page.tsx`

**Interfaces:**
- Produces: `MotionCategory`, `MotionPreview`, `MotionProduct`, `motionCategories`, `motionCatalog`, and `featuredMotions` from `lib/motion-store-data.ts`.
- Produces: Platform navigation item `{ label: "MOTION STORE", href: "/skill-market" }`.
- Produces: `/skill-market` metadata title `Motion Store` and description `Browse robot-ready motion from Agentech.`.

- [ ] **Step 1: Write failing catalog and navigation tests**

Add tests asserting nine unique motion records, required categories, exact featured derivation, required metadata fields, the `MOTION STORE` navigation label with unchanged href/order, and updated browser-check expectations.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `node --experimental-strip-types --test lib/motion-store-data.test.ts lib/service-navigation.test.ts`

Expected: FAIL because `motion-store-data.ts` is missing and navigation still says `SKILL MARKET`.

- [ ] **Step 3: Implement the typed catalog and route identity**

Define `MotionCategory = "Locomotion" | "Sports" | "Gestures" | "Dance" | "Combat" | "Utility"`, a discriminated preview descriptor, and `MotionProduct` with the spec's fields. Export the category list and nine-record mock catalog; derive `featuredMotions` with `.filter((motion) => motion.featured)`. Update the navigation, browser-check expectation, and route metadata without changing `/skill-market`.

- [ ] **Step 4: Run the focused tests and confirm success**

Run: `node --experimental-strip-types --test lib/motion-store-data.test.ts lib/service-navigation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add app/skill-market/page.tsx lib/motion-store-data.ts lib/motion-store-data.test.ts lib/site-data.ts lib/service-navigation.test.ts scripts/platform-menu-browser-check.mjs
git commit -m "feat: define motion store catalog"
```

### Task 2: Deterministic Search and Category Filtering

**Files:**
- Create: `lib/motion-store-filter.ts`
- Create: `lib/motion-store-filter.test.ts`

**Interfaces:**
- Consumes: `MotionProduct` and `MotionCategory` from Task 1.
- Produces: `type MotionFilterCategory = "All" | MotionCategory`.
- Produces: `filterMotions(motions: readonly MotionProduct[], query: string, category: MotionFilterCategory): MotionProduct[]`.

- [ ] **Step 1: Write failing filter tests**

Cover All with an empty query, case-insensitive name matching, trimmed category matching, description matching, category-only filtering, combined filtering, no matches, and preservation of input order without mutation.

- [ ] **Step 2: Run the filter tests and confirm failure**

Run: `node --experimental-strip-types --test lib/motion-store-filter.test.ts`

Expected: FAIL because the filter module is missing.

- [ ] **Step 3: Implement `filterMotions`**

Normalize query with `trim().toLocaleLowerCase()`, compare against name/category/description, apply category and text predicates together, and return a new filtered array without sorting or mutating the source.

- [ ] **Step 4: Run the filter tests and confirm success**

Run: `node --experimental-strip-types --test lib/motion-store-filter.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add lib/motion-store-filter.ts lib/motion-store-filter.test.ts
git commit -m "feat: add motion catalog filtering"
```

### Task 3: Preview Boundary and Reusable Product Cards

**Files:**
- Create: `components/motion-store/motion-preview.tsx`
- Create: `components/motion-store/motion-card.tsx`
- Create: `components/motion-store/motion-store.module.css`
- Create: `lib/motion-store-components.test.ts`

**Interfaces:**
- Consumes: `MotionProduct` and `MotionPreview` from Task 1.
- Produces: `MotionPreviewView({ preview, name, featured? }: { preview: MotionPreview; name: string; featured?: boolean }): JSX.Element`.
- Produces: `MotionCard({ motion, variant, onView }: { motion: MotionProduct; variant: "featured" | "catalog"; onView: (motion: MotionProduct, trigger: HTMLButtonElement) => void }): JSX.Element`.

- [ ] **Step 1: Write failing component-contract and CSS tests**

Assert semantic View Motion buttons, stable `data-motion-card` and `data-motion-preview` hooks, featured/catalog variants, visible name/category/description/status content, fallback preview markup, dominant preview aspect ratios, restrained hover transforms, visible focus styles, and reduced-motion overrides.

- [ ] **Step 2: Run the component tests and confirm failure**

Run: `node --experimental-strip-types --test lib/motion-store-components.test.ts`

Expected: FAIL because the components and stylesheet do not exist.

- [ ] **Step 3: Implement the preview boundary**

Render an accessible decorative placeholder using CSS plus inline non-representational SVG trajectory/joint geometry selected from the motion's preview motif. Any unsupported or missing source falls back to this placeholder and exposes no broken media element.

- [ ] **Step 4: Implement reusable featured and catalog cards**

Use a button for modal behavior, pass its element to `onView`, keep preview first and visually dominant, and render all copy from the supplied `MotionProduct`. Limit hover changes to small preview scale, border/light adjustment, and arrow translation.

- [ ] **Step 5: Run the component tests and confirm success**

Run: `node --experimental-strip-types --test lib/motion-store-components.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add components/motion-store/motion-preview.tsx components/motion-store/motion-card.tsx components/motion-store/motion-store.module.css lib/motion-store-components.test.ts
git commit -m "feat: add motion product cards"
```

### Task 4: Store Composition and Accessible Detail Modal

**Files:**
- Create: `components/motion-store/motion-detail-modal.tsx`
- Create: `components/motion-store/motion-store.tsx`
- Modify: `components/motion-store/motion-store.module.css`
- Modify: `app/skill-market/page.tsx`
- Create: `scripts/motion-store-browser-check.mjs`
- Create: `lib/motion-store-experience.test.ts`

**Interfaces:**
- Consumes: catalog exports from Task 1, `filterMotions` from Task 2, and card/preview components from Task 3.
- Produces: `MotionDetailModal({ motion, onClose }: { motion: MotionProduct; onClose: () => void }): JSX.Element | null`.
- Produces: `MotionStore(): JSX.Element` as the sole page experience rendered by `/skill-market`.

- [ ] **Step 1: Write failing experience-contract tests**

Assert the exact intro copy, Featured Motions and Browse Motions headings, labeled search input, all seven chips, filtered empty-state reset control, modal dialog semantics, placeholder metadata labels, disabled `Coming Soon` action, close control, Escape listener, backdrop handling, scroll-lock cleanup, and focus-return mechanism.

- [ ] **Step 2: Run the experience tests and confirm failure**

Run: `node --experimental-strip-types --test lib/motion-store-experience.test.ts`

Expected: FAIL because the store composition and modal do not exist.

- [ ] **Step 3: Implement the detail modal lifecycle**

On open, capture the initiating button in `MotionStore`; in the modal, save and restore `document.body.style.overflow`, listen for Escape, focus the close button, close only when `event.target === event.currentTarget` on the backdrop, and restore focus after selection is cleared.

- [ ] **Step 4: Implement the store composition**

Render the compact intro, `featuredMotions` horizontal rail, controlled search, horizontally scrollable category buttons, filtered grid, and resettable empty state. Selecting any card opens the same detail modal without navigation or history changes.

- [ ] **Step 5: Replace the route placeholder**

Update `app/skill-market/page.tsx` to render `<MotionStore />`; retain the server component and metadata boundary.

- [ ] **Step 6: Implement the browser-check helper**

Export `checkMotionStore(tab, viewport)` to verify route copy, navigation identity, search/category/combined filtering, empty reset, modal open/close through every dismissal path, disabled action, focus return, scroll unlock, horizontal rails, and no page overflow or console errors.

- [ ] **Step 7: Run experience and prior focused tests**

Run: `node --experimental-strip-types --test lib/motion-store-data.test.ts lib/motion-store-filter.test.ts lib/motion-store-components.test.ts lib/motion-store-experience.test.ts lib/service-navigation.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add app/skill-market/page.tsx components/motion-store/motion-detail-modal.tsx components/motion-store/motion-store.tsx components/motion-store/motion-store.module.css scripts/motion-store-browser-check.mjs lib/motion-store-experience.test.ts
git commit -m "feat: build motion store experience"
```

### Task 5: Responsive Polish and Full Verification

**Files:**
- Modify: `components/motion-store/motion-store.module.css`
- Modify: `lib/motion-store-components.test.ts`
- Modify: `lib/motion-store-experience.test.ts`
- Modify if browser evidence requires: Motion Store files created in Tasks 1–4 only

**Interfaces:**
- Consumes: all prior task interfaces.
- Produces: verified `/skill-market` experience across supported themes and viewports.

- [ ] **Step 1: Add failing responsive assertions**

Assert desktop grid columns, tablet two-column media rule, mobile one-column media rule, featured and chip `overflow-x: auto`, 44px mobile controls, internal modal scrolling, page overflow containment, and reduced-motion coverage.

- [ ] **Step 2: Run focused responsive tests and confirm failure**

Run: `node --experimental-strip-types --test lib/motion-store-components.test.ts lib/motion-store-experience.test.ts`

Expected: FAIL on responsive rules not yet finalized.

- [ ] **Step 3: Complete responsive and theme styling**

Finalize desktop/tablet/mobile grids, swipe rails, modal stacking, light-theme page-scoped colors, safe-area spacing, text scaling, and overflow containment using the existing AgentTech tokens and typography responsibilities.

- [ ] **Step 4: Run all focused and shared regression tests**

Run: `node --experimental-strip-types --test lib/motion-store-data.test.ts lib/motion-store-filter.test.ts lib/motion-store-components.test.ts lib/motion-store-experience.test.ts lib/service-navigation.test.ts lib/theme-page-scopes.test.ts`

Expected: PASS.

Run: `pnpm test:site-header-visibility`

Expected: PASS.

- [ ] **Step 5: Run static and production verification sequentially**

Run: `pnpm typecheck`

Expected: exit 0.

Run: `pnpm build`

Expected: exit 0 and `/skill-market` included in the build output.

- [ ] **Step 6: Verify in a real browser**

Start the current branch on a free port and run `checkMotionStore` at desktop, tablet, and phone widths in dark and light themes. Confirm all nine products, every filter, search normalization, combined empty/reset flow, featured swiping, modal focus/scroll behavior, 44px controls, no page overflow, and a clean console.

- [ ] **Step 7: Review the diff boundary**

Run: `git status --short` and `git diff --check HEAD^..HEAD` plus the current task diff. Confirm no unrelated files changed and `public/assets/aigc/full-animation-showcase.mp4` remains untouched and unstaged.

- [ ] **Step 8: Commit Task 5**

```bash
git add components/motion-store/motion-store.module.css lib/motion-store-components.test.ts lib/motion-store-experience.test.ts
git commit -m "test: verify motion store experience"
```

If browser verification requires a scoped fix, include only the affected Motion Store file and its regression assertion in this commit.
