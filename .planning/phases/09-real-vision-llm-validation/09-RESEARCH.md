# Phase 09: Real Vision LLM Validation - Research

**Researched:** 2026-04-01
**Domain:** Vision LLM validation pipeline, multi-provider adapter image support, Browserbase REST API
**Confidence:** HIGH (all key findings backed by direct code inspection of canonical files)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `LLMMessage.content` becomes `string | ContentPart[]`. `ContentPart` is a tagged union `{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }`. Added to `src/shared/llm/types.ts`.
- **D-02:** Screenshots encoded as data URI: `url: \`data:image/png;base64,${imageBuffer.toString('base64')}\``
- **D-03:** Each adapter normalizes `string | ContentPart[]` internally. OpenAI, OpenRouter, Azure accept `ContentPart[]` natively. `ClaudeAdapter` translates to Anthropic's `{ type:'image', source:{ type:'base64', media_type, data } }` shape internally. No factory-level normalization.
- **D-04:** `validateStepWithVision()` becomes `async` with `VisionValidationInput` gaining `imageBuffer: Buffer` and `provider: LLMProvider`.
- **D-05:** Call site in `runManager.ts` (~line 498) `await`s inline. No fire-and-forget. Step result includes validation synchronously before persist.
- **D-06:** If `stepStatus !== 'passed'`, skip LLM call and return deterministic `{ verdict: 'contradicts', confidence: 0.95, needsReview: false, hallucinated: false, rationale: 'Technical step result indicates failure or abort.' }`.
- **D-07:** `runManager.ts` builds one `auditorProvider` via `createProvider()` at run start, using the same provider config as the orchestrator but model key = `auditorModel`.
- **D-08:** `RunConfig` gains one new field `auditorModel?: string`. No `auditorProvider` in config — provider is always the same as orchestrator.
- **D-09:** Default `auditorModel` when not configured: `"gpt-4.1"`.
- **D-10:** Run-start validation: throw an error before execution if `config.auditorModel === config.model` (auditor model equals orchestrator model key). Error message must name both values.
- **D-11:** Vision LLM errors (network, rate limit, malformed JSON) are caught inside `validateStepWithVision()`. On error, return `{ verdict: 'uncertain', confidence: 0.2, needsReview: true, hallucinated: false, rationale: \`Vision LLM error: ${err.message}\` }`. Run continues.
- **D-12:** On success, `rationale` comes from the model's own rationale text in the JSON response. On failure, `rationale` is `\`Vision LLM error: ${err.message}\``.
- **D-13:** Vision LLM response must be valid JSON matching verdict schema. Unparseable response → error (D-11 path). No text-parsing fallback.
- **D-14:** Browserbase orphan sweep runs once at server startup only (`server/index.ts` init block or `McpProcessManager.initialize()` hook). No per-run sweep.
- **D-15:** If `BROWSERBASE_API_KEY` is absent, skip silently with a debug-level log. No warning, no error.
- **D-16:** Sweep uses `fetch()` directly: `GET https://api.browserbase.com/v1/sessions?status=RUNNING` with `X-BB-API-Key` header, then `DELETE https://api.browserbase.com/v1/sessions/:id` per session. Log count of sessions swept at info level.

### Claude's Discretion

- Vision LLM system prompt wording and JSON schema for the verdict response
- Whether to use `response_format: { type: 'json_object' }` or structured output via function calling
- Whether `temperature: 0` applies to all providers or only OpenAI-compatible ones
- How many tokens to allocate for the vision LLM response (`maxTokens` in LLMRequest)
- Whether the Browserbase sweep DELETE errors are swallowed or logged at warn level

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VALID-07 | Vision validator uses `temperature: 0` and `response_format: json_object` for deterministic auditable verdicts | D-01 through D-13 describe the async LLM call; research confirms `json_object` as the correct response_format to use (broad compatibility, simpler than `json_schema`, works across all adapter providers) |
| VALID-03 | Tiered vision LLM validation: fast cheap model (`detail: low`) first; escalate to high-accuracy model (`detail: high`) only when confidence > 0.8 and verdict is `contradicts` | D-07/D-08/D-09: auditorProvider built from same provider+auditorModel; tier is expressed as low/high in existing `StepValidation.tier` field; initial call is always low tier; escalation path is a second LLM call with a higher-precision prompt |
| VALID-04 | Hallucination flag asserted only when: Playwright passed + LLM verdict `contradicts` + confidence > 0.7 | Already implemented in `finalizeValidation()`; the new async LLM response must provide `confidence` and `verdict` matching the existing `StepValidation` interface |
| VALID-05 | Steps with LLM confidence < 0.4 flagged as `NEEDS_REVIEW` in scorecard (not auto-asserted) | Already implemented in `finalizeValidation()`; the LLM JSON response must include `confidence` in 0–1 range |
| VALID-06 | Auditor LLM model is always different from the orchestration model (no circular verdict) | D-10: enforced at run-start via equality check between `config.auditorModel` and `config.model` |
| EXEC-07 | Cloud session leak prevention: `finally`-block cleanup + startup sweep for orphaned sessions (Browserbase, Steel) | D-14/D-15/D-16: Browserbase orphan sweep via REST API at server startup; `BROWSERBASE_API_KEY` guard |
</phase_requirements>

