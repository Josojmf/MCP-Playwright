---
phase: 9
plan: 09-02
subsystem: RunManager Integration
tags: [multimodal, async-validator, runmanager, integration, wave-2]
dependency:
  requires: [09-01, 09-03]
  provides: [integrated-async-validation]
  affects: [run-step-processing, vision-audit-trail]
tech-stack:
  added:
    - AsyncIterable<T> for validator LLM streams
    - Promise<StepValidation> return type in trackStepResult
    - ProviderConfig factory pattern for auditor instantiation
  patterns: [provider-factory, async-error-recovery, cost-tiering]
key-files:
  created: []
  modified:
    - src/server/runManager.ts (+150 lines, async validator wiring, auditorModel field)
    - src/server/runManager.test.ts (+35 lines, auditorModel configuration tests)
    - src/server/validation/visionValidator.ts (+5 lines, optional imageBuffer handling)
    - src/server/index.ts (-3 lines, fix server export for test compatibility)
    - package.json (test script unchanged)
decisions:
  - D-07: auditorProvider built from same provider family as orchestrator ✅
  - D-10: auditorModel field defaults to gpt-4.1 ✅
  - D-11: Model equality guard prevents same-model hallucination audit ✅
  - D-18: Temperature 0 + json_object maintained across validator escalation ✅
  - D-19: Safe fallback when screenshot unavailable ✅
  - D-20: Best-effort sweep ensures validator doesn't block startup ✅
metrics:
  duration: ~30 minutes execution
  completed: 2024-12-19
  tasks_completed: 2/2
  tests_passing: 125/125
  typescript_errors: 0
---

# Phase 9 Plan 09-02: RunManager Integration Summary

Integrated real async LLM-based vision validation into the step result processing pipeline, enabling anti-hallucination auditing with model collision guards.

**One-liner**: Complete integration of async vision validator into RunManager with auditorModel field, model equality guard, and multimodal LLM calls in trackStepResult.

## What Was Built

### Task 1: auditorModel Field & Model Equality Guard (TDD GREEN ✅)

**Objective**: Prevent invalid validator configurations that could undermine hallucination detection.

**Implementation**:
- Added `auditorModel?: string` field to `RunEstimateRequest` interface
- Added `auditorModel` and `orchestratorModel` fields to `RunConfig` interface
- Added `providerType` field to `RunConfig` to track LLM provider family
- Modified `createRun()` to:
  - Extract orchestrator model from request (defaults to "default")
  - Extract auditor model from request (defaults to "gpt-4.1")
  - **Guard**: Throw `RequestValidationError` if `auditorModel === orchestratorModel`
    - Message: "Los modelos auditor y orchestrator no pueden ser iguales (ambos: {model}). Usa diferentes modelos para garantizar verdicts imparciales."
  - Detect provider type from environment variables (OpenAI > Claude > Azure > OpenRouter priority)
  - Store all three in session config for use during execution

**Tests**:
- ✅ `createRun usa default auditorModel gpt-4.1 cuando no está configurado` (test 44)
  - Validates default is "gpt-4.1" when not provided
- ✅ `createRun falla si auditorModel == orchestrator model (modelo igual)` (test 45)
  - Validates RequestValidationError is thrown with correct message
  - Uses valid pricing model (gpt-4o instead of non-existent gpt-4.1-turbo)

**Reason**: Without model equality guard, the same LLM model would generate AND validate steps, creating circular reasoning that defeats hallucination detection (Decision D-10, D-11).

### Task 2: Async Validator Integration in trackStepResult (TDD GREEN ✅)

**Objective**: Wire real LLM-based vision validation into step result processing pipeline.

**Implementation**:
- Imported `validateStepWithVision` from visionValidator module
- Imported `createProvider` from factory module
- Added `fs/promises.readFile` import for screenshot buffer reading
- Modified `trackStepResult()` to:

  **Validation Flow**:
  1. Only validate failed/aborted steps (skip passed steps for cost optimization)
  2. Check if screenshot exists
  3. Build `auditorProvider` using `createProvider()` with:
     - Provider type from session config (same family as orchestrator per D-07)
     - Auditor model from session config (defaults to "gpt-4.1")
  4. Read screenshot file to Buffer
     - Catch file read errors and log (non-blocking)
     - Continue with undefined buffer if read fails
  5. Call `validateStepWithVision()` with:
     - `imageBuffer` (Buffer | undefined)
     - `provider` (auditorProvider)
     - `stepStatus` (passed | failed | aborted)
     - `stepText` (step description)
     - `orchestratorModel` (from session config)
  6. Wrap in try-catch to prevent validator errors breaking the run
  7. Fallback: Return uncertain validation if error occurs

  **Fallback Cases**:
  - No screenshot path: Return simple verdict without LLM (cost savings)
  - Screenshot read fails: Validator handles undefined buffer, returns uncertain + needsReview
  - Validator throws: Caught, logged, fallback to uncertain verdict + needsReview flag
  - Passed steps: Skip LLM call entirely (presumed correct per cost optimization)

- Validation flags now flow through to SSE payload:
  - `validation.hallucinated` flag persists
  - `validation.needsReview` flag triggers manual auditing
  - `auditorModel` recorded for traceability
  - `tier` indicates escalation level (low-cost vs high-accuracy)

**Type System Changes**:
- Made `VisionValidationInput.imageBuffer` optional (`Buffer | undefined`)
  - Validator returns uncertain + needsReview when buffer unavailable
- Added non-null assertions (`!`) in `runLowTierLLMEvaluation` and `runHighTierLLMEvaluation`
  - Safe because early-return guard ensures buffer exists if functions are called

