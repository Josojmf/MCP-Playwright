---
phase: 12-mejorar-fiabilidad-seguridad-y-transparencia-del-ejecutor-de-tests-para-qa
plan: 03
subsystem: database
tags: [sqlite, history, traceability, trust]
requires:
  - phase: 12-02
    provides: explicit execution config carried by run sessions
provides:
  - enriched tool-call trace persistence with correlation ids and latency
  - trustState and trustReasons stored with every persisted run
  - history/export responses carrying trust and execution config metadata
affects: [history, exports, ui, auditability]
tech-stack:
  added: []
  patterns: [explicit degraded trust state, persisted tool-call evidence]
key-files:
  created: []
  modified:
    - src/server/orchestrator/types.ts
    - src/server/orchestrator/OrchestratorService.ts
    - src/server/orchestrator/OrchestratorService.test.ts
    - src/server/mcp/InstrumentedMcpClient.ts
    - src/server/mcp/InstrumentedMcpClient.test.ts
    - src/server/runManager.ts
    - src/server/storage/sqlite.ts
    - src/server/storage/sqlite.test.ts
    - src/server/api/history.ts
    - src/server/api/history.test.ts
key-decisions:
  - "Missing screenshot or missing tool-trace evidence degrades trust explicitly instead of being hidden."
  - "The shared ToolCallTrace contract was expanded rather than maintaining a second trace shape."
patterns-established:
  - "Persisted runs must record trustState/trustReasons and reproducible execution config together."
requirements-completed: [VALID-01, HIST-01, HIST-02]
duration: recovery
completed: 2026-04-04
---

# Phase 12: Plan 03 Summary

**Run persistence now stores rich tool traces, explicit trust state, and reproducible execution metadata**

## Performance

- **Duration:** recovery
- **Started:** 2026-04-04T00:00:00Z
- **Completed:** 2026-04-04T00:00:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Promoted instrumented tool-call traces into the shared orchestrator contract and persisted run records.
- Removed placeholder screenshot behavior from the evidence path and marked missing evidence as degraded trust.
- Extended SQLite and history/export APIs to include trust state, trust reasons, provider, and model fields.

## Task Commits

Execution was recovered inline from a previously incomplete subagent run, so atomic task commits were not produced for this plan.

## Files Created/Modified
- `src/server/orchestrator/types.ts` - Shared `ToolCallTrace` schema with correlation and capture metadata
- `src/server/mcp/InstrumentedMcpClient.ts` - In-memory trace capture aligned to the shared contract
- `src/server/runManager.ts` - Trace promotion, real screenshot persistence, and degraded trust derivation
- `src/server/storage/sqlite.ts` - Run-level trust/config columns and JSON mapping
- `src/server/api/history.ts` - History/detail/export responses now expose trust and config metadata

## Decisions Made

- Trust is modeled as `auditable` or `degraded` with explicit reason codes instead of implicit heuristics.
- History CSV exports now expose trust and config columns directly rather than forcing downstream joins.

## Deviations from Plan

The implementation promotes instrumented screenshot buffers into persisted files through `runManager` instead of persisting the instrumented in-memory ids directly.

## Issues Encountered

- Extending `ToolCallTrace` required updating existing orchestrator test fixtures that had assumed a minimal trace shape.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The frontend now has durable trust/config/tool-trace data available for live and historical rendering.
- Validation can inspect durable evidence rather than logs or process memory.

---
*Phase: 12-mejorar-fiabilidad-seguridad-y-transparencia-del-ejecutor-de-tests-para-qa*
*Completed: 2026-04-04*
