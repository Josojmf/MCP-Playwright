# Phase 09: Real Vision LLM Validation - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the heuristic-only `validateStepWithVision()` with a real async LLM API call that sends the captured screenshot to a vision model and uses its JSON verdict for hallucination detection, `NEEDS_REVIEW` flags, and tiered escalation. Adds Browserbase orphaned-session sweep at server startup.

No new MCPs, no UI changes, no new run lifecycle events — pure validation pipeline upgrade.

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

- **D-04:** `validateStepWithVision()` becomes `async` and gains an `imageBuffer: Buffer` parameter and a `provider: LLMProvider` parameter. Signature change:
  ```ts
  async function validateStepWithVision(input: VisionValidationInput): Promise<StepValidation>
  // where VisionValidationInput adds:
  //   imageBuffer: Buffer
  //   provider: LLMProvider
  ```

- **D-05:** The call site in `runManager.ts` (`~line 498`) `await`s the call inline, blocking step processing until the vision result is available. No fire-and-forget. Simpler flow; step result includes validation synchronously before persist.

- **D-06:** If `stepStatus` is `'failed'` or `'aborted'`, skip the LLM call entirely and return a deterministic result immediately. No network call for already-failed steps:
  ```ts
  if (input.stepStatus !== 'passed') {
    return {
      verdict: 'contradicts', confidence: 0.95,
      needsReview: false, hallucinated: false,
      rationale: 'Technical step result indicates failure or abort.'
    };
  }
  ```

### Vision provider configuration

- **D-07:** `runManager.ts` builds a single `auditorProvider` instance via `createProvider()` at run start, using the **same provider** as the orchestrator but a different model key. The `auditorProvider` is passed down to `validateStepWithVision()` as a plain `LLMProvider` instance.

- **D-08:** `RunConfig` (or equivalent config type) gains one new field: `auditorModel?: string`. No `auditorProvider` field — the provider is always the same as the orchestrator provider. Multi-provider flexibility exists only at the orchestrator level.

- **D-09:** Default `auditorModel` when not configured: `"gpt-4.1"`.

- **D-10:** Run-start validation (from VALID-06): throw an error before execution if `config.auditorModel === config.model` (auditor model key equals orchestrator model key). Error message must name both values.

### Vision LLM failure mode

- **D-11:** Vision LLM call errors (network, rate limit, malformed JSON) are caught inside `validateStepWithVision()`. On error, return:
  ```ts
  {
    verdict: 'uncertain', confidence: 0.2,
    needsReview: true, hallucinated: false,
    rationale: `Vision LLM error: ${err.message}`
  }
  ```
  The run continues. The step is flagged for human review but not marked hallucinated.

- **D-12:** On success, `rationale` is populated from the model's own rationale text in the JSON response. On failure, rationale is `\`Vision LLM error: ${err.message}\``.

- **D-13:** The vision LLM response must be valid JSON matching the verdict schema. If the response is not parseable JSON, treat it as an error (D-11 path). Do not attempt text parsing of unstructured model output.

### Browserbase orphaned-session sweep

- **D-14:** The sweep runs once at **server startup only** (in `server/index.ts` during initialization, or in a dedicated `McpProcessManager.initialize()` hook). No per-run sweep.

- **D-15:** If `BROWSERBASE_API_KEY` is absent, skip silently with a debug-level log. No warning, no error. Most users don't use Browserbase.

- **D-16:** Sweep uses Browserbase REST API directly via `fetch()` — no SDK dependency:
  ```
  GET  https://api.browserbase.com/v1/sessions?status=RUNNING
       X-BB-API-Key: ${BROWSERBASE_API_KEY}
  DELETE https://api.browserbase.com/v1/sessions/:id
         X-BB-API-Key: ${BROWSERBASE_API_KEY}
  ```
  List all `RUNNING` sessions, then DELETE each. Log the count of sessions swept at info level.

