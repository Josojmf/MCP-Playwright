---
phase: "08-real-mcp-process-protocol"
plan: "02"
subsystem: "cli, runManager, loop-detection, pricing"
tags: ["cli", "llm-provider", "loop-detector", "pricing", "correctness"]
dependency_graph:
  requires: ["08-01"]
  provides: ["real-cli-provider", "accurate-loop-detection", "accurate-pricing"]
  affects: ["src/cli/mcp-bench.ts", "src/server/runManager.ts", "src/shared/harness/LoopDetector.test.ts"]
tech_stack:
  added: []
  patterns: ["factory-pattern", "fingerprinting", "pricing-lookup"]
key_files:
  created: []
  modified:
    - "src/cli/mcp-bench.ts"
    - "src/server/runManager.ts"
    - "src/shared/harness/LoopDetector.test.ts"
    - "src/server/runManager.test.ts"
decisions:
  - "anthropic CLI flag maps to ProviderName claude to match internal type system"
  - "LoopDetector resetStep() placed after the tool calls for-loop (not before) to correctly track within-step loops"
  - "resolvePricing throws on unknown provider:model to surface misconfig early rather than silently using wrong rates"
metrics:
  duration_seconds: 228
  completed_date: "2026-04-01"
  tasks_completed: 2
  files_modified: 4
---

# Phase 8 Plan 2: Real CLI Provider, Loop Detection Fix, and Pricing Resolution Summary

**One-liner:** Wired real LLM provider into CLI via `createProvider()` factory, fixed LoopDetector to fingerprint actual MCP tool calls (name + JSON args) instead of Gherkin text, and replaced hardcoded $1.5/$6 pricing constants with `resolvePricing()` table lookup.

## What Was Built

### Task 1: Replace Mock CLI Provider (commit `a33313f5`)

`src/cli/mcp-bench.ts` previously used `createCliProvider()` — a mock that returned synthetic `"CLI mock ejecutado: ..."` text. This made all CLI runs produce fake output with no real LLM calls.

Changes:
- Deleted `createCliProvider()` entirely
- Added `--provider` flag (required) with validation and helpful error listing all 4 providers + env vars
- Added `--model` flag (optional)
- Added `anthropic` -> `claude` ProviderName mapping (CLI uses "anthropic", internal type is "claude")
- Calls `createProvider(providerConfig)` from `src/shared/llm/factory.ts` — handles real credentials from env
- `mcpConfig.provider` now uses `providerName` from CLI flag instead of hardcoded `"openai"/"gpt-4"`
- Updated `printHelp()` to document `--provider` and `--model`

### Task 2: Fix LoopDetector Call Site and estimateRun Pricing (commit `e06563af`)

**Loop detection fix:** The original call at `runManager.ts` fed `name: "${mcpId}:${stepResult.canonicalType}"` and `argsString: stepResult.stepText` — meaning loop detection compared Gherkin step descriptions, not actual MCP tool invocations. An MCP could loop on `browser_click(#btn)` while Gherkin text varied, and the detector would never trigger.

New behavior:
- Iterates `stepResult.toolCalls` (each `ToolCallTrace` with `toolName` + `arguments`)
- Feeds `{ name: toolCall.toolName, argsString: JSON.stringify(toolCall.arguments) }` to `loopDetector.recordAndCheck()`
- Skips loop detector entirely when `toolCalls` is empty (no false positives on steps with no tool calls)
- `LoopError` now creates an `abortedResult` with `status: 'aborted'` before re-throwing
- `resetStep()` moved to after the for-of loop (not before) — correct position for within-step tracking

**Pricing fix:** `estimateRun()` replaced `TokenBudget.estimateCostUsd({ inputPer1MTokensUsd: 1.5, outputPer1MTokensUsd: 6 })` with `resolvePricing(provider, model ?? 'default')` lookup from the pricing table. Throws descriptive error if provider:model combo not found.

**Interface update:** `RunEstimateRequest` now has `provider: string` and `model?: string` fields. Existing tests updated to include `provider: "openai"`.

**New LoopDetector tests:**
1. Detects loop on identical tool name + serialized args (JSON fingerprint)
2. Does NOT trigger on same tool name with different args
3. Does NOT trigger on different tool names with same args

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed runManager.test.ts callers missing required `provider` field**
- **Found during:** Task 2 - after adding `provider: string` to `RunEstimateRequest`, TypeScript reported 5 type errors in the existing test file
- **Fix:** Added `provider: "openai"` to all 5 `estimateRun()` call sites in `runManager.test.ts`
- **Files modified:** `src/server/runManager.test.ts`
- **Commit:** `e06563af` (included in same task commit)

## Verification

- `npx tsc --noEmit`: PASS (0 errors)
- `npm test`: PASS (116/116 tests)
- No hardcoded pricing constants remain in `estimateRun`
- No Gherkin step text used in loop detector fingerprints
- No mock `createCliProvider` in `mcp-bench.ts`
- `RunEstimateRequest` has `provider` and `model` fields

## Known Stubs

None — all changes wire real behavior. The pricing table (`src/shared/pricing/table.ts`) covers `openai:default`, `claude:default`, `azure:default`, `openrouter:default` as fallbacks, so the `model ?? 'default'` path is always resolvable for the 4 supported providers.

## Self-Check: PASSED

Files exist:
- `src/cli/mcp-bench.ts`: FOUND
- `src/server/runManager.ts`: FOUND
- `src/shared/harness/LoopDetector.test.ts`: FOUND
- `src/server/runManager.test.ts`: FOUND

Commits exist:
- `a33313f5` (Task 1 - feat: replace mock CLI provider)
- `e06563af` (Task 2 - fix: LoopDetector call site and pricing)
