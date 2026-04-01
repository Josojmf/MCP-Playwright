# Phase 09: Real Vision LLM Validation - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the heuristic-only `validateStepWithVision()` with a real async LLM API call that sends the captured screenshot to a vision model and uses its JSON verdict for hallucination detection, `NEEDS_REVIEW` flags, and tiered escalation. Adds Browserbase orphaned-session sweep at server startup.

No new MCPs, no UI changes beyond scorecard tier badge — pure validation pipeline upgrade.

</domain>

<decisions>
## Implementation Decisions

### LLM message shape for images

- **D-01:** `LLMMessage.content` becomes a union type: `string | ContentPart[]`.

  ```ts
  // src/shared/llm/types.ts
  export type ContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

  export interface LLMMessage {
    role: LLMRole;
    content: string | ContentPart[];
  }
  ```

- **D-02:** Screenshots are encoded as data URI base64 strings:
  `url: \`data:image/png;base64,${imageBuffer.toString('base64')}\``
  No external URL or storage dependency required.

- **D-03:** Each adapter normalizes `string | ContentPart[]` internally before passing to its SDK. Adapters check `typeof content === 'string'` and handle accordingly. OpenAI and OpenRouter accept `ContentPart[]` natively. ClaudeAdapter translates to Anthropic's `{ type:'image', source:{ type:'base64', media_type, data } }` shape internally. No normalization layer at the factory.

### Async signature and call site

- **D-04:** `validateStepWithVision()` becomes `async` and gains an `imageBuffer?: Buffer` parameter (optional — safe fallback when absent), `provider: LLMProvider`, and `orchestratorModel: string`. Signature:
  ```ts
  export interface VisionValidationInput {
    stepStatus: "passed" | "failed" | "aborted";
    stepText: string;
    imageBuffer?: Buffer;
    provider: LLMProvider;
    orchestratorModel: string;
    lowCostAuditorModel?: string;   // defaults to "gpt-4.1-mini"
    highAccuracyAuditorModel?: string; // defaults to "gpt-4.1"
  }
  async function validateStepWithVision(input: VisionValidationInput): Promise<StepValidation>
  ```

- **D-05:** The call site in `runManager.ts` `await`s the call for **PASSED steps only**. Passed steps are the hallucination-detection target — the LLM checks whether a step the MCP claimed passed actually succeeded. Failed/aborted steps get a deterministic verdict without an LLM call.

  ```ts
  if (normalizedStepStatus === "passed" && screenshotPath) {
    // build provider, call validateStepWithVision
  } else {
    // deterministic result for failed/aborted — no LLM call
  }
  ```

- **D-06:** If `stepStatus` is `'failed'` or `'aborted'`, skip the LLM call entirely and return a deterministic result immediately. No network call for already-failed steps:
  ```ts
  if (input.stepStatus !== "passed") {
    return {
      verdict: 'contradicts', confidence: 0.95,
      needsReview: false, hallucinated: false,
      rationale: 'Technical step result indicates failure or abort.'
    };
  }
  ```

### Vision provider configuration

- **D-07:** `runManager.ts` builds a single `auditorProvider` instance via `createProvider()` at the validation call site, using the same provider as the orchestrator but with the auditor model key.

- **D-08:** `RunConfig` gains **two** auditor model fields (the previous single `auditorModel` field is removed):
  - `lowCostAuditorModel?: string` — default `"gpt-4.1-mini"`
  - `highAccuracyAuditorModel?: string` — default `"gpt-4.1"`
  RunManager passes both to `VisionValidationInput`. The provider type is always the same as the orchestrator provider.

- **D-09:** Default auditor models when not configured: `"gpt-4.1-mini"` (low tier), `"gpt-4.1"` (high tier).

- **D-10:** Run-start validation: throw an error before execution if either auditor model key equals the orchestrator model key. Error message must name both values. Applies to both `lowCostAuditorModel` and `highAccuracyAuditorModel`.

### Tiered escalation

- **D-11-TIER:** Two-tier evaluation strategy:
  - **Low tier** (`lowCostAuditorModel`, default `gpt-4.1-mini`): always runs first for passed steps.
  - **High tier** (`highAccuracyAuditorModel`, default `gpt-4.1`): escalates only when low tier returns `verdict === "contradicts"` AND `confidence > 0.8`.
  - Escalation threshold: `confidence > 0.8`.