---

## Summary

This phase replaces the pure heuristic `validateStepWithVision()` in `src/server/validation/visionValidator.ts` with a real async LLM call that sends the captured screenshot as a base64 data URI to a vision model and uses its JSON verdict for hallucination detection and `NEEDS_REVIEW` flags. It also adds a Browserbase orphaned-session sweep at server startup.

All four architecture dimensions are bounded by user decisions in CONTEXT.md. The code structure is already in place — all changes are surgical modifications to three files (`visionValidator.ts`, `types.ts`, `runManager.ts`) plus a small addition to each adapter and to `server/index.ts`. The main discretion areas are: the system prompt + JSON schema design, whether `response_format: json_object` vs function calling is the right mechanism, and token budget for the vision LLM response.

**Primary recommendation:** Use `response_format: { type: 'json_object' }` in the LLM request for OpenAI-compatible adapters (OpenAI, OpenRouter, Azure). For Claude, instruct the model in the system prompt to output only valid JSON and parse the string response directly — Anthropic's Messages API does not have an equivalent `json_object` flag but reliably produces JSON when instructed clearly. Set `temperature: 0` for all adapters. Allocate `maxTokens: 256` — the JSON verdict is small.

---

## Standard Stack

No new packages are required. All dependencies are already present.

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `fetch` | built-in | Browserbase REST API calls | No SDK dependency needed per D-16 |
| `src/shared/llm/factory.ts` `createProvider()` | project code | Build auditorProvider at run start | Already exists; used by runManager |
| `node:fs/promises` `readFile` | built-in | Read screenshot buffer from disk path | Already used in screenshot pipeline |

### No New Dependencies
Per D-16, Browserbase sweep uses native `fetch()`. The LLM calls go through existing `LLMProvider.complete()`. Zero new `npm install` steps.

---

## Architecture Patterns

### File Change Map

```
src/
├── shared/
│   └── llm/
│       ├── types.ts                   ← ADD ContentPart union, update LLMMessage.content
│       └── adapters/
│           ├── openai.ts              ← ADD ContentPart[] normalization in complete()
│           ├── openrouter.ts          ← ADD ContentPart[] normalization in complete()
│           ├── azure.ts               ← ADD ContentPart[] normalization in complete()
│           └── claude.ts              ← ADD ContentPart[] → Anthropic image block translation
├── server/
│   ├── validation/
│   │   ├── visionValidator.ts         ← REWRITE: async, LLM call, new VisionValidationInput fields
│   │   └── visionValidator.test.ts    ← UPDATE: mock injected provider, test async path
│   ├── runManager.ts                  ← UPDATE: auditorModel in RunConfig, build auditorProvider,
│   │                                       pass to validateStepWithVision, add model equality check
│   └── index.ts                       ← ADD: Browserbase orphan sweep in start()
```

### Pattern 1: ContentPart Union Type (D-01)

The types change is backward-compatible for callers that pass plain strings. Every adapter must branch on `typeof content === 'string'`.

```typescript
// src/shared/llm/types.ts — additions
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface LLMMessage {
  role: LLMRole;
  content: string | ContentPart[];  // was: content: string
}
```

**Impact on adapters:** OpenAI, OpenRouter, Azure send messages directly as JSON. Because the OpenAI Chat Completions API already accepts `content: ContentPart[]` natively with `type: 'image_url'` and `url: 'data:image/png;base64,...'`, these three adapters only need to pass messages through unchanged — the native API shape already matches `ContentPart[]`. No transformation needed for OpenAI-compatible adapters beyond ensuring the raw JSON is passed without coercion to string.

