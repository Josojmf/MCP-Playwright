---
phase: 09-real-vision-llm-validation
plan: "04"
subsystem: runManager
tags: [vision-validation, call-policy, two-tier-auditor, equality-guard, bug-fix]
dependency_graph:
  requires: [09-02]
  provides: [corrected-call-policy, two-tier-auditor-config, complete-equality-guard]
  affects: [src/server/runManager.ts, src/server/runManager.test.ts]
tech_stack:
  added: []
  patterns: [two-tier-auditor-model, deterministic-fallback-for-failed-steps]
key_files:
  created: []
  modified:
    - src/server/runManager.ts
    - src/server/runManager.test.ts
decisions:
  - "lowCostAuditorModel defaults to gpt-4.1-mini, highAccuracyAuditorModel defaults to gpt-4.1"
  - "Failed/aborted steps receive deterministic contradicts verdict (confidence 0.95) without LLM call"
  - "Passed steps without screenshot receive uncertain verdict (confidence 0.2, needsReview true)"
metrics:
  duration: "2m 24s"
  completed: "2026-04-01"
  tasks_completed: 1
  files_modified: 2
---

# Phase 09 Plan 04: RunManager Divergence Fixes Summary

Two-tier auditor model config with corrected call policy and complete equality guard aligned to CONTEXT.md locked decisions D-05/D-06/D-08/D-10.

## What Was Done

Fixed three implementation divergences in `runManager.ts` from the locked decisions in `09-CONTEXT.md`:

1. **D-05/D-06 - Inverted call policy fixed:** The vision LLM is now called for PASSED steps only (`normalizedStepStatus === "passed" && screenshotPath`). Failed/aborted steps receive a deterministic `contradicts` verdict (confidence 0.95) without any network call. Passed steps without a screenshot receive `uncertain` (confidence 0.2, needsReview true).

2. **D-08 - Two-tier auditor model fields:** Replaced the single `auditorModel?: string` field in both `RunEstimateRequest` and `RunConfig` with `lowCostAuditorModel?: string` (default `"gpt-4.1-mini"`) and `highAccuracyAuditorModel?: string` (default `"gpt-4.1"`). Both tier model keys are now passed to `validateStepWithVision`.

3. **D-10 - Complete model equality guard:** Replaced the single equality check with two separate guards — one for each tier model against `orchestratorModel`. Both guards throw `RequestValidationError` with a message naming the conflicting tier and model.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix call policy and two-tier auditor model fields in RunConfig | 0a5113d1 | src/server/runManager.ts, src/server/runManager.test.ts |

## Deviations from Plan

None - plan executed exactly as written.

## Test Results

- All 139 tests pass (`npm test`)
- `npx tsc --noEmit` exits 0
- `grep -c "auditorModel?:" src/server/runManager.ts` returns 0

## Known Stubs

None.

## Self-Check: PASSED

- `src/server/runManager.ts` contains `lowCostAuditorModel?: string` in RunEstimateRequest (line 29) and RunConfig (line 56)
- `src/server/runManager.ts` contains `highAccuracyAuditorModel?: string` in RunEstimateRequest (line 30) and RunConfig (line 57)
- `src/server/runManager.ts` call condition is `normalizedStepStatus === "passed" && screenshotPath` (line 556)
- `src/server/runManager.ts` has two separate equality guards (lines 181-188)
- `src/server/runManager.ts` passes both tier model keys to `validateStepWithVision` (lines 580-581)
- Commit `0a5113d1` exists in git log