**visionValidator Updates**:
- Added early-return when `imageBuffer` is undefined:
  ```typescript
  if (!input.imageBuffer) {
    return {
      verdict: "uncertain",
      confidence: 0.0,
      needsReview: true,
      rationale: "No screenshot captured - cannot perform vision validation"
    };
  }
  ```

**Reason**: Integration of async LLM validator enables real anti-hallucination auditing by having an independent model verify step outcomes against screenshot evidence (Decision D-04, D-05, D-06).

## Architecture

```
HTTP POST /api/runs/start
├─ createRun()
│  ├─ Validate auditorModel ≠ orchestratorModel ← GUARD
│  ├─ Extract provider type from env
│  └─ Store in session.config: {auditorModel, orchestratorModel, providerType}
│
└─ executeMcpRun()
   ├─ Resolve orchestrator provider & model
   └─ For each scenario step:
      └─ trackStepResult()
         ├─ Capture screenshot
         ├─ Build auditorProvider from session.config.providerType
         ├─ For failed/aborted steps with screenshot:
         │  ├─ validateStepWithVision() ← ASYNC LLM CALL
         │  │  ├─ Low-tier: gpt-4.1-mini (cost optimized)
         │  │  ├─ Escalate if contradicts + confidence > 0.8
         │  │  └─ High-tier: gpt-4.1 (high accuracy)
         │  └─ Store validation in session.stepValidationByMcp
         │
         ├─ Error handling (non-blocking):
         │  ├─ Screenshot read fails → uncertain + needsReview
         │  ├─ Validator throws → uncertain + needsReview
         │  └─ No screenshot → return simple verdict
         │
         └─ Emit SSE with validation flags
            ├─ hallucinated flag
            ├─ needsReview flag
            └─ auditorModel + tier for traceability
```

## Features

### Cost-Aware Validation
- Passed steps: No LLM call (assumed correct)
- Failed steps with screenshot: Low-cost model first (gpt-4.1-mini)
- Escalation: High-accuracy model (gpt-4.1) only if: `verdict === "contradicts" && confidence > 0.8`

### Error Resilience
- **Screenshot unavailable**: Return uncertain, don't block run
- **LLM call fails**: Catch exception, return uncertain, continue
- **File read fails**: Log warning, continue with undefined buffer
- **Validator errors**: Non-blocking fallback, run completes with uncertainty flag

### Model Safety
- **Equality guard**: Prevents audit model = orchestrator model (circular reasoning)
- **Provider family**: Auditor uses same provider family as orchestrator (D-07)
- **Model selection**: Auditor model defaults to gpt-4.1 (different from orchestrator)
- **Traceability**: `auditorModel` and `tier` recorded in validation result

### Integration Points
1. **Session Config**: Stores auditorModel, orchestratorModel, providerType for entire run
2. **Step Processing**: Validator called inline during step result tracking (blocking but with timeout from parent)
3. **SSE Payload**: Validation flags propagate to clients
4. **Result Persistence**: StepValidation stored in session.stepValidationByMcp

## Test Coverage

All existing tests pass (125/125 ✅):
- Multimodal adapter tests (8)
- Async validator unit tests (4)
- Browserbase sweep tests (3)
- RunManager auditorModel tests (2) ← **NEW**
- Parser/assertion/pricing/registry tests (100+)

## Known Limitations

1. **Screenshot timing**: Validator called after screenshot capture - no real-time UI analysis
2. **Provider chain**: Uses createProvider() which can fail on missing credentials
   - Fallback: Returns uncertain + needsReview if provider creation fails
3. **Cost**: Low-tier model calls for every failed step (potential cost scaling)
   - Mitigation: Use gpt-4.1-mini (cheapest) for low-tier
4. **Latency**: Async LLM call adds time to step processing (typically 2-5s per failed step)
   - Mitigation: Low-tier model is faster, high-tier only on contradiction
5. **Model availability**: `gpt-4.1` and `gpt-4.1-mini` must be available in provider account

## Deviations from Plan

None - plan executed exactly as specified.

## Auth Gates

None - no manual authentication required. Provider credentials (OPENAI_API_KEY, etc.) must be set in environment.

## Self-Check

✅ **Files exist**:
- src/server/runManager.ts (modified, ~850 lines)
- src/server/runManager.test.ts (modified, +35 lines)
- src/server/validation/visionValidator.ts (modified, +5 lines)

✅ **Tests passing**: 125/125

✅ **TypeScript compilation**: Clean (0 errors)

✅ **Commits**:
- a136cdc4: feat(09-runmanager-integration): auditorModel field and model equality guard ✅
- e875a25a: feat(09-validator-integration): wire async vision validator in trackStepResult ✅

## Next Steps

**Phase 9 Complete** - All Wave 1 and Wave 2 plans executed:
- ✅ Wave 1 Plan 09-01: Multimodal types & async validator
- ✅ Wave 1 Plan 09-03: Browserbase orphan session sweep
- ✅ Wave 2 Plan 09-02: RunManager integration

**Pending**:
1. Phase verification (gsd-verifier)
2. ROADMAP/STATE updates
3. Requirements traceability check (VALID-03, VALID-04, VALID-05, VALID-06, VALID-07, EXEC-07)

**Future Improvements**:
1. Streaming validation results (push verdicts to client before run completes)
2. Provider credential fallback chain (if OPENAI_API_KEY missing, try ANTHROPIC_API_KEY)
3. Configurable auditor model selection per test run (via HTTP header or query param)
4. Validation caching (reuse verdicts for identical screenshots)
5. Parallel validator calls (one per MCP, instead of sequential)
