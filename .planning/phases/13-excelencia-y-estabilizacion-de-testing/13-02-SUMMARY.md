---
phase: 13-excelencia-y-estabilizacion-de-testing
plan: 02
subsystem: testing
tags: [typescript, testing, ast, contracts, cli, react]
requires:
  - phase: 13-01
    provides: fast/smoke lane split and centralized lane runner
provides:
  - Shared AST-backed source contract helpers
  - Stronger runManager, CLI, and UI wiring contract tests
  - Removal of weak label-only source guards
affects: [contract-tests, cli, ui, runManager]
tech-stack:
  added: [typescript-ast-contract-helpers]
  patterns: [ast-backed-source-contracts, narrow-normalized-string-fallbacks]
key-files:
  created:
    - src/test/support/sourceContracts.ts
  modified:
    - src/server/runManager.phase12.evidence.test.ts
    - src/server/runManager.phase8.contract.test.ts
    - src/cli/mcp-bench.phase10.contract.test.ts
    - src/client/App.phase12.contract.test.ts
    - src/client/components/run/RunScorecard.phase12.contract.test.ts
    - src/client/components/history/RunDetailView.phase12.contract.test.ts
key-decisions:
  - "Source-shape contracts now default to AST-backed object and JSX assertions; normalized string checks are reserved for formatting-heavy CLI output."
  - "UI contract coverage keeps execution-config and trust-state data-flow seams, while literal label checks were removed per D-02 and D-03."
patterns-established:
  - "Contract helper pattern: load the source once, then assert named calls, object literals, and JSX expressions structurally."
  - "Formatting-only seams use assertNormalizedFragments with an explicit fallback comment instead of ad-hoc regex snapshots."
requirements-completed: []
duration: 4min
completed: 2026-04-05
---

# Phase 13 Plan 02: Contract Layer Summary

**AST-backed source contracts for runManager, CLI trace output, and execution-config UI wiring replaced brittle label and regex snapshots**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-05T00:00:40+02:00
- **Completed:** 2026-04-05T00:04:45+02:00
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added a shared `sourceContracts` helper that parses TypeScript and TSX source and exposes reusable assertions for named calls, object literals, JSX expressions, and narrow normalized-string fallbacks.
- Rewrote the retained `runManager`, CLI, and App contracts to assert execution-config wiring, trust metadata persistence, loop-detection fingerprints, and debug trace formatting through the shared helper.
- Removed weak UI label-only guards in favor of data-flow contracts around `runMetaByMcp`, persisted run config fields, and rendered execution-config payload values.

## Task Commits

Each task was committed atomically:

1. **Task 1: Introduce shared structural contract helpers** - `66dad7ac` (feat)
2. **Task 2: Rebalance the retained contract tests around invariants instead of incidental text** - `5b41dfce` (test)

**Plan metadata:** included in the final docs commit for this plan

## Files Created/Modified

- `src/test/support/sourceContracts.ts` - Shared AST-backed helper layer for source-shape contracts.
- `src/server/runManager.phase12.evidence.test.ts` - Structural guards for emitted execution config, trust metadata persistence, and evidence degradation reasons.
- `src/server/runManager.phase8.contract.test.ts` - Structural guards for live tool-call loop fingerprints and real MCP client wiring.
- `src/cli/mcp-bench.phase10.contract.test.ts` - Narrow formatting guard for debug trace output and review flags.
- `src/client/App.phase12.contract.test.ts` - Config persistence/request-body assertions plus SSE execution-config data-flow coverage.
- `src/client/components/run/RunScorecard.phase12.contract.test.ts` - Trust aggregation and execution-config render wiring guard.
- `src/client/components/history/RunDetailView.phase12.contract.test.ts` - Persisted trust/config/tool-trace payload render guard.

## Decisions Made

- Defaulted new contract coverage to AST-backed assertions so source-shape tests protect object wiring and JSX data flow instead of arbitrary text spans.
- Kept normalized string matching only for CLI formatting seams where AST nodes do not preserve the user-visible trace line faithfully enough.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `npm run typecheck` is still failing outside this plan’s scope due to pre-existing logger stub type errors in `src/server/runManager.test.ts`.
- `npm run test:fast` still reports two pre-existing CLI contract failures in untouched files: `src/cli/mcp-bench.phase6.contract.test.ts` and `src/cli/mcp-bench.phase8.contract.test.ts`.
- `npm run test:fast` required escalation because the sandbox returned `spawn EPERM`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The contract helper is available for any remaining source-shape guards in Phase 13.
- Remaining work can build on a smaller contract layer that focuses on execution seams instead of incidental labels.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: `.planning/phases/13-excelencia-y-estabilizacion-de-testing/13-02-SUMMARY.md`
- FOUND: `66dad7ac`
- FOUND: `5b41dfce`