**Impact on ClaudeAdapter:** The Anthropic Messages API uses a different image block format. `toClaudePayload()` must be updated to detect `ContentPart[]` content and translate any `image_url` part to:
```typescript
{
  type: 'image',
  source: {
    type: 'base64',
    media_type: 'image/png',   // extracted from data URI prefix
    data: '<base64-string>'    // extracted from data URI after comma
  }
}
```
Text parts become `{ type: 'text', text: string }`.

The `ClaudePayload` messages array type currently declares `content: string`. It must be widened to accept the Anthropic content block array.

### Pattern 2: Async validateStepWithVision with LLM Call

```typescript
// src/server/validation/visionValidator.ts — new signature
export async function validateStepWithVision(input: VisionValidationInput): Promise<StepValidation>

// VisionValidationInput additions:
//   imageBuffer: Buffer
//   provider: LLMProvider
```

**Fast-fail path (D-06):** Return deterministic result immediately if `stepStatus !== 'passed'`. No LLM call, no network cost.

**Low-tier LLM call flow:**
1. Build base64 data URI from `imageBuffer`
2. Construct `LLMRequest` with `model: lowModel`, `temperature: 0`, `maxTokens: 256`, `response_format: { type: 'json_object' }` (for OpenAI-compatible), messages containing system prompt + user message with `ContentPart[]` (text + image_url)
3. Call `provider.complete(request)` inside try/catch
4. Parse `choices[0].message.content` as JSON
5. If parse fails or network error → return D-11 uncertain result
6. If `verdict === 'contradicts'` and `confidence > 0.8` → run high-tier call with `highModel`

**High-tier escalation:** Same flow, different `model`. The `detail` level is expressed through the system prompt instruction ("analyze with maximum precision"), not a separate API parameter. The existing `StepValidation.tier` field is set to `'high'` for the escalated result.

### Pattern 3: auditorProvider Construction in runManager.ts

```typescript
// In executeMcpRun(), at run start — after resolveProviderConfig()
const providerConfig = this.resolveProviderConfig();
const auditorConfig: ProviderConfig = {
  ...providerConfig,
  model: session.config.auditorModel ?? 'gpt-4.1',
};
const auditorProvider = await createProvider(auditorConfig);
```

`RunConfig` (lines 47–51 in runManager.ts) gains `auditorModel?: string`. The equality check (D-10) must fire before `executeMcpRun` starts any scenario work. The check should be: if `providerConfig.model === auditorConfig.model`, throw with `"Orchestrator model and auditor model must differ: both are '${model}'"`.

**Current `RunConfig` (line 47–51):**
```typescript
interface RunConfig {
  baseUrl: string;
  selectedMcpIds: string[];
  tokenCap: number;
  // ADD: auditorModel?: string
}
```

`auditorModel` is not yet in `RunEstimateRequest` (the public API body). It should be added there too so the UI/CLI can pass it. When absent, the default `"gpt-4.1"` applies per D-09.

### Pattern 4: Browserbase Orphan Sweep (D-14/D-16)

```typescript
// src/server/index.ts — inside start() after getDb()
async function sweepBrowserbaseSessions(logger: FastifyBaseLogger): Promise<void> {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  if (!apiKey) {
    logger.debug('BROWSERBASE_API_KEY not set — skipping orphan session sweep');
    return;
  }

  const listRes = await fetch(
    'https://api.browserbase.com/v1/sessions?status=RUNNING',
    { headers: { 'X-BB-API-Key': apiKey } }
  );
  const sessions = await listRes.json() as Array<{ id: string }>;

  let swept = 0;
  for (const session of sessions) {
    await fetch(`https://api.browserbase.com/v1/sessions/${session.id}`, {
      method: 'DELETE',
      headers: { 'X-BB-API-Key': apiKey },
    });
    swept++;
  }
  logger.info({ swept }, 'Browserbase orphaned session sweep complete');
}
```

Errors from individual DELETE calls: per Claude's discretion. Research recommendation: swallow per-session errors and log at warn level, then continue sweeping remaining sessions. A single failed delete should not abort the sweep or crash startup.

### Vision LLM JSON Schema and System Prompt (Claude's Discretion)

**Recommended JSON schema for verdict response:**
```json
{
  "verdict": "matches" | "contradicts" | "uncertain",
  "confidence": 0.0–1.0,
  "rationale": "<string>"
}
```

The `StepValidation` interface already has `auditorModel`, `tier`, `verdict`, `confidence`, `needsReview`, `hallucinated`, and `rationale`. The LLM is responsible for `verdict`, `confidence`, and `rationale`. All other fields are computed from these plus `stepStatus` by `finalizeValidation()` (already exists in visionValidator.ts and remains unchanged in logic).

**Recommended system prompt structure:**
```
You are an independent visual auditor for browser automation test steps.

