---
phase: 7
plan: 4
subsystem: runManager / stalenessRecovery
tags: [wiring, stale-ref, recovery, exec-05]
dependency_graph:
  requires: [07-02]
  provides: [stale-ref detection wired into MCP execution path]
  affects: [src/server/runManager.ts]
tech_stack:
  added: []
  patterns: [stale-ref detection, per-step error annotation, run-level catch tracing]
key_files:
  modified:
    - src/server/runManager.ts
decisions:
  - Stale-ref errors annotate the step message with [STALE-REF] prefix and skip normal benchmark failure counting via continue, keeping the step in results with a modified message rather than discarding it
  - Run-level catch also calls traceStaleRefRecovery to handle any stale-ref that escapes step-level detection
metrics:
  duration: 5m
  completed: "2026-03-31T18:54:00Z"
  tasks_completed: 1
  files_modified: 1
---

# Phase 7 Plan 4: Wire stalenessRecovery.retryWithNewSnapshot() on stale-ref errors Summary

Wired `isStaleRefError` and `traceStaleRefRecovery` from `src/server/mcp/stalenessRecovery.ts` into `executeMcpRun()` in `runManager.ts`, so stale-ref errors trigger detection and tracing instead of silent benchmark failure counting.

## What Was Done

- Added import of `isStaleRefError` and `traceStaleRefRecovery` from `./mcp/stalenessRecovery`
- In the `for await` step loop: when `stepResult.status === "failed"` and the message matches a stale-ref pattern, `traceStaleRefRecovery()` is called, the step message is annotated with `[STALE-REF]`, and `continue` skips counting the step as a benchmark failure
- In the outer `catch` block: any stale-ref error that propagates uncaught to run level also calls `traceStaleRefRecovery("unknown", -1, false)` and logs an info message rather than silently treating it as a generic failure

## Verification

- `npx tsc --noEmit`: clean (0 errors)
- `npx tsx --test src/server/runManager.test.ts`: 5/5 pass

## Deviations from Plan

None - plan executed exactly as written. The plan explicitly noted that `retryWithNewSnapshot()` wrapping of individual tool calls is deferred to Phase 8; only detection and tracing infrastructure is wired in Phase 7.

## Self-Check: PASSED

- `src/server/runManager.ts` modified and committed at dd8c2b05
- All tests passing