### Claude's Discretion
- Vision LLM system prompt wording and JSON schema for the verdict response
- Whether to use `response_format: { type: 'json_object' }` or structured output via function calling
- Whether `temperature: 0` applies to all providers or only OpenAI-compatible ones
- How many tokens to allocate for the vision LLM response (`maxTokens` in LLMRequest)
- Whether the Browserbase sweep DELETE errors are swallowed or logged at warn level

</decisions>

<specifics>
## Specific Ideas

- "The model is going to be always from the same provider (azure openai, openrouter...) the multiplatform support is only for flexibility" — auditorModel only; auditorProvider is not a separate config field
- Default auditor model is `gpt-4.1` (user-specified)
- Failed/aborted steps get a deterministic result without any LLM call — keeps cost low and avoids misleading vision analysis on already-certain outcomes

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Vision validator
- `src/server/validation/visionValidator.ts` — Current sync heuristic implementation; this phase rewrites it to async with real LLM calls
- `src/server/validation/visionValidator.test.ts` — Existing tests; must be updated to mock the injected provider

### LLM types and adapters
- `src/shared/llm/types.ts` — `LLMMessage.content` changes from `string` to `string | ContentPart[]`; `ContentPart` type added here
- `src/shared/llm/adapters/openrouter.ts` — Adapter that handles `ContentPart[]` content natively (OpenAI-compatible)
- `src/shared/llm/adapters/openai.ts` — Same as OpenRouter adapter pattern
- `src/shared/llm/adapters/azure.ts` — Same as OpenRouter adapter pattern
- `src/shared/llm/adapters/claude.ts` — Must translate `ContentPart[]` to Anthropic's native image format internally

### Run manager call site
- `src/server/runManager.ts` lines 498–503 — Current sync `validateStepWithVision()` call; becomes `await validateStepWithVision(...)` with `imageBuffer` and `provider` params
- `src/server/runManager.ts` lines 80–100 — RunConfig / session setup where `auditorModel` config is read and `auditorProvider` is built

### Registry and startup
- `src/server/index.ts` — Server startup; location for Browserbase orphan sweep call
- `src/shared/registry/index.ts` — `@browserbasehq/mcp` entry; confirms HTTP transport and `BROWSERBASE_API_KEY` env var

### Requirements mapping
- `.planning/ROADMAP.md` §Phase 9 — Plans, success criteria, UAT checklist
- VALID-07, VALID-03, VALID-04, VALID-05, VALID-06, EXEC-07 in `.planning/REQUIREMENTS.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Current state of visionValidator.ts
- Pure sync function, no `imageBuffer` param, no LLM calls — all heuristics on `stepText` and `stepStatus`
- `StepValidation` interface already has `auditorModel`, `verdict`, `confidence`, `needsReview`, `hallucinated`, `rationale` — correct shape, no additions needed
- `VisionValidationInput` needs two new fields: `imageBuffer: Buffer` and `provider: LLMProvider`

### LLM adapter patterns
- All adapters import `{ estimateCostUsd, resolvePricing }` from `../../pricing/resolver`
- All adapters call `provider.complete(request: LLMRequest)` — adding image to `LLMMessage.content` flows through existing `complete()` path
- `ClaudeAdapter` already handles special message formatting (system prompt extraction) — will also handle image format translation

### Run manager integration points
- `runManager.ts:498` — `validateStepWithVision()` call; add `await` + new params
- `runManager.ts:~15` — Import `validateStepWithVision` already present; `createProvider` import already present
- `screenshotId` / `screenshotPath` are already computed before the validator call (line ~490); `imageBuffer` will be read from disk at the same point

### Browserbase
- HTTP transport — no `McpProcessManager` involved; sweep is a standalone async function
- `BROWSERBASE_API_KEY` env var already referenced in `src/shared/registry/index.ts`

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 09-real-vision-llm-validation*
*Context gathered: 2026-04-01*
