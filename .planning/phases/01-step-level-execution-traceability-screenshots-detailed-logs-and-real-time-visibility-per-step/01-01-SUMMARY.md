---
phase: "01"
plan: "01"
subsystem: backend
tags: [traceability, screenshots, sse, tool-calls, types]
dependency_graph:
  requires: []
  provides: [per-step-screenshot-capture, tool-call-sse-events, ToolCallEvent-type]
  affects: [runManager, orchestrator-types, SSE-stream]
tech_stack:
  added: []
  patterns: [auto-screenshot-fallback, granular-sse-streaming]
key_files:
  created: []
  modified:
    - src/server/orchestrator/types.ts
    - src/server/runManager.ts
decisions:
  - "screenshotId field added to StepResult to carry screenshot reference through the data pipeline"
  - "tool_call_completed SSE events emitted after step_started for each tool call trace (real-time streaming)"
  - "captureStepScreenshot falls back to browser_take_screenshot MCP call when no trace screenshot exists"
metrics:
  duration_seconds: 85
  completed: "2026-04-06"
  tasks_completed: 2
  files_modified: 2
---

# Phase 01 Plan 01: Backend Screenshot Data Pipeline and Tool-Call SSE Streaming Summary

Per-step screenshot capture and granular tool-call SSE events wired into the backend execution path using auto-screenshot fallback and individual tool_call_completed emissions.

## What Was Built

### Task 1: Extend types and add screenshotId to StepResult

Extended `src/server/orchestrator/types.ts`:

- Added `screenshotId?: string` field to `StepResult` interface after the `toolCalls` field — enables every step result to carry its screenshot reference (TRACE-01, TRACE-03, D-01)
- Extended `OrchestratorEvent.type` union to include `"tool_call_started"` and `"tool_call_completed"` for granular SSE streaming (TRACE-07, D-07)
- Added new `ToolCallEvent` interface with full payload: runId, mcpId, stepId, stepIndex, toolCallIndex, toolName, arguments, status, latencyMs, result, error, screenshotId, timestamp

### Task 2: Auto-capture screenshot after every step and emit granular tool-call SSE events

Extended `src/server/runManager.ts`:

**Part A (screenshot auto-capture):** Rewrote `captureStepScreenshot` to always attempt a capture:
1. First checks existing trace screenshots (previous behavior)
2. If no trace screenshot found, attempts a fresh `browser_take_screenshot` call via the instrumented MCP client
3. Extracts base64 image from result content and converts to Buffer
4. Falls through silently if MCP doesn't support screenshot or no browser session is active

**Part B (tool-call SSE emission):** After `step_started` emission, iterates all tool call traces and emits `tool_call_completed` SSE for each one with full ToolCallEvent payload including screenshotId from the trace.

**Part C (screenshotId in stored results):** Added `screenshotId: screenshotId ?? undefined` to the enriched StepResult pushed to `mcpResults`, completing the data pipeline from capture through storage.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | d9a14506 | feat(01-01): extend StepResult with screenshotId and add ToolCallEvent SSE types |
| 2 | 3ed46ccb | feat(01-01): auto-capture screenshot per step and emit granular tool-call SSE events |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - the screenshot auto-capture falls back gracefully when MCP doesn't support the tool, but the wiring is complete and functional for MCPs that do support `browser_take_screenshot`.
