---
phase: 11-execution-transparency-and-live-playwright-step-viewer
plan: "03"
subsystem: ui
tags: [react, live-run, sse, resize-observer, mcp-column-grid, viewport-swap]

requires:
  - phase: 11-execution-transparency-and-live-playwright-step-viewer
    provides: McpColumnGrid component and live MCP column layout from 11-01

provides:
  - Running-state viewport takeover in App.tsx — pre-run layout hidden during active runs
  - Hardened ResizeObserver guard in McpColumnGrid with fallback width seeding

affects:
  - 11-UAT (Tests 1 and 3 now re-testable)

tech-stack:
  added: []
  patterns:
    - "Three-branch runState render pattern: pre-run (idle/estimating/awaiting/error), running, post-run (completed/aborted)"
    - "Defensive ResizeObserver guard: typeof check + try/catch construction + fallback seed from getBoundingClientRect()"

key-files:
  created: []
  modified:
    - src/client/App.tsx
    - src/client/components/run/McpColumnGrid.tsx

key-decisions:
  - "Three-branch runState render in App.tsx — running gets its own top-level path so McpColumnGrid is always the primary content during active runs"
  - "Fallback width seed from getBoundingClientRect() before ResizeObserver fires ensures tabs vs grid decision is deterministic even without the API"

patterns-established:
  - "Pattern: Running-state viewport swap — guard runState branches at the new_run section level, not deeper in the layout tree"
  - "Pattern: Defensive browser API guard — check typeof before constructing, catch both construction and observe() calls, wrap disconnect() too"

requirements-completed: [UI-04, UI-05, UI-07]

duration: 3min
completed: "2026-04-04"
---

# Phase 11 Plan 03: Execution Transparency Gap Closure Summary

**Running-state viewport swap in App.tsx and hardened ResizeObserver guard in McpColumnGrid to fix UAT-reported white screen and live surface visibility failures.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-04T10:47:17Z
- **Completed:** 2026-04-04T10:50:29Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added a dedicated `runState === "running"` render branch that swaps the entire new-run content area to the live MCP grid, making `McpColumnGrid` the primary visible surface during active runs
- Pre-run editor/setup/sidebar layout is now fully hidden while a run is in progress — users no longer see the editor behind the live view
- Compact Live Console rendered below the grid during running state for auxiliary event log visibility
- Completed/aborted scorecard path preserved intact via a separate post-run branch
- Guarded `ResizeObserver` construction in McpColumnGrid with a `typeof` availability check, try/catch around both `new ResizeObserver()` and `.observe()`, and an immediate fallback width seed from `getBoundingClientRect()`
- Grid vs tabs decision remains deterministic even when observer is unavailable

## Task Commits

Each task was committed atomically:

1. **Task 1: Promote live run surface to primary viewport** - `605ee20f` (feat)
2. **Task 2: Guard ResizeObserver in McpColumnGrid** - `ed3436a7` (fix)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified

- `src/client/App.tsx` - Three-branch runState render: pre-run setup, running live surface, post-run scorecard
- `src/client/components/run/McpColumnGrid.tsx` - Defensive ResizeObserver guard with fallback width seeding

## Decisions Made

- Three-branch runState structure in App.tsx rather than CSS hide/show: cleaner React semantics, avoids rendering heavy editor DOM during active runs, eliminates event handler conflicts
- Seed width from `getBoundingClientRect()` before any observer fires so the grid vs tabs decision uses a real value on first render rather than the `Infinity` default

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unreachable `runState === "running"` disabled check in pre-run branch**
- **Found during:** Task 1 (viewport takeover refactor)
- **Issue:** TypeScript reported `TS2367` — inside the `else` (pre-run) branch, `runState` can only be `idle | estimating | awaiting_confirmation | error`, so comparing to `"running"` is always false and constitutes a type error
- **Fix:** Changed `disabled={runState === "estimating" || runState === "running"}` to `disabled={runState === "estimating"}` — functionally equivalent since the button is never rendered while running anyway
- **Files modified:** `src/client/App.tsx`
- **Verification:** `npm run typecheck` passes cleanly
- **Committed in:** `605ee20f` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Minimal — TypeScript enforcement of the new render structure surfaced an unreachable guard. Fix is safe and strictly equivalent.

## Issues Encountered

None beyond the TypeScript type narrowing fix documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- UAT Tests 1 and 3 (live surface visibility, suspicious step flagging) are now re-testable
- Test 2 (screenshot lightbox white screen) remains open — tracked in 11-UAT.md Gaps and requires a separate fix to ScreenshotLightbox.tsx (uses incorrect Base UI dialog anatomy)
- Phase 11 live run experience is now resilient for re-UAT

## Self-Check: PASSED

- `src/client/App.tsx` modified — exists and contains `runState === "running"` branch
- `src/client/components/run/McpColumnGrid.tsx` modified — exists and contains `typeof ResizeObserver` guard
- Commits `605ee20f` and `ed3436a7` exist in git log

---
*Phase: 11-execution-transparency-and-live-playwright-step-viewer*
*Completed: 2026-04-04*
