# AI Services EAIS Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `/ai-service` with the existing EAIS product-system primitives while preserving its content, links, route, and behavior.

**Architecture:** Import the EAIS CSS module directly and apply its page shell, rail, top bar, typography, card, action, process, and breakpoint classes in the AI Services page. Keep `ai-services.css` limited to service-specific layout and preview composition that EAIS does not provide.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS Modules, Node test runner.

**Spec:** `/Users/agentech/.codex/attachments/36a50843-5455-4f60-b501-4372955dae5c/Pasted text.txt`

## Global Constraints

- Preserve `/ai-service`, all service content, existing links, functionality, global navigation, and the distinction between AI Website and AI App Development.
- Reuse EAIS typography roles and tokens instead of creating a separate palette or font system.
- Desktop uses two service cards; mobile stacks them at the EAIS 767px breakpoint.
- Do not modify unrelated pages or overwrite existing worktree changes.

## Review Focus

- Dark and light themes both inherit the EAIS page tokens.
- The top bar remains usable below the 72px global header.
- Service previews stay within the shared 224px image frame without distortion.
- Keyboard focus remains visible on profile, navigation, card, and agency links.
- The 1023px rail collapse and 767px card stack preserve readable density.

---

### Task 1: Bind AI Services to EAIS primitives

**Files:**
- Modify: `scripts/ai-services.test.mjs`
- Modify: `app/ai-service/page.tsx`

**Interfaces:**
- Consumes: exported classes from `app/agentech-products/eais/eais-showcase.module.css`
- Produces: semantic AI Services markup using the EAIS page, rail, top bar, section, card, action, and process classes

- [ ] Add a source-level regression test for the EAIS module import and required primitive mappings.
- [ ] Run `node --test scripts/ai-services.test.mjs` and verify the new assertion fails.
- [ ] Update `page.tsx` while preserving content and URLs.
- [ ] Run the focused test and verify it passes.

### Task 2: Compose service-specific responsive layout

**Files:**
- Modify: `app/ai-service/ai-services.css`

**Interfaces:**
- Consumes: the semantic hooks and EAIS classes from Task 1
- Produces: compact two-column cards, controlled previews, and matching tablet/mobile behavior

- [ ] Add CSS assertions for the two-column layout, 224px media frame, and 767px single-column breakpoint.
- [ ] Run the focused test and verify the assertions fail before the CSS rewrite.
- [ ] Replace the standalone microsite styling with narrowly scoped EAIS adapters.
- [ ] Run focused tests, typecheck, lint for touched files, and production build.
- [ ] Compare `/agentech-products/eais` and `/ai-service` at matching desktop and mobile viewports and correct visual mismatches.
