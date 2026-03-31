---
phase: 07-wire-dead-modules
plan: 02
subsystem: mcp
tags: [instrumentation, mcp-client, screenshot, stub, tracing]

# Dependency graph
requires:
  - phase: 07-wire-dead-modules
    provides: InstrumentedMcpClient class with getTraces/clearTraces API
provides:
  - InstrumentedMcpClient instantiated in executeMcpRun with stub BaseMcpClient
  - Instrumentation pipeline wired into step execution loop
  - Trace cleanup on run finalization
affects: [08-real-mcp-process-protocol]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Stub-to-real replacement pattern: stub BaseMcpClient in Phase 7, replace with real in Phase 8"]

key-files:
  created: []
  modified:
    - src/server/runManager.ts

key-decisions:
  - "Use simpler wiring approach (log traces count) rather than modifying captureStepScreenshot signature — Phase 8 will do full integration"
  - "Void unused args in stub BaseMcpClient to avoid TypeScript warnings"

patterns-established:
  - "Instrumentation wrapper pattern: InstrumentedMcpClient wraps BaseMcpClient, provides getTraces()/clearTraces() lifecycle"

requirements-completed: [VALID-01]

# Metrics
duration: 12min
completed: 2026-03-31
---

# Phase 7 Plan 2: Wire InstrumentedMcpClient into OrchestratorService Summary

**InstrumentedMcpClient wired into executeMcpRun with a stub BaseMcpClient — instrumentation pipeline live, ready for Phase 8 real MCP protocol client**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-31T00:00:00Z
- **Completed:** 2026-03-31T00:12:00Z
- **Tasks:** 1 (single implementation task)
- **Files modified:** 2 (runManager.ts + OrchestratorService.ts auto-fix)

## Accomplishments

- Imported `InstrumentedMcpClient` and `BaseMcpClient` into `runManager.ts`
- Stub `BaseMcpClient` created inline in `executeMcpRun` (Phase 8 replaces with real MCP protocol client)
- `InstrumentedMcpClient` instantiated per MCP run with traces logged after each step
- `instrumentedClient.clearTraces()` added to `finally` block for proper lifecycle management
- TypeScript compiles cleanly and all 5 `runManager.test.ts` tests pass

## Task Commits

1. **Wire InstrumentedMcpClient + fix OrchestratorService duplicate variable** - `bc6cef9b` (feat)

## Files Created/Modified

- `src/server/runManager.ts` - Added import, stub BaseMcpClient, InstrumentedMcpClient instantiation, trace logging per step, clearTraces in finally
- `src/server/orchestrator/OrchestratorService.ts` - Pre-existing duplicate `stepMessage` fix (already committed by plan 07-03 `0db9872f`)

## Decisions Made

- Used the simpler wiring approach from the plan (log traces count after each step) rather than modifying `captureStepScreenshot` signature — Phase 8 will complete full integration when a real `BaseMcpClient` is available
- Voided unused `args` parameter in stub to satisfy TypeScript `noUnusedParameters`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Duplicate `const stepMessage` declaration in OrchestratorService.ts**
- **Found during:** Task 1 (TypeScript verification step)
- **Issue:** `OrchestratorService.ts` had two `const stepMessage` declarations in the same block scope (lines 85 and 130), causing `tsc --noEmit` to fail with TS2451 and preventing test execution
- **Fix:** Renamed second declaration to `stepResultMessage` to disambiguate the LLM input message from the step result display message
- **Files modified:** `src/server/orchestrator/OrchestratorService.ts`
- **Verification:** `npx tsc --noEmit` exits 0; 5/5 tests pass
- **Committed in:** `0db9872f` (plan 07-03 commit — fix was already applied by parallel agent before this plan ran)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug, pre-existing from parallel agent work)
**Impact on plan:** Fix was a prerequisite for test execution; no scope creep. The fix was already present in the repo from plan 07-03.

## Issues Encountered

- Pre-existing TypeScript errors in `OrchestratorService.ts` (from parallel agent plan 07-03) initially blocked test execution. Resolved because plan 07-03 had already committed the fix before this plan ran.

## Known Stubs

- `stubMcpClient` in `runManager.ts` line ~344: always returns `{ type: 'success', content: [{ type: 'text', text: 'Stub: {name}' }] }`. Phase 8 replaces this with the real MCP process protocol client. This is intentional and documented in plan comments.

## Next Phase Readiness

- Phase 8 (`08-real-mcp-process-protocol`) can now replace `stubMcpClient` with a real `BaseMcpClient` implementation and screenshots will flow through `InstrumentedMcpClient` automatically
- `InstrumentedMcpClient.getTraces()` call is already in the step loop — Phase 8 only needs to update the client stub

---
*Phase: 07-wire-dead-modules*
*Completed: 2026-03-31*