You are given:
1. A Gherkin step description: what the test step asserts should be true
2. A screenshot captured immediately after the MCP tool executed the step

Your task: determine whether the screenshot VISUALLY CONFIRMS or CONTRADICTS the step assertion.

Respond ONLY with a JSON object:
{
  "verdict": "matches" | "contradicts" | "uncertain",
  "confidence": <number between 0.0 and 1.0>,
  "rationale": "<brief explanation>"
}

Rules:
- "matches": screenshot clearly shows the expected state described in the step
- "contradicts": screenshot clearly shows the step did NOT produce the expected state  
- "uncertain": screenshot is ambiguous, low-quality, or the step is not visually verifiable
- confidence > 0.8 means you are highly certain of your verdict
- confidence < 0.4 means you are barely guessing — use "uncertain" in that case
- Do NOT include any text outside the JSON object
```

**User message structure (`ContentPart[]`):**
```typescript
[
  { type: 'text', text: `Step: "${input.stepText}"` },
  { type: 'image_url', image_url: { url: `data:image/png;base64,${input.imageBuffer.toString('base64')}` } }
]
```

**`response_format` handling by provider:**
- OpenAI/Azure/OpenRouter: include `response_format: { type: 'json_object' }` in the request body. These three adapters pass `request.messages` and other fields through as-is to the API — add `response_format` to `LLMRequest` as an optional field, or pass it via a provider-specific mechanism.
- Claude: omit `response_format` (no equivalent). The system prompt instruction "respond ONLY with a JSON object" is sufficient. Claude reliably produces valid JSON when instructed this way.

**Recommendation for `response_format`:** Add an optional `responseFormat?: { type: 'json_object' }` field to `LLMRequest`. Each OpenAI-compatible adapter includes it in the raw JSON body if present. ClaudeAdapter ignores it. This keeps the abstraction clean.

**temperature:** Set to `0` in the `LLMRequest` for all providers. All adapters already pass `temperature` through unchanged.

**maxTokens:** Use `256`. The JSON verdict is ~100 tokens. Generous headroom without excessive cost.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image format translation for Claude | Custom base64 splitter | Data URI convention `data:image/png;base64,<data>` — split on `,`, prefix gives media_type | One-liner regex, no library needed |
| JSON parsing with error recovery | Complex retry/fallback | `try { JSON.parse(content) } catch { return D-11 result }` | Per D-13: unparseable = error path, no text extraction |
| Browserbase session sweep | SDK install | Native `fetch()` with `X-BB-API-Key` header | Per D-16, no SDK dependency |
| Response schema validation | Zod or ajv | Simple property check (`typeof verdict === 'string'`) after parse | Small schema, overkill to add a validation library |

---

## Common Pitfalls

### Pitfall 1: ClaudeAdapter content field type narrowing
**What goes wrong:** `toClaudePayload()` currently declares `content: string` in the `ClaudePayload` messages array and calls `message.content.trim()` in `splitSystemPrompt()`. If `content` becomes `string | ContentPart[]`, `trim()` will throw at runtime on array values.
**Why it happens:** TypeScript will catch the type mismatch, but `splitSystemPrompt` processes all messages including vision messages.
**How to avoid:** Check `typeof message.content === 'string'` before calling `.trim()` in `splitSystemPrompt`. Vision messages are never system messages (role is always `user`), so the system prompt extraction path only ever receives strings — but the type guard is still needed for compile correctness.
**Warning signs:** TypeScript error `Property 'trim' does not exist on type 'string | ContentPart[]'` during `tsc --noEmit`.

### Pitfall 2: OpenAI/Azure/OpenRouter messages array serialization
**What goes wrong:** The three OpenAI-compatible adapters currently pass `request.messages` directly to `JSON.stringify`. When `content` is `ContentPart[]`, the JSON serialization is already correct — `{ type: 'image_url', image_url: { url: '...' } }` is exactly what the OpenAI Chat Completions API expects.
**Why it happens:** No action required — but developers may reflexively "normalize" the messages, converting `ContentPart[]` back to a string and losing the image.
**How to avoid:** Do NOT stringify/join `ContentPart[]` content before serialization. Pass `messages` through to `JSON.stringify` without transformation in OpenAI-compatible adapters.

### Pitfall 3: `response_format: json_object` not added to LLMRequest
**What goes wrong:** If `response_format` is not passed in the request body, the LLM may return prose mixed with JSON, causing `JSON.parse` to fail and triggering the D-11 error path on every call.
**Why it happens:** `LLMRequest` currently has no `responseFormat` field.
**How to avoid:** Add `responseFormat?: { type: 'json_object' }` to `LLMRequest` and pass it to OpenAI-compatible adapters. Verify it is included in the serialized body.

### Pitfall 4: auditorProvider built outside the per-MCP loop
**What goes wrong:** `executeMcpRun()` is called once per MCP in parallel (`Promise.allSettled`). If `auditorProvider` is built once at the session level and shared across parallel MCP runs, that is fine for stateless adapters — but the pattern must be confirmed.
**Why it happens:** `createProvider()` is async (OpenRouter adapter fetches pricing at construction time). Building it inside each `executeMcpRun()` call creates redundant pricing fetches.
**How to avoid:** Build `auditorProvider` once in `simulateRun()` before the parallel `executeMcpRun` calls, then pass it into each `executeMcpRun`. All existing adapters are stateless w.r.t. concurrent calls — safe to share.

### Pitfall 5: `await validateStepWithVision()` not reflected in `trackStepResult` signature
**What goes wrong:** `trackStepResult` is currently `async` but calls `validateStepWithVision()` synchronously. The change adds `await`, but `trackStepResult` also needs the `auditorProvider` param.
**Why it happens:** `trackStepResult` is a private method with its own signature. Adding `provider: LLMProvider` to `validateStepWithVision` means the call site in `trackStepResult` also needs a reference to `auditorProvider`.
**How to avoid:** Pass `auditorProvider` as a parameter to `trackStepResult`. The method already receives `orchestratorModel` — add `auditorProvider: LLMProvider` alongside it.

### Pitfall 6: Browserbase sweep errors crashing server startup
**What goes wrong:** If the sweep's `fetch()` call throws (e.g., network error, Browserbase unreachable), an uncaught promise rejection in `start()` causes `process.exit(1)`.
**Why it happens:** The `start()` function already has a try/catch, but if the sweep is `await`ed inside it without its own try/catch, a sweep failure aborts the server.
**How to avoid:** Wrap the entire sweep in try/catch inside `sweepBrowserbaseSessions()`. Log errors at warn level, always resolve. Server startup must not fail due to sweep errors.

### Pitfall 7: Data URI base64 extraction for ClaudeAdapter
**What goes wrong:** A data URI looks like `data:image/png;base64,iVBOR...`. When translating for Claude, the `media_type` must be `image/png` (not `image/png;base64`) and `data` must be the raw base64 string after the comma.
**Why it happens:** Naively splitting on `;` or `:` gives wrong segments.
**How to avoid:** Use: `const [prefix, data] = url.split(','); const mediaType = prefix.replace('data:', '').replace(';base64', '');` — this reliably extracts both parts.

---

## Code Examples

### OpenAI-compatible ContentPart[] pass-through (no change needed in adapter body)
```typescript
// Source: direct code inspection of src/shared/llm/adapters/openai.ts + OpenAI API docs
// The messages array is already passed as-is to JSON.stringify.
// ContentPart[] serializes correctly because OpenAI Chat Completions API natively accepts it.
// Only change: TypeScript type of messages in the interface body needs to accept ContentPart[].
body: JSON.stringify({
  model: request.model,
  messages: request.messages,  // already correct when content is ContentPart[]
  temperature: request.temperature,
  // ...
  response_format: request.responseFormat,  // ADD: pass through if present
}),
```

### ClaudeAdapter content block translation
```typescript
// Source: Anthropic Messages API docs (verified via WebSearch 2026-04-01)
function toAnthropicContent(
  content: string | ContentPart[]
): string | Array<{ type: string; [key: string]: unknown }> {
  if (typeof content === 'string') return content;

  return content.map((part) => {
    if (part.type === 'text') return { type: 'text', text: part.text };
    // image_url -> Anthropic image block
    const [prefix, data] = part.image_url.url.split(',');
    const mediaType = prefix.replace('data:', '').replace(';base64', '');
    return { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
  });
}
```

### Vision LLM call in visionValidator.ts
```typescript
// Source: decisions D-04 through D-13 in 09-CONTEXT.md
async function callVisionLLM(
  imageBuffer: Buffer,
  stepText: string,
  model: string,
  provider: LLMProvider
): Promise<{ verdict: VisionVerdict; confidence: number; rationale: string }> {
  const dataUri = `data:image/png;base64,${imageBuffer.toString('base64')}`;

  const request: LLMRequest = {
    model,
    temperature: 0,
    maxTokens: 256,
    responseFormat: { type: 'json_object' },
    messages: [
      { role: 'system', content: VISION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Step: "${stepText}"` },
          { type: 'image_url', image_url: { url: dataUri } },
        ],
      },
    ],
  };

  const response = await provider.complete(request);
  const raw = response.choices[0]?.message.content ?? '';

  if (typeof raw !== 'string') throw new Error('Unexpected non-string content from vision LLM');

  const parsed = JSON.parse(raw) as { verdict?: string; confidence?: number; rationale?: string };
  if (!parsed.verdict || typeof parsed.confidence !== 'number') {
    throw new Error('Vision LLM response missing required fields');
  }

  return {
    verdict: parsed.verdict as VisionVerdict,
    confidence: parsed.confidence,
    rationale: parsed.rationale ?? '',
  };
}
```

### Data URI extraction for ClaudeAdapter
```typescript
// Pattern for extracting media_type and raw base64 from data URI
const [prefix, data] = url.split(',');
const mediaType = prefix.replace('data:', '').replace(';base64', '');
// mediaType = 'image/png', data = '<raw base64 string>'
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `validateStepWithVision()` sync heuristic | Async LLM call with real vision model | Phase 9 | Verdicts are grounded in actual screenshot analysis, not text pattern matching |
| `LLMMessage.content: string` | `content: string \| ContentPart[]` | Phase 9 | Enables multimodal (image+text) messages across all adapters |
| No Browserbase session cleanup | Startup sweep clears orphaned RUNNING sessions | Phase 9 | Prevents billing for leaked cloud browser sessions |

**OpenAI `gpt-4.1` and `response_format`:** Community reports conflict about whether `json_schema` structured outputs work on gpt-4.1 (MEDIUM confidence: some users report errors). The simpler `json_object` mode has broader compatibility across all model generations and is appropriate here — the verdict schema is small and doesn't need strict schema enforcement from the API level. The system prompt's instruction to output only JSON is sufficient when combined with `json_object` mode.

---

## Open Questions

1. **`response_format` in LLMRequest**
   - What we know: D-17 is Claude's discretion; `LLMRequest` currently has no `responseFormat` field
   - What's unclear: whether to add `responseFormat` to `LLMRequest` or handle it per-adapter internally
   - Recommendation: Add `responseFormat?: { type: 'json_object' }` to `LLMRequest`. Adapters that support it (OpenAI, Azure, OpenRouter) include it in request body. ClaudeAdapter ignores it. This is the cleanest approach and avoids adapter-internal special-casing.

2. **`imageBuffer` when screenshot capture fails**
   - What we know: `captureStepScreenshot()` returns `{ screenshotId: null, screenshotPath: null }` on failure; `screenshotAvailable` flag in old `VisionValidationInput` handled this
   - What's unclear: with the new signature requiring `imageBuffer: Buffer`, what buffer to pass when screenshot is unavailable
   - Recommendation: Pass an empty `Buffer.alloc(0)` and retain the `screenshotAvailable: boolean` field. When `!screenshotAvailable`, use D-11 error-path fallback immediately (no LLM call for empty buffer).

3. **Tiered escalation: same provider, different model**
   - What we know: D-07 says auditorProvider uses same provider as orchestrator but different model. Tiering uses `lowCostAuditorModel` and `highAccuracyAuditorModel`.
   - What's unclear: CONTEXT.md gives one `auditorModel` field; two tier models would require two fields
   - Recommendation: `auditorModel` in `RunConfig` maps to the **low-tier** model (default `gpt-4.1`). The high-tier model can be derived: if `auditorModel` contains "mini", swap to the non-mini variant; otherwise use a hard-coded fallback like `gpt-4.1` for low and `gpt-4o` for high. Or add `auditorModelHigh?: string` to `RunConfig`. Simpler: a single `auditorModel` is the high-tier model, and the low-tier derives from it (e.g., append `-mini`). The planner should pick one approach.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `node:fs/promises` | Read imageBuffer from screenshotPath | Built-in | Node.js 22+ | — |
| Native `fetch` | Browserbase sweep | Built-in (Node 18+) | — | — |
| `BROWSERBASE_API_KEY` env var | Browserbase sweep | Optional | — | Silent skip (D-15) |
| `OPENAI_API_KEY` / other provider key | Vision LLM call | Dev environment | — | Run will throw on missing creds (existing behavior) |

**Missing dependencies with no fallback:** None — all required runtime capabilities are built-in or already wired.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node:test`) + `node:assert/strict` |
| Config file | none — tests discovered by `npm test` glob `src/**/*.test.ts` via `tsx` |
| Quick run command | `node ./node_modules/tsx/dist/cli.mjs --test "src/server/validation/visionValidator.test.ts"` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VALID-07 | `validateStepWithVision` calls `provider.complete()` with `temperature: 0` and `response_format: json_object` | unit | quick run command above | ✅ (needs update) |
| VALID-03 | Tiered escalation: confidence > 0.8 + contradicts triggers second LLM call with high-tier model | unit | quick run command above | ✅ (needs update) |
| VALID-04 | `hallucinated: true` only when `stepStatus === 'passed'` + verdict `contradicts` + confidence > 0.7 | unit | quick run command above | ✅ (existing test logic reusable) |
| VALID-05 | `needsReview: true` when confidence < 0.4 | unit | quick run command above | ✅ (existing test logic reusable) |
| VALID-06 | Run throws before execution when auditorModel === orchestratorModel | unit | `node ./node_modules/tsx/dist/cli.mjs --test "src/server/runManager.test.ts"` | ✅ (needs new test case) |
| EXEC-07 | Browserbase sweep calls GET sessions?status=RUNNING then DELETE per session | unit | `node ./node_modules/tsx/dist/cli.mjs --test "src/server/index.test.ts"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** Quick run on `visionValidator.test.ts`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/server/index.test.ts` — covers EXEC-07 (Browserbase sweep with mocked fetch)

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `src/server/validation/visionValidator.ts` — current sync implementation, `StepValidation` interface, `VisionValidationInput` interface
- Direct code inspection: `src/shared/llm/types.ts` — `LLMMessage.content: string`, `LLMRequest`, `ProviderConfig`
- Direct code inspection: `src/shared/llm/adapters/{openai,openrouter,azure,claude}.ts` — adapter patterns, `toClaudePayload()`, `splitSystemPrompt()`
- Direct code inspection: `src/shared/llm/factory.ts` — `createProvider()` signature and behavior
- Direct code inspection: `src/server/runManager.ts` lines 47–52 (`RunConfig`), lines 478–503 (`trackStepResult` with `validateStepWithVision` call), lines 719–770 (`resolveProviderConfig()`)
- Direct code inspection: `src/server/index.ts` — `start()` function structure
- Direct code inspection: `src/shared/registry/index.ts` — `@browserbasehq/mcp` entry confirming `BROWSERBASE_API_KEY` env var
- `09-CONTEXT.md` — All 16 locked decisions (authoritative)

### Secondary (MEDIUM confidence)
- Browserbase docs WebFetch: `GET https://api.browserbase.com/v1/sessions?status=RUNNING` confirmed, `X-BB-API-Key` auth confirmed — matches D-16
- Anthropic Claude Messages API format for base64 images: `{ type: 'image', source: { type: 'base64', media_type, data } }` — confirmed via WebSearch cross-referencing official Claude docs
- OpenAI Chat Completions: `response_format: { type: 'json_object' }` has broader compatibility than `json_schema`; gpt-4.1 may not support `json_schema`, but `json_object` behavior confirmed as standard across gpt-4 lineage

### Tertiary (LOW confidence)
- Browserbase DELETE endpoint (`DELETE /v1/sessions/:id`): CONTEXT.md D-16 states this explicitly; web research was inconclusive but the CONTEXT.md decision is authoritative

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; existing code fully inspected
- Architecture: HIGH — all canonical files read; change surface is precise
- Pitfalls: HIGH — derived from direct code inspection of types and adapter patterns
- Browserbase API DELETE endpoint: MEDIUM — CONTEXT.md D-16 is authoritative; web verification inconclusive

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable OpenAI Chat Completions API, Anthropic Messages API)
