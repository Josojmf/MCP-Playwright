---
phase: 11
plan: 11-02
subsystem: ui
tags: [react, scorecard, replay, accordion, metrics]
dependency_graph:
  requires: [11-01]
  provides: [run-scorecard, replay-accordion, shared-step-flag-styles]
  affects: [run-ui, post-run-analysis, src/client/App.tsx]
tech_stack:
  added: [RunScorecard component, shared step-flag utility]
  patterns: [run-state conditional swap, collapsed replay accordions, shared flag presentation]
key_files:
  created:
    - src/client/components/run/RunScorecard.tsx
    - src/client/components/run/StepFlagStyles.ts
  modified:
    - src/client/App.tsx
    - src/client/components/run/McpColumn.tsx
decisions:
  - "Run completion swaps the live view inline for the scorecard rather than navigating away or animating between views."
  - "Replay sections default to collapsed per MCP to keep the metrics table as the primary summary surface."
  - "Suspicious-step styling is shared through a utility so the live view and replay stay visually aligned."
metrics:
  duration: "~35 minutes"
  completed: "2026-04-02T14:25:00+02:00"
  tasks_completed: 3
  verification:
    - "npm run typecheck"
    - "npm run build"
---

# Phase 11 Plan 11-02: Post-Run Scorecard Summary

**Completed and aborted runs now swap into a scorecard with per-MCP metrics, expandable replay rows, and shared suspicious-step highlighting.**

## Objective Achieved

- Added `RunScorecard.tsx` for completed and aborted runs.
- Replaced the single-state live-run render block in `App.tsx` with a run-state switch: live columns while running, scorecard after completion or abort.
- Extracted shared flag presentation into `StepFlagStyles.ts` so hallucinated and review-needed rows look the same in live and replay contexts.

## Implementation Summary

### Task 1: Scorecard Metrics Table

- The scorecard renders one row per MCP with pass rate, hallucination count, total tokens, and average latency.
- The metrics table is the first visible section so the run summary is readable at a glance.

### Task 2: Replay Accordion

- Each MCP replay section defaults to collapsed.
- Expanding an MCP reveals step rows; expanding a step reveals the inline screenshot and direct screenshot link.
- Partial data continues to render when a run is aborted.

### Task 3: Shared Flag Styling

- `StepFlagStyles.ts` centralizes the row treatment metadata for `hallucinated` and `needsReview`.
- `McpColumn.tsx` and `RunScorecard.tsx` both consume the same utility, keeping labels and visual emphasis aligned.

## Decisions Made

- Kept the scorecard fully local to the existing run screen so there is no route or navigation change after execution.
- Used `progressByMcp` totals for the summary table because those values already reflect the final accumulated run data.
- Left the replay images inline and linked to `/api/screenshots/:id`, matching the history detail pattern already present in the app.

## Deviations from Plan

- The plan listed `lastScreenshotByMcp` in the scorecard props even though the replay view only needs per-step screenshot IDs; the prop remains on the component boundary for consistency, but the implementation relies on the step-level evidence.
- No separate post-run animation was added; the swap is immediate, matching the UI spec’s “instant swap” requirement.

## Issues Encountered

- None in the code path after the live-view foundation was in place.

## Verification

- `npm run typecheck` ✅
- `npm run build` ✅ (outside sandbox)

## Next Phase Readiness

- Phase 11 now has both runtime states covered: live execution and post-run analysis.
- The shared flag utility can be reused by future history or export views if Phase 12 extends run analytics further.
