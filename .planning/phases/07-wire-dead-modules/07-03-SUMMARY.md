---
phase: 07-wire-dead-modules
plan: 03
subsystem: orchestrator
tags: [playwright, assertions, validation, orchestrator, then-steps]

requires:
  - phase: 05-screenshot-validation-scorecard
    provides: assertionsRunner.runAssertion() and TranslatedAssertion types
  - phase: 07-wire-dead-modules
    provides: plan 01 wired assembleSystemPrompt, plan 05 wired TokenBudget.checkBudget()

provides:
  - assertionsRunner.runAssertion() called for every Then step after LLM response
  - Then step status overridden to "failed" when independent Playwright assertion fails
  - VALID-02 requirement implemented end-to-end in OrchestratorService

affects: [08-real-mcp-process-protocol, 09-real-vision-llm-validation]

tech-stack:
  added: []
  patterns:
    - "VALID-02: independent assertion overrides MCP-reported status for Then steps"
    - "Assertion result message surfaced in StepResult.message for traceability"

key-files:
  created: []
  modified:
    - src/server/orchestrator/OrchestratorService.ts
    - src/server/orchestrator/OrchestratorService.test.ts

key-decisions:
  - "Renamed result message variable to stepResultMessage to avoid collision with existing stepMessage (LLMMessage) local variable"
  - "Assertion called with empty context ({}) — real Playwright page context wired in phase 08"

patterns-established:
  - "Assertion override pattern: check canonicalType === 'then' && step.assertion, then await runAssertion; override status if failed"

requirements-completed: [VALID-02]

duration: 5min
completed: 2026-03-31
---

# Phase 7 Plan 3: Wire assertionsRunner.runAssertion() for Then Steps Summary

**runAssertion() now called on every Then step after LLM response, independently overriding step status to 'failed' when Playwright assertion fails (VALID-02)**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-31T18:13:30Z
- **Completed:** 2026-03-31T18:18:34Z
- **Tasks:** 1 (import + wire + test, committed atomically)
- **Files modified:** 2

## Accomplishments

- Imported `runAssertion` and `AssertionResult` from `../validation/assertionsRunner` in OrchestratorService
- Inserted assertion check after LLM success for Then steps — calls `runAssertion(step.assertion, {})` when `step.canonicalType === "then"` and `step.assertion` is set
- Step status overridden to `"failed"` when assertion returns failed; message includes the assertion failure detail
- Added test verifying Then step assertion override marks step failed when assertion fails
- All 17 tests pass (0 failures)

## Task Commits

1. **Task 1: Wire runAssertion into OrchestratorService** - `0db9872f` (feat)

**Plan metadata:** _(docs commit pending)_

## Files Created/Modified

- `src/server/orchestrator/OrchestratorService.ts` - Added runAssertion import and assertion override block after LLM success for Then steps
- `src/server/orchestrator/OrchestratorService.test.ts` - Added test for Then step assertion override behavior

## Decisions Made

- Renamed result message variable from `stepMessage` to `stepResultMessage` to avoid collision with the existing `stepMessage: LLMMessage` variable in the same scope
- Assertion called with empty context `{}` — real Playwright page will be wired when actual MCP process execution is implemented in phase 08

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Variable name collision: stepMessage declared twice in same scope**
- **Found during:** Task 1 (implementing assertion override)
- **Issue:** Plan specified `const stepMessage = ...` for the result message, but `stepMessage` was already declared as `const stepMessage: LLMMessage` earlier in the same try block
- **Fix:** Renamed the result message variable to `stepResultMessage`
- **Files modified:** src/server/orchestrator/OrchestratorService.ts
- **Verification:** Tests compile and pass (17/17)
- **Committed in:** 0db9872f

---

**Total deviations:** 1 auto-fixed (1 bug — variable name collision)
**Impact on plan:** Minor rename only. No behavior change, no scope creep.

## Issues Encountered

- esbuild compile error caught immediately on first test run due to `stepMessage` redeclaration — fixed by renaming to `stepResultMessage`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- VALID-02 is now wired end-to-end: Then step assertions run independently of MCP reports
- Real Playwright `page` context needs to be passed via `AssertionContext` when phase 08 wires actual MCP process execution
- Plans 04 (loop detection) and 02 (07-02) can proceed independently

---
*Phase: 07-wire-dead-modules*
*Completed: 2026-03-31*