- **D-12-TIER:** `StepValidation.tier: "low" | "high"` records which evaluation tier produced the final verdict. A `"high"` tier value means the low tier escalated. This field is:
  - Persisted in the `StepValidation` record.
  - Surfaced in the scorecard UI as a `"HIGH"` badge on escalated verdicts, giving visibility into which steps triggered expensive high-accuracy calls.

### Vision LLM failure mode

- **D-13:** Vision LLM call errors (network, rate limit, malformed JSON) are caught inside `validateStepWithVision()`. On error, return:
  ```ts
  {
    verdict: 'uncertain', confidence: 0.2,
    needsReview: true, hallucinated: false,
    rationale: `Vision LLM error: ${err.message}`
  }
  ```
  The run continues. The step is flagged for human review but not marked hallucinated.

- **D-14:** On success, `rationale` is populated from the model's own rationale text in the JSON response. On failure, rationale is `` `Vision LLM error: ${err.message}` ``.

- **D-15:** The vision LLM response must be valid JSON matching the verdict schema. If the response is not parseable JSON, treat it as an error (D-13 path). Do not attempt text parsing of unstructured model output.

### Browserbase orphaned-session sweep

- **D-16:** The sweep runs once at **server startup only** (in `server/index.ts` during initialization). No per-run sweep.

- **D-17:** If `BROWSERBASE_API_KEY` is absent, skip silently with a debug-level log. No warning, no error. Most users don't use Browserbase.

- **D-18:** Sweep uses Browserbase REST API directly via `fetch()` — no SDK dependency:
  ```
  GET  https://api.browserbase.com/v1/sessions?status=RUNNING
       X-BB-API-Key: ${BROWSERBASE_API_KEY}
  DELETE https://api.browserbase.com/v1/sessions/:id
         X-BB-API-Key: ${BROWSERBASE_API_KEY}
  ```
  List all `RUNNING` sessions, then DELETE each. Log counts of sessions swept at info level.

- **D-19:** Browserbase startup sweep is **best-effort resilient**:
  - Never block server startup because of sweep/list/delete failures.
  - Log summary counts (`found`, `deleted`, `failed`) at startup.
  - Log per-session delete failures at warn level.

### Vision auditor response contract

- **D-20:** Vision auditor response uses an **extended strict JSON contract**. Required fields from model response:
  - `verdict` (`matches | contradicts | uncertain`)
  - `confidence` (number)
  - `rationale` (string)
  - `needsReview` (boolean)
  - `hallucinated` (boolean)
  Any invalid or non-JSON response is treated as controlled error path (`uncertain`, low confidence, `needsReview: true`).

- **D-21:** Auditor execution policy is **deterministic where provider supports it**:
  - OpenAI/OpenRouter/Azure: force deterministic settings and structured JSON output.
  - Claude: enforce strict JSON via prompt contract and strict parser validation.
  - In all providers, malformed output follows the same error fallback path.

- **D-22:** If screenshot read fails when building `imageBuffer`, use **safe fallback and continue run**:
  - Do not fail the technical step only because visual evidence cannot be loaded.
  - Return `uncertain`, low confidence, `needsReview: true`, `hallucinated: false`.

### Hallucination finalization

- **D-23:** `finalizeValidation()` computes final `needsReview` and `hallucinated` as local guard-rail overrides on top of model-reported values:
  - `needsReview = validation.confidence < 0.4 || validation.verdict === "uncertain"`
  - `hallucinated = stepStatus === "passed" && verdict === "contradicts" && confidence > 0.7`

### Claude's Discretion
- Vision LLM system prompt wording and JSON schema for the verdict response
- How many tokens to allocate for the vision LLM response (`maxTokens` in `LLMRequest`)
- Whether `needsReview` and `hallucinated` are stored both as model-reported and locally-recomputed guard-rail fields (implementation detail)

</decisions>

<specifics>
## Specific Ideas

