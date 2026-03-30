---
phase: 02-llm-adapters-mcp-registry
plan: 03
subsystem: registry
tags: [typescript, mcp, registry, system-prompt, tool-filtering]

# Dependency graph
requires:
  - phase: 01-core-infrastructure-ui-shell
    provides: Project structure, TypeScript config, test runner (node:test + tsx)
provides:
  - MCPRegistry and MCPServerEntry and ToolDefinition types in src/shared/registry/types.ts
  - MCP_REGISTRY with 4 entries (2 functional, 2 Phase 4 stubs) in src/shared/registry/index.ts
  - getRegistryEntry, getToolsForMCP, getMCPLabel, listRegisteredMCPs utility functions
  - assembleSystemPrompt function with per-MCP tool namespace filtering
affects: [03-orchestration-engine, 04-mcp-execution, phase3-llm-orchestrator]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MCP registry as typed const object keyed by server ID"
    - "Tool namespace prefix pattern for MCP tool scoping (browser_, puppeteer_, etc.)"
    - "ToolDefinition interface as shared contract between registry and LLM layers"
    - "{TOOL_LIST} template placeholder for dynamic system prompt assembly"

key-files:
  created:
    - src/shared/registry/types.ts
    - src/shared/registry/index.ts
    - src/shared/registry/utils.ts
    - src/shared/llm/systemPrompt.ts
    - src/shared/registry/index.test.ts
    - src/shared/registry/systemPrompt.test.ts

key-decisions:
  - "ToolDefinition defined in registry/types.ts (not utils.ts) as shared contract for Phase 3 MCP SDK integration"
  - "4 MCPs registered: @playwright/mcp and @modelcontextprotocol/server-puppeteer functional in Phase 2; @browserbasehq/mcp and mcp-playwright as stubs for Phase 4"
  - "assembleSystemPrompt uses {TOOL_LIST} placeholder for consistent template substitution"
  - "listRegisteredMCPs added to utils.ts as discovery helper for orchestration layer"

patterns-established:
  - "Registry pattern: MCPRegistry as typed Record<string, MCPServerEntry> — adding a new MCP requires only one entry in index.ts"
  - "Namespace prefix filtering: getToolsForMCP(mcpId, allTools) — all tool scoping goes through this single function"
  - "System prompt assembly: assembleSystemPrompt(mcpId, allTools, template?) — MCP-aware prompts without hardcoding tool lists"

requirements-completed: [REGISTRY-01, REGISTRY-02, REGISTRY-03, REGISTRY-06, ORCH-09]

# Metrics
duration: 25min
completed: 2026-03-30
---

# Phase 02 Plan 03: MCP Registry & System Prompt Assembly Summary

**Typed MCP registry with 4 server entries, tool namespace filtering, and dynamic per-MCP system prompt assembly with 43 passing tests**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-30T18:00:00Z
- **Completed:** 2026-03-30T18:25:00Z
- **Tasks:** 4
- **Files modified:** 6

## Accomplishments

- MCP registry types (`MCPServerEntry`, `MCPRegistry`, `ToolDefinition`) defined in `types.ts` as shared contract
- `MCP_REGISTRY` populated with 4 entries: `@playwright/mcp` (browser_ prefix) and `@modelcontextprotocol/server-puppeteer` (puppeteer_ prefix) as functional Phase 2 entries; `@browserbasehq/mcp` and `mcp-playwright` as Phase 4 stubs
- `getRegistryEntry`, `getToolsForMCP`, `getMCPLabel`, `listRegisteredMCPs` utility functions provide clean API over registry
- `assembleSystemPrompt` filters tools by MCP namespace prefix, supports custom templates, and produces MCP-scoped system prompts
- 43 tests passing (15 new registry + system prompt tests on top of 28 pre-existing)

## Task Commits

No git repository — files created/updated directly:

1. **Task 1: MCP Registry Schema & Types** - `src/shared/registry/types.ts` (feat)
2. **Task 2: Registry Entries & Utility Functions** - `src/shared/registry/index.ts`, `src/shared/registry/utils.ts` (feat)
3. **Task 3: System Prompt Assembly** - `src/shared/llm/systemPrompt.ts` (feat)
4. **Task 4: Registry & System Prompt Tests** - `src/shared/registry/index.test.ts`, `src/shared/registry/systemPrompt.test.ts` (test)

## Files Created/Modified

- `src/shared/registry/types.ts` - `MCPServerEntry`, `MCPRegistry`, `ToolDefinition` interfaces
- `src/shared/registry/index.ts` - `MCP_REGISTRY` const with 4 MCP server entries
- `src/shared/registry/utils.ts` - `getRegistryEntry`, `getToolsForMCP`, `getMCPLabel`, `listRegisteredMCPs` functions
- `src/shared/llm/systemPrompt.ts` - `assembleSystemPrompt` with `{TOOL_LIST}` placeholder substitution
- `src/shared/registry/index.test.ts` - 9 registry utility tests
- `src/shared/registry/systemPrompt.test.ts` - 6 system prompt assembly tests

## Decisions Made

- `ToolDefinition` moved from `utils.ts` to `types.ts` so Phase 3's MCP SDK integration can import from a single canonical types file
- Phase 4 stubs (`@browserbasehq/mcp`, `mcp-playwright`) registered now to validate pluggable registry architecture early
- `listRegisteredMCPs()` added beyond the plan spec (Rule 2 — needed by orchestration engine for MCP discovery)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added listRegisteredMCPs to utils.ts**
- **Found during:** Task 2 (Registry Entries & Utility Functions)
- **Issue:** Plan's must_haves listed `listRegisteredMCPs` as a required export from utils.ts but the task action description omitted it from the written code block
- **Fix:** Added `listRegisteredMCPs(): MCPServerEntry[]` that returns `Object.values(MCP_REGISTRY)` — needed by the orchestration layer for MCP discovery
- **Files modified:** `src/shared/registry/utils.ts`
- **Verification:** `listRegisteredMCPs()` test passes (returns >= 2 entries)

**2. [Rule 1 - Adaptation] Test files use node:test runner instead of Jest**
- **Found during:** Task 4 (Tests)
- **Issue:** Plan specifies Jest-style `describe`/`expect` syntax, but project uses Node.js built-in test runner (`node:test` + `node:assert`)
- **Fix:** Wrote tests using `test()` + `assert.*` pattern matching the existing test suite style; test coverage is equivalent
- **Files modified:** `src/shared/registry/index.test.ts`, `src/shared/registry/systemPrompt.test.ts`
- **Verification:** 43 tests passing (all 15 new tests pass)

---

**Total deviations:** 2 auto-handled (1 missing critical function, 1 test framework adaptation)
**Impact on plan:** Both necessary for correctness and consistency. No scope creep.

## Issues Encountered

None — implementation was straightforward once the node:test vs Jest difference was recognized.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Registry is fully ready for Phase 3 orchestration engine consumption
- `getToolsForMCP(mcpId, discoveredTools)` is the primary API for per-MCP tool scoping
- `assembleSystemPrompt(mcpId, tools)` provides MCP-aware system prompts for LLM requests
- Phase 4 stubs already registered — adding functionality requires only implementing the execution logic, not registry changes

---
*Phase: 02-llm-adapters-mcp-registry*
*Completed: 2026-03-30*
