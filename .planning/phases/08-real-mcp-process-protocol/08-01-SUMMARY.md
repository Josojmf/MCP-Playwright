---
phase: 08-real-mcp-process-protocol
plan: 01
subsystem: mcp-execution
tags: [mcp, stdio, process-manager, sdk, json-rpc, registry]

# Dependency graph
requires:
  - phase: 07-wire-dead-modules
    provides: BaseMcpClient interface, InstrumentedMcpClient wrapper, runManager executeMcpRun skeleton
provides:
  - McpProcessManager implementing BaseMcpClient via @modelcontextprotocol/sdk Client + StdioClientTransport
  - spawnCommand field on MCPServerEntry registry type enabling protocol-based spawn
  - Real JSON-RPC initialize handshake for health-check (not process.kill(pid, 0))
  - executeMcpRun wired to real MCP process manager (stub removed)
affects: [09-real-vision-llm-validation, 10-cli-debug-trace-csv-scorecard]

# Tech tracking
tech-stack:
  added: []  # @modelcontextprotocol/sdk was already installed
  patterns:
    - McpProcessManager implements BaseMcpClient — slots directly into InstrumentedMcpClient wrapper
    - Registry-driven spawn commands — McpProcessManager reads spawnCommand from MCP_REGISTRY by mcpId
    - client.connect(transport) for both spawn and initialize — no manual transport.start()

key-files:
  created: []
  modified:
    - src/shared/registry/types.ts
    - src/shared/registry/index.ts
    - src/server/mcp/McpProcessManager.ts
    - src/server/mcp/McpProcessManager.test.ts
    - src/server/runManager.ts

key-decisions:
  - "McpProcessManager implements BaseMcpClient directly — slots into InstrumentedMcpClient without adapter layer"
  - "Registry-driven spawnCommand — McpProcessManager never guesses or derives commands"
  - "Health check is protocol-based (successful initialize handshake), not process.kill(pid, 0)"
  - "client.connect(transport) performs both process spawn and JSON-RPC initialize — never call transport.start() manually"
  - "dispose() closes SDK transport and nulls all internal state in finally block"

patterns-established:
  - "MCP spawn via StdioClientTransport + Client.connect(): no manual process management needed"
  - "spawnCommand in registry — all MCP server spawn configuration lives in the registry, zero logic in McpProcessManager"

requirements-completed: [EXEC-03]

# Metrics
duration: 15min
completed: 2026-04-01
---

# Phase 8 Plan 01: Real MCP Process Protocol Summary

**McpProcessManager rewritten from dummy node setInterval stub to real JSON-RPC stdio client using @modelcontextprotocol/sdk Client + StdioClientTransport, wired into executeMcpRun replacing the stub BaseMcpClient**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-01T00:00:00Z
- **Completed:** 2026-04-01T00:15:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Rewrote McpProcessManager from a `node -e 'setInterval()'` stub to a real @modelcontextprotocol/sdk implementation
- McpProcessManager now implements BaseMcpClient with real callTool() delegating to client.callTool() via JSON-RPC
- Added spawnCommand to MCPServerEntry type and populated for all stdio MCP registry entries
- Removed stub BaseMcpClient from executeMcpRun — processManager is now the real BaseMcpClient
- All 113 tests pass including 6 new McpProcessManager pre-spawn guard tests

## Task Commits

1. **Task 1: Add spawnCommand to registry and rewrite McpProcessManager** - `8cca2d5c` (feat)
2. **Task 2: Wire McpProcessManager into executeMcpRun and update tests** - `969809ba` (feat)

## Files Created/Modified

- `src/shared/registry/types.ts` - Added `spawnCommand?: string[]` field to MCPServerEntry interface
- `src/shared/registry/index.ts` - Populated spawnCommand for @playwright/mcp, server-puppeteer, mcp-playwright entries
- `src/server/mcp/McpProcessManager.ts` - Full rewrite: implements BaseMcpClient using SDK Client + StdioClientTransport
- `src/server/mcp/McpProcessManager.test.ts` - Rewritten for pre-spawn guard tests (constructor, healthCheck, callTool, dispose)
- `src/server/runManager.ts` - Removed stub BaseMcpClient, wired processManager directly into InstrumentedMcpClient

## Decisions Made

- Used `client.connect(transport)` for both spawn and initialize — calling `transport.start()` manually would throw "already started"
- Health check is protocol-based: returns `client !== null && !this.crashed`, reflecting successful initialize handshake
- Test approach: pre-spawn guard tests with real registry (no module mocking needed for tsx/CJS compatibility)
- BaseMcpClient import removed from runManager since processManager now satisfies the interface structurally

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused import after stub removal**
- **Found during:** Task 2 (wiring McpProcessManager into executeMcpRun)
- **Issue:** Removing the stub `BaseMcpClient` typed local variable left `type BaseMcpClient` import unused, which would cause a TypeScript error
- **Fix:** Removed `type BaseMcpClient` from the InstrumentedMcpClient import in runManager.ts
- **Files modified:** src/server/runManager.ts
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** 969809ba (Task 2 commit)

**2. [Rule 3 - Blocking] Test rewrite: mock.module with top-level await not supported in tsx/CJS**
- **Found during:** Task 2 (writing McpProcessManager tests)
- **Issue:** Plan suggested using `mock.module` + `await import()` at top-level, but tsx compiles to CJS which doesn't support top-level await. Test run failed with esbuild transform error.
- **Fix:** Rewrote tests to use real registry entries directly — constructor guard tests for nonexistent mcpId, healthCheck/callTool before spawn, dispose safety. The plan explicitly noted "Focus on the pre-spawn guard tests which are fully testable without mocks."
- **Files modified:** src/server/mcp/McpProcessManager.test.ts
- **Verification:** `npm test -- --test-name-pattern "McpProcessManager"` passes all 6 tests
- **Committed in:** 969809ba (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 cleanup bug, 1 blocking test infrastructure)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered

- The @modelcontextprotocol/sdk Client import path required `.js` suffix (`@modelcontextprotocol/sdk/client/index.js`) for ESM compatibility — standard for this SDK version.

## Next Phase Readiness

- McpProcessManager is fully wired and ready for Phase 9 real vision LLM validation
- The execution engine now actually spawns real MCP server processes — browser actions will execute when MCP servers respond
- Plan 02 (CLI provider + LoopDetector fix + pricing fix) can proceed independently

---
*Phase: 08-real-mcp-process-protocol*
*Completed: 2026-04-01*
