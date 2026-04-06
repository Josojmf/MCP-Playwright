---
phase: 01-step-level-execution-traceability-screenshots-detailed-logs-and-real-time-visibility-per-step
plan: "03"
subsystem: frontend-live-ui
tags: [screenshots, thumbnails, sse, tool-calls, live-view, history]
dependency_graph:
  requires: ["01-01", "01-02"]
  provides: ["screenshot-thumbnails-live", "screenshot-thumbnails-history", "tool-call-sse-wiring"]
  affects: ["src/client/App.tsx", "src/client/components/run/McpColumn.tsx", "src/client/components/run/McpColumnGrid.tsx", "src/client/components/history/RunDetailView.tsx"]
tech_stack:
  added: []
  patterns: ["SSE event accumulation by mcp+step key", "inline thumbnail with lightbox click", "React state threading from App through Grid to Column"]
key_files:
  created: []
  modified:
    - src/client/App.tsx
    - src/client/components/run/McpColumn.tsx
    - src/client/components/run/McpColumnGrid.tsx
    - src/client/components/history/RunDetailView.tsx
decisions:
  - "Use stepId from SSE payload for tool-call-to-step correlation; fall back to generated id if absent"
  - "tool_call_completed events accumulate per [mcpId][stepId] key in App state"
  - "Thumbnail is 120x68px inline button to preserve 16:9 ratio at small size"
  - "toolCallsByStep/messagesByStep props accepted by McpColumn but destructured with _ prefix since StepDetailPanel is not yet in this worktree"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-06"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
---

# Phase 01 Plan 03: Screenshot Thumbnails and Tool-Call SSE Wiring Summary

**One-liner:** Wired `tool_call_completed` SSE events into App state and added 120px inline screenshot thumbnails to step rows in both live execution (McpColumn) and history (RunDetailView) with ScreenshotLightbox click-to-expand.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add SSE handler for tool_call_completed and pass tool call state downstream | 2c88a1f5 | App.tsx, McpColumnGrid.tsx, McpColumn.tsx |
| 2 | Add inline screenshot thumbnails to step rows in live view and history | 0e60c545 | McpColumn.tsx, RunDetailView.tsx |

## What Was Built

### Task 1 — SSE Tool Call Wiring
- Added `toolCallsByMcpAndStep` and `messagesByMcpAndStep` state to `App.tsx`
- Added `source.addEventListener("tool_call_completed", ...)` handler that accumulates tool calls per `[mcpId][stepId]`
- Extracted `stepId` from `step_passed` and `step_failed` SSE payloads for message correlation
- Added `stepId?: string` field to `StepEvidence` interface
- Reset both new states on run start alongside existing state resets
- Extended `McpColumnGridProps` with optional `toolCallsByMcpAndStep` and `messagesByMcpAndStep`
- Both McpColumn renders in McpColumnGrid now forward `toolCallsByStep` and `messagesByStep`
- McpColumn interface accepts the new optional props

### Task 2 — Inline Screenshot Thumbnails
- In `McpColumn.tsx`: 120x68px `<button>` thumbnail renders per step when `step.screenshotId` is truthy. Click calls `onScreenshotClick` with `e.stopPropagation()` to avoid triggering expand/collapse. Image uses `loading="lazy"` and `objectFit: "cover"`.
- In `RunDetailView.tsx`: imported `useState` and `ScreenshotLightbox`. Added `lightbox` state. Replaced the existing "Ver screenshot" `<a>` link with a 120x68px inline thumbnail button. Clicking opens `ScreenshotLightbox`. `<ScreenshotLightbox>` component added at end of section.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] McpColumn had no props for toolCallsByStep/messagesByStep**
- **Found during:** Task 1 — McpColumn from 01-02 per prior wave context should have these props, but the current worktree has the simpler McpColumn without StepDetailPanel
- **Fix:** Added the props to McpColumn interface anyway, destructured with `_` prefix since StepDetailPanel is not yet in this worktree. The props are ready for when 01-02 merges.
- **Files modified:** src/client/components/run/McpColumn.tsx

None — plan executed as specified for the functional requirements. The StepDetailPanel reference to toolCallsByStep/messagesByStep is future-wired (pending 01-02 merge into this branch).

## Known Stubs

None. The thumbnail renders real screenshot data via `/api/screenshots/:id`. The SSE tool call accumulation wires to real backend events.

## Self-Check: PASSED

- `src/client/App.tsx` contains `source.addEventListener("tool_call_completed"`: YES
- `src/client/App.tsx` contains `setToolCallsByMcpAndStep`: YES
- `src/client/App.tsx` contains `setMessagesByMcpAndStep`: YES
- `src/client/App.tsx` StepEvidence has `stepId?: string`: YES
- `src/client/App.tsx` resets toolCallsByMcpAndStep to `{}` on run start: YES
- `src/client/components/run/McpColumnGrid.tsx` passes `toolCallsByStep` to McpColumn: YES
- `src/client/components/run/McpColumnGrid.tsx` passes `messagesByStep` to McpColumn: YES
- `src/client/components/run/McpColumn.tsx` contains `width: "120px"`: YES
- `src/client/components/run/McpColumn.tsx` contains `e.stopPropagation()`: YES
- `src/client/components/history/RunDetailView.tsx` contains `import.*ScreenshotLightbox`: YES
- `src/client/components/history/RunDetailView.tsx` contains `<ScreenshotLightbox`: YES
- `src/client/components/history/RunDetailView.tsx` contains `width: "120px"`: YES
- `src/client/components/history/RunDetailView.tsx` contains `setLightbox`: YES
- TypeScript compiles without errors: YES (npx tsc --noEmit passes cleanly)
- Commits 2c88a1f5 and 0e60c545 exist: YES
