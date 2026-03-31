---
phase: 07-wire-dead-modules
plan: 01
subsystem: orchestration
tags: [orchestrator, system-prompt, llm, mcp, gherkin]

# Dependency graph
requires:
  - phase: 02-llm-adapters-mcp-registry
    provides: assembleSystemPrompt function and MCP registry utilities
  - phase: 03-orchestrator-engine-single-mcp-run
    provides: OrchestratorService with static system prompt
provides:
  - Dynamic per-MCP system prompt assembly wired into OrchestratorService.runScenario()
  - Verified test coverage confirming old static prompt is no longer used
affects:
  - 08-real-mcp-process-protocol (will populate tools array currently passed as [])
  - Any phase consuming OrchestratorService system message content

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Import shared utility (assembleSystemPrompt) into service layer rather than inline strings"
    - "Pass empty tools array [] as placeholder; Phase 8 will populate with real MCP capabilities"

key-files:
  created: []
  modified:
    - src/server/orchestrator/OrchestratorService.ts
    - src/server/orchestrator/OrchestratorService.test.ts

key-decisions:
  - "Pass [] as tools array to assembleSystemPrompt; real tool list comes from Phase 8 MCP capability negotiation"
  - "Append Scenario name after dynamic prompt content to preserve context without losing the old test compatibility"

patterns-established:
  - "Dead module wiring pattern: import from shared/, replace inline stub, pass empty/placeholder args for Phase 8"

requirements-completed: [ORCH-09]

# Metrics
duration: 8min
completed: 2026-03-31
---

# Phase 7 Plan 1: Wire assembleSystemPrompt into OrchestratorService Summary

**`assembleSystemPrompt(mcpId, [])` now called in `OrchestratorService.runScenario()`, replacing the hardcoded "test automation agent" string with a per-MCP dynamic prompt template**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-31T10:38:20Z
- **Completed:** 2026-03-31T10:46:00Z
- **Tasks:** 3 (import, replace static prompt, add test)
- **Files modified:** 2

## Accomplishments
- Added `assembleSystemPrompt` import to `OrchestratorService.ts`
- Replaced the hardcoded `"You are a test automation agent..."` string with `assembleSystemPrompt(ctx.mcpConfig.id, [])` so each MCP gets its own prompt template
- Added a capturing-provider test that confirms the old static string is absent and the dynamic content is present
- All 15 tests pass (15/15), TypeScript compiles clean

## Task Commits

Each task was committed atomically:

1. **Task 1-3: Add import + replace static prompt + add test** - `d64b1a0f` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/server/orchestrator/OrchestratorService.ts` - Added import, replaced static system message with assembleSystemPrompt call
- `src/server/orchestrator/OrchestratorService.test.ts` - Added test verifying dynamic prompt replaces old static string

## Decisions Made
- Pass `[]` as tools list (empty) to `assembleSystemPrompt` for now. The real tool list will be populated in Phase 8 when MCP capability negotiation is wired. The key wiring is that `mcpId` is passed, producing a different (and correct) prompt template per MCP even with an empty tools list.
- Kept `\nScenario: ${scenario.name}` appended after the dynamic prompt to maintain the same contextual hint for the LLM.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `assembleSystemPrompt` is now live in the execution path
- Phase 8 (real MCP process protocol) will pass a real `ToolDefinition[]` array to replace the `[]` placeholder, completing the per-MCP tool-aware prompt
- No blockers

---
*Phase: 07-wire-dead-modules*
*Completed: 2026-03-31*
