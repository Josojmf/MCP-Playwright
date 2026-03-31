---
phase: 07-wire-dead-modules
plan: "05"
subsystem: orchestrator
tags: [token-budget, orchestrator, llm, typescript, testing]

# Dependency graph
requires:
  - phase: 03-orchestrator-engine-single-mcp-run
    provides: OrchestratorService with step loop and TokenBudget integration
  - phase: 07-wire-dead-modules
    provides: TokenBudget.checkBudget() method (dead module being wired)
provides:
  - TokenBudget.checkBudget() called before each LLM request in OrchestratorService
  - BudgetExceededError handled as fatal abort in step loop
  - Test coverage for budget pre-check behavior
affects: [orchestrator, run-manager, llm-execution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-flight budget guard: checkBudget() before every provider.complete() call"
    - "Fatal error classification: BudgetExceededError causes generator return, not continueOnError loop"

key-files:
  created: []
  modified:
    - src/server/orchestrator/OrchestratorService.ts
    - src/server/orchestrator/OrchestratorService.test.ts

key-decisions:
  - "BudgetExceededError is fatal: yield aborted StepResult then return from generator (not continue)"
  - "checkBudget() placed before withTimeout(provider.complete()) — blocks LLM call before any network cost"

patterns-established:
  - "Budget pre-check pattern: always guard LLM calls with checkBudget() before network request"

requirements-completed: [INFRA-05]

# Metrics
duration: 1min
completed: 2026-03-31
---

# Phase 7 Plan 5: Wire TokenBudget.checkBudget() before each LLM request Summary

**BudgetExceededError now blocks every LLM call in OrchestratorService before provider.complete() is invoked, with fatal abort behavior and full test coverage**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-31T10:37:59Z
- **Completed:** 2026-03-31T10:39:09Z
- **Tasks:** 1 (implementation + test in single atomic commit)
- **Files modified:** 2

## Accomplishments

- Added `BudgetExceededError` import to OrchestratorService
- Inserted `ctx.tokenBudget.checkBudget()` immediately before `withTimeout(provider.complete(...))` in the step loop
- Added BudgetExceededError catch block: yields `aborted` StepResult and returns from generator (fatal, not recoverable)
- Added test `runScenario aborts when token budget is exceeded before LLM call` — passes with status `aborted` and correct message

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire checkBudget() + fatal error handling + test** - `c0f20a91` (feat)

## Files Created/Modified

- `src/server/orchestrator/OrchestratorService.ts` - Added BudgetExceededError import, checkBudget() pre-flight guard, fatal catch block
- `src/server/orchestrator/OrchestratorService.test.ts` - Added shared fixtures (sharedMCPConfig, oneStepScenario) and budget exceeded test

## Decisions Made

- BudgetExceededError is treated as fatal: the generator returns entirely rather than continuing via `continueOnError`. A budget breach is a hard cap, not a recoverable step failure.
- `checkBudget()` is placed before the `withTimeout` wrapper so no network request is initiated even if the timeout is generous.

## Deviations from Plan

None — plan executed exactly as written. The plan specified extracting shared fixtures as `oneStepScenario` and `testMCPConfig`; the implementation uses `sharedMCPConfig` to avoid shadowing the local `testMCPConfig` variable inside the existing `AsyncGenerator behavior` test suite.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `TokenBudget.checkBudget()` is now wired and exercised in production code path
- All 15 orchestrator tests pass
- TypeScript clean (`tsc --noEmit` passes)
- INFRA-05 requirement met: runs configured below the token estimate are blocked before the first LLM call

---
*Phase: 07-wire-dead-modules*
*Completed: 2026-03-31*