- "The model is going to be always from the same provider (azure openai, openrouter...) the multiplatform support is only for flexibility" — auditor uses same provider as orchestrator; only model key differs
- Default auditor models: `gpt-4.1-mini` (low tier) and `gpt-4.1` (high tier) — user-specified
- Failed/aborted steps get a deterministic result without any LLM call — keeps cost low and avoids misleading vision analysis on already-certain outcomes
- Vision validation targets PASSED steps — detecting MCPs that claim success but screenshots show failure is the core anti-hallucination use case
- Tiered escalation: only escalate to expensive high-accuracy model when low tier is highly confident in a contradiction (>0.8)
- Extended strict JSON contract selected to reduce ambiguous audit outcomes across providers
- Browserbase sweep policy chosen as resilient best-effort (non-blocking startup)
- `StepValidation.tier` badge in scorecard gives cost/quality visibility to users

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Vision validator
- `src/server/validation/visionValidator.ts` — Current async LLM implementation with tiered escalation; this is the authoritative source for validation logic
- `src/server/validation/visionValidator.test.ts` — Existing tests; must be updated to reflect corrected call policy (passed steps only) and two-model config

### LLM types and adapters
- `src/shared/llm/types.ts` — `LLMMessage.content` is `string | ContentPart[]`; `ContentPart` type defined here
- `src/shared/llm/adapters/openrouter.ts` — Adapter that handles `ContentPart[]` content natively (OpenAI-compatible)
- `src/shared/llm/adapters/openai.ts` — Same as OpenRouter adapter pattern
- `src/shared/llm/adapters/azure.ts` — Same as OpenRouter adapter pattern
- `src/shared/llm/adapters/claude.ts` — Translates `ContentPart[]` to Anthropic's native image format internally

### Run manager call site
- `src/server/runManager.ts` lines ~540–596 — Vision validation call site; **BUG**: currently calls for `normalizedStepStatus !== "passed"`; must be corrected to call for `normalizedStepStatus === "passed"` only
- `src/server/runManager.ts` lines ~50–55 — `RunConfig` interface; `auditorModel` field must be replaced with `lowCostAuditorModel` and `highAccuracyAuditorModel`
- `src/server/runManager.ts` lines ~175–182 — Model equality guard at run-start; must be updated to validate both tier models against orchestratorModel

### Registry and startup
- `src/server/index.ts` — Server startup; location for Browserbase orphan sweep call (`sweepBrowserbaseOrphanSessions`)
- `src/shared/registry/index.ts` — `@browserbasehq/mcp` entry; confirms HTTP transport and `BROWSERBASE_API_KEY` env var

### Requirements mapping
- `.planning/ROADMAP.md` §Phase 9 — Plans, success criteria, UAT checklist
- VALID-07, VALID-03, VALID-04, VALID-05, VALID-06, EXEC-07 in `.planning/REQUIREMENTS.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Current state of visionValidator.ts
- Async function with full tiered escalation implemented: low-tier always runs; high-tier escalates when contradicts + confidence > 0.8
- `VisionValidationInput` has `lowCostAuditorModel?: string` and `highAccuracyAuditorModel?: string` optional fields (defaults to `gpt-4.1-mini` / `gpt-4.1` internally)
- `StepValidation` has `tier: VisionTier` field (`"low" | "high"`) recording which tier produced the verdict
- `finalizeValidation()` applies guard-rail overrides for `needsReview` and `hallucinated`

### RunManager — current bug
- Line ~547: `if (normalizedStepStatus !== "passed" && screenshotPath)` — **inverted logic**; should be `=== "passed"`
- `RunConfig.auditorModel` is the single field currently; must become two fields: `lowCostAuditorModel` + `highAccuracyAuditorModel`
- Equality guard at ~line 175 only checks `auditorModel`; must check both tier models

### LLM adapter patterns
- All adapters call `provider.complete(request: LLMRequest)` — adding image to `LLMMessage.content` flows through existing `complete()` path
- `ClaudeAdapter` handles special message formatting; handles image format translation to Anthropic's native format

### Browserbase
- `sweepBrowserbaseOrphanSessions()` already implemented in `server/index.ts` as a standalone async function
- HTTP transport — no `McpProcessManager` involved
- `BROWSERBASE_API_KEY` env var already referenced in `src/shared/registry/index.ts`

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 09-real-vision-llm-validation*
*Context gathered: 2026-04-01 (updated — reflects actual implementation and bug fix decisions)*
