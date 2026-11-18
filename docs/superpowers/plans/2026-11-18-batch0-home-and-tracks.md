# Batch 0: home, nav and tracks Implementation Plan

> **For agentic workers:** run natively with superpowers:executing-plans.

**Goal:** `/` becomes the learning path; `/learn` groups lessons by track; the old curriculum moves to `/curriculum` as "Deep dives".

**Architecture:** `content/outline.yaml` rows gain an optional `track` (default `path`). `src/lib/decks/weeks.ts` returns `{track, week}` per deck. `LearnList` renders track sections, each with week sub-headings when the track has weeks.

**Spec:** docs/superpowers/specs/2026-11-18-full-curriculum-design.md

## Global Constraints
- Next.js here has breaking changes: read `node_modules/next/dist/docs/` before writing Next code.
- No deletion of old topic files. localStorage keys `sigma-done` and `sigma-start` unchanged.

## Review Focus
- Deck missing from outline: lands in track `path`, week 8, never crashes.
- Empty track: not rendered.
- localStorage unavailable: page still renders.

### Task 1: Track-aware grouping
**Files:** modify `src/lib/decks/weeks.ts`, `src/app/learn/page.tsx`, `src/components/deck/LearnList.tsx`; test `tests/decks.test.ts`.
**Interfaces:** Produces `deckPlacement(): Record<string, {track: string; week: number}>`; `Week` type gains `track`.
- [ ] Test: `deckPlacement()["numbers-and-functions"]` equals `{track:"path", week:1}`; unknown id absent.
- [ ] Implement, run `pnpm test`: pass.

### Task 2: Home and nav
**Files:** move `src/app/page.tsx` content to `src/app/curriculum/page.tsx`; new `src/app/page.tsx`; modify `src/components/SiteNav.tsx`.
- [ ] `/` shows hero, Continue button, track cards (path now; DSA, Interview, Deep dives); nav: Learn first, Deep dives replaces Curriculum.
- [ ] `pnpm typecheck && pnpm build`; check `/`, `/learn`, `/curriculum` return 200 and links resolve.
