---
phase: 02-llm-adapters-mcp-registry
plan: 02
subsystem: pricing-and-adapters
completed: 2026-03-30
requirements: [ORCH-02, ORCH-03, ORCH-04, ORCH-05, ORCH-07]

# Phase 02 Plan 02 Summary

Implemented the provider pricing layer and all four LLM adapters with exact pricing lookup plus provider-default fallback.

## What Changed

- Expanded `PRICING_TABLE` to cover 15+ model entries across OpenAI, Azure, Claude, and OpenRouter.
- Changed `resolvePricing()` to exact provider:model lookup only.
- Kept provider defaults explicit in the table so adapters can fall back without hidden resolver behavior.
- Fixed OpenRouter pricing fetch to use `https://openrouter.ai/api/v1/models`.
- Kept `fetchOpenRouterPricing()` injectable for tests and startup caching.
- Updated all four adapters to return non-zero cost estimates for known models and default entries.
- Added/updated tests for exact pricing resolution, table coverage, OpenRouter payload parsing, adapter contract compliance, and non-zero cost estimation.

## Verification

- `npx tsc --noEmit` passed.
- Direct test-runner execution was blocked by the Windows sandbox process-spawn restrictions in this environment.

## Files Touched

- `src/shared/pricing/table.ts`
- `src/shared/pricing/resolver.ts`
- `src/shared/pricing/resolver.test.ts`
- `src/shared/llm/adapters/openrouter.ts`
- `src/shared/llm/adapters/openai.ts`
- `src/shared/llm/adapters/azure.ts`
- `src/shared/llm/adapters/claude.ts`
- `src/shared/llm/adapters/index.test.ts`

## Residual Risk

- Runtime integration against live OpenRouter/OpenAI/Azure/Anthropic endpoints was not executed here.
- Node test runner execution is still constrained by the sandbox, so full test confirmation needs a normal local shell.
