---
phase: 11-execution-transparency-and-live-playwright-step-viewer
plan: "04"
subsystem: client/run
tags: [dialog, lightbox, screenshot, ui-fix, modal]
dependency_graph:
  requires: []
  provides: [working-screenshot-lightbox]
  affects: [src/client/components/run/ScreenshotLightbox.tsx, src/client/components/ui/dialog.tsx]
tech_stack:
  added: []
  patterns: [shared-dialog-content-anatomy, overlayClassName-prop]
key_files:
  created: []
  modified:
    - src/client/components/run/ScreenshotLightbox.tsx
    - src/client/components/ui/dialog.tsx
decisions:
  - "Use shared DialogContent from dialog.tsx rather than manual DialogPrimitive composition to fix the blank modal regression"
  - "Add overlayClassName prop to DialogContent so lightbox can override overlay to dark/non-blurred without forking the component"
metrics:
  duration: "3m"
  completed: "2026-04-04"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 2
---

# Phase 11 Plan 04: Screenshot Lightbox Modal Fix Summary

Rebuilt `ScreenshotLightbox` with the app's shared dialog anatomy (`Dialog + DialogContent`) instead of manually composing `DialogPrimitive.Backdrop + DialogPrimitive.Popup` alongside the app's `Dialog` root, which caused a broken modal structure with a white/blank content area.

## What Changed

### Root Cause

`ScreenshotLightbox.tsx` was wrapping `Dialog > DialogPortal > DialogPrimitive.Backdrop + DialogPrimitive.Popup` directly. The app's `DialogContent` component already provides the complete `DialogPortal > DialogOverlay > DialogPrimitive.Popup` anatomy. Mixing a partial app wrapper with direct Base UI primitives broke the component tree — the overlay rendered but the popup content did not display correctly.

### Fix Applied

**`src/client/components/ui/dialog.tsx`:**
- Added `overlayClassName?: string` prop to `DialogContent`
- `DialogOverlay` now forwards the `overlayClassName` so callers can override overlay styling without duplicating the component

**`src/client/components/run/ScreenshotLightbox.tsx`:**
- Removed all direct `@base-ui/react/dialog` imports
- Rebuilt using `Dialog + DialogContent` from the shared abstraction
- Passes `overlayClassName="bg-black/55 backdrop-filter-none"` for the required dark non-blurred overlay
- Passes `showCloseButton={false}` to render a custom header row with `DialogHeader + DialogTitle + DialogClose`
- Preserves screenshot URL wiring and sizing constraints (90vw / 90vh)

## Verification

- `npm run typecheck` — passed (0 errors)
- `npm run build` — passed (dist built in 662ms)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1    | 98c98df9 | fix(11-04): rebuild ScreenshotLightbox with shared dialog anatomy |

## Deviations from Plan

None — plan executed exactly as written. The `overlayClassName` prop addition to `DialogContent` is the minimum shared-dialog adjustment described in the plan action.

## Known Stubs

None.

## Self-Check: PASSED

- `src/client/components/run/ScreenshotLightbox.tsx` — FOUND (modified)
- `src/client/components/ui/dialog.tsx` — FOUND (modified)
- Commit 98c98df9 — FOUND
