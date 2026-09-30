# Motion Store In-Place Redesign

## Summary

Redesign the existing `/skill-market` route in place as AgentTech's Motion Store. The route and its location under the Platform navigation remain unchanged. The current placeholder experience is replaced with a polished, responsive storefront for robot motions, using local mock data and no backend, checkout, authentication, licensing, downloads, or real motion assets.

The experience borrows the browsing hierarchy of a premium digital store—large previews, horizontal featured browsing, concise product information, and restrained interaction—while preserving AgentTech's typography, dark visual language, blue interactive accent, orange supporting accent, borders, spacing, shared header, shared footer, themes, and motion conventions.

## Scope

### Included

- Rename the visible navigation item from `SKILL MARKET` to `MOTION STORE` while keeping its existing `/skill-market` target and navigation position.
- Replace the `/skill-market` placeholder with a compact store introduction.
- Add a horizontally scrollable Featured Motions collection.
- Add local search and category filters.
- Add a responsive catalog grid driven by centralized mock data.
- Add reusable motion card and motion preview components.
- Add an in-page modal detail experience with placeholder metadata and a disabled `Coming Soon` action.
- Support desktop, tablet, and mobile layouts with accessible keyboard and touch interactions.
- Add focused regression coverage, type checking, production build verification, and browser verification at `/skill-market`.

### Excluded

- New routes, including `/motion-store` and per-motion detail routes.
- Backend, database, CMS, API integration, authentication, checkout, payments, licensing, downloads, or compatibility logic.
- Real motion files, videos, pricing, thumbnails, WebGL, or 3D viewers.
- Global header/footer redesign or unrelated page changes.

## Architecture

The existing server route remains the metadata and composition entry point:

- `app/skill-market/page.tsx` retains `/skill-market`, updates the page metadata to Motion Store, and renders the store experience.
- `components/motion-store/motion-store.tsx` owns local search, category selection, selected-motion state, and modal open/close behavior.
- `components/motion-store/motion-card.tsx` renders reusable featured and catalog card variants from the same motion record.
- `components/motion-store/motion-preview.tsx` is the replaceable media boundary. It receives a preview descriptor and currently renders a restrained abstract placeholder. Its public shape supports later image, video, WebGL, 3D, or animated implementations without changing the card layout.
- `components/motion-store/motion-detail-modal.tsx` renders the selected motion in an accessible overlay without changing routes.
- `components/motion-store/motion-store.module.css` scopes the store's layout, theme treatment, hover states, modal, and responsive behavior to this page.
- `lib/motion-store-data.ts` exports motion types, category definitions, and a single mock catalog used by featured cards, the grid, search, and details.

No store state is persisted. Filtering is deterministic client-side derived state.

## Data Model

Each motion record includes:

- `id` and `slug`
- `name`
- `category`
- `description`
- `status` and optional future-facing `price`
- `featured`
- `preview` with a discriminated `type` and optional source
- placeholder technical metadata: motion type, duration, robot compatibility, format, and version

Initial data includes Golf Swing, Walk Forward, Run, Wave, Boxing Combo, Dance 01, Pick Up Object, Sit Down, and Stand Up. Featured content is selected from the same array rather than duplicated.

## Page Experience

### Store introduction

The first viewport starts with a compact `MOTION STORE` label, the headline `Motion, ready to move.`, and concise supporting copy. The section must not push product browsing below an oversized hero.

### Featured motions

Featured cards use the largest preview proportion on the page and scroll horizontally with mouse, trackpad, and touch. The strip preserves a visible portion of the next card where practical to communicate scrollability. Cards contain only the motion name, category, short description, `Coming Soon`, and `View Motion`.

### Browse motions

Search matches motion name, category, and description case-insensitively. Category chips include All, Locomotion, Sports, Gestures, Dance, Combat, and Utility. Search and category selection combine. A concise empty state appears when no motion matches, with a control to clear active filters.

### Catalog grid

The catalog uses three or four columns where the existing content width supports them, two columns on tablets, and one column on phones. Preview media remains visually dominant. Text and status stay compact and consistently aligned.

### Detail modal

Selecting `View Motion` opens an in-page modal containing a larger preview, motion identity, description, technical metadata, and disabled `Coming Soon` primary action. The modal:

- uses an accessible dialog name and modal semantics;
- closes with its close control, Escape, or a click on the backdrop;
- returns focus to the initiating card/control;
- prevents background scrolling while open;
- remains usable on small screens through internal scrolling;
- does not modify the URL or create history entries.

## Visual Direction

The visual thesis is a dark robotics showroom: wide cinematic preview panels, precise technical labeling, quiet borders, and restrained blue/orange signals. Oxanium remains responsible for display headings, Manrope for interface and descriptive copy, and IBM Plex Mono for metadata. Existing theme variables are reused rather than introducing an isolated design system.

Placeholder previews use CSS/SVG-based non-representational motion diagrams—joint nodes, trajectory paths, grid or stage lines, and motion-specific directional rhythm. They are not stock photographs and do not pretend to be real motion footage. Hover treatment is limited to a small preview scale, subtle border/light adjustment, and short arrow translation. Reduced-motion preferences disable nonessential movement.

Light theme remains supported through the existing global variables and page-scoped overrides where necessary; the default dark experience remains the primary art direction.

## Responsive and Accessibility Requirements

- Featured cards are horizontally swipeable on mobile.
- Category filters remain in one horizontally scrollable row on narrow screens.
- Catalog columns reduce from desktop to two on tablet and one on mobile.
- Interactive targets are at least 44px on mobile.
- Focus states are visible and match AgentTech's blue interaction color.
- Cards use semantic buttons or links according to behavior; because details open a modal, the detail trigger is a button.
- Search has a visible label or accessible name.
- Modal focus and background scroll are managed correctly.
- Text remains readable at browser zoom and layouts avoid horizontal page overflow.

## Error and Empty States

Because all data is local, no loading or network error state is required. The catalog handles an empty filtered result explicitly. An unavailable preview type falls back to the abstract placeholder rather than leaving an empty media region. Missing optional metadata renders a neutral placeholder value rather than breaking layout.

## Testing and Verification

Implementation follows the repository's test-first UI workflow:

1. Add focused source/behavior regression tests for the retained `/skill-market` route, navigation rename, centralized data rendering contract, filter behavior, modal structure, and responsive hooks.
2. Observe the focused tests fail before production implementation.
3. Implement the smallest clean component set described above.
4. Run focused Motion Store tests and the existing navigation/theme tests.
5. Run `pnpm typecheck`, then `pnpm build` sequentially.
6. Verify `/skill-market` in a real browser in dark and light themes at desktop, tablet, and mobile widths.
7. Confirm search, every category filter, combined filtering, empty state, horizontal scrolling, modal open/close paths, Escape handling, focus return, background scroll lock, touch targets, and console cleanliness.

## Change Boundary

Only the existing Skill Market route, its Platform navigation label, new Motion Store-specific components/data/styles/tests, and metadata are changed. Existing global components and unrelated pages remain intact. The pre-existing modification to `public/assets/aigc/full-animation-showcase.mp4` is preserved and excluded from this work's commits.
