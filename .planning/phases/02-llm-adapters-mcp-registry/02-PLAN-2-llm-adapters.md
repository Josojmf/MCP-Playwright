# Phase 2, Plan 2: LLM Provider Adapters

**Phase:** 2 (LLM Provider Adapters & MCP Registry)  
**Focus:** Implement all four provider adapters (OpenRouter, Azure OpenAI, OpenAI, Claude) with pricing tables and cost estimation.  
**Requirements Covered:** ORCH-02, ORCH-03, ORCH-04, ORCH-05, ORCH-07

---

## Task 1: Pricing Table & Cost Estimation Utilities

**Files:** `src/shared/pricing/table.ts`, `src/shared/pricing/resolver.ts`

Create a centralized pricing system:

**`table.ts`:**
- Static pricing map: keyed by `${provider}:${model}` (e.g., `openai:gpt-4-turbo`, `azure:gpt-35-turbo`, `claude:claude-3-opus-20240229`)
- Each entry: `{ inputPer1MTokens: number, outputPer1MTokens: number }`
- OpenRouter models are expensive (pass-through pricing); default to high estimates
- Azure, OpenAI, and Claude prices are published rates; validate against current pricing docs

**`resolver.ts`:**
- Export `resolvePricing(provider: string, model: string): PricingRecord | null`
- Returns null if model not found (adapter falls back to estimation)
- Export `estimateCostUsd(inputTokens: number, outputTokens: number, pricing: PricingRecord): number`
- Formula: `(input / 1_000_000) * inputRate + (output / 1_000_000) * outputRate`, rounded to 6 decimals
- Export `fetchOpenRouterPricing(): Promise<Map<string, PricingRecord>>` with 20-second timeout
  - Calls `https://openrouter.io/api/v1/models` (HTTP GET, requires `Authorization: Bearer <key>`)
  - Maps response models to pricing map
  - Returns empty map on timeout or error (fallback to static table)

**Tests:**
- `estimateCostUsd` returns deterministic numbers for known inputs
- Fetch timeout doesn't hang the startup (20s limit enforced)
- Pricing table loads without errors

---

## Task 2: OpenRouterAdapter

**Files:** `src/shared/llm/adapters/openrouter.ts`

Implement the OpenRouter adapter using the `openai` SDK:

- Constructor: takes `apiKey: string`
  - Instantiate `OpenAI({ apiKey, baseURL: "https://openrouter.io/api/v1", defaultHeaders: { "HTTP-Referer": "mcp-playground" } })`
  - Fetch OpenRouter pricing at startup; store in instance variable

- `async complete(request: LLMRequest): Promise<LLMResponse>`
  - Call `client.chat.completions.create(request)` with streaming disabled
  - Extract cost from response headers: `x-total-cost` (in USD)
  - Build `LLMResponse` with usage and cost

- `async stream(request: LLMRequest): AsyncIterable<LLMChunk>`
  - Call `client.chat.completions.create(request)` with streaming enabled
  - Yield chunks as they arrive
  - Track usage: initial cost estimate from `usage` field in final chunk

- `async estimateCost(inputTokens: number, outputTokens: number, model: string): Promise<number>`
  - Look up pricing from instance cache or static table
  - Return USD estimate

**Design notes:**
- OpenRouter's `x-total-cost` header is the source of truth for billing
- Message format is standard OpenAI format
- No special system-prompt handling needed

---

## Task 3: AzureOpenAIAdapter

**Files:** `src/shared/llm/adapters/azure.ts`

Implement the Azure OpenAI adapter:

- Constructor: takes `resourceName: string, deploymentName: string, apiKey: string, apiVersion?: string`
  - Instantiate `AzureOpenAI({ resourceName, deploymentName, apiKey, apiVersion: "2024-12-01-preview" (or from config) })`
  - No pricing fetch needed (use static table)

- `async complete(request: LLMRequest): Promise<LLMResponse>`
  - Call `client.chat.completions.create({ ...request, model: this.deploymentName })`
  - Note: Azure ignores the `model` field in request; uses deployment name instead
  - Extract usage from response and compute cost using static pricing table

- `async stream(request: LLMRequest): AsyncIterable<LLMChunk>`
  - Similar to complete but with streaming enabled

- `async estimateCost(inputTokens: number, outputTokens: number, model: string): Promise<number>`
  - Use static pricing lookup for `azure:${model}`
  - Return USD estimate

**Design notes:**
- Azure requires deployment name, not model name, for routing
- `apiVersion` is pinned to latest stable (2024-12-01-preview or newer)
- No special system-prompt handling needed

---

## Task 4: OpenAIAdapter

**Files:** `src/shared/llm/adapters/openai.ts`

Implement the standard OpenAI adapter:

- Constructor: takes `apiKey: string`
  - Instantiate `OpenAI({ apiKey })`
  - No pricing fetch (use static table)

- `async complete(request: LLMRequest): Promise<LLMResponse>`
  - Call `client.chat.completions.create(request)` with streaming disabled
  - Extract usage and compute cost using static pricing

- `async stream(request: LLMRequest): AsyncIterable<LLMChunk>`
  - Call `client.chat.completions.create(request)` with streaming enabled
  - Yield chunks

- `async estimateCost(inputTokens: number, outputTokens: number, model: string): Promise<number>`
  - Use static pricing lookup
  - Return USD estimate

**Design notes:**
- Straightforward wrapper around standard OpenAI SDK
- Message format is standard

---

## Task 5: ClaudeAdapter

**Files:** `src/shared/llm/adapters/claude.ts`

Implement the Claude adapter using the Anthropic SDK:

- Constructor: takes `apiKey: string`
  - Instantiate `Anthropic({ apiKey })`

- Core design: Claude uses a different message format
  - System prompt is **not** a message; it's passed separately as `system: string` parameter to `messages.create()`
  - Convert `LLMRequest.messages` array: filter out `role: 'system'` messages, pass system content to `system` param
  - Maintain alternating-turn enforcement: user → assistant → user... (Claude rejects violations)

- `async complete(request: LLMRequest): Promise<LLMResponse>`
  - Extract system message from messages array
  - Build call: `client.messages.create({ model: request.model, system: systemPrompt, messages: userMessages, max_tokens: request.max_tokens, ... })`
  - Extract usage and compute cost

- `async stream(request: LLMRequest): AsyncIterable<LLMChunk>`
  - Extract system message
  - Use `client.messages.stream()` for streaming responses
  - Yield chunks with delta content

- `async estimateCost(inputTokens: number, outputTokens: number, model: string): Promise<number>`
  - Use static pricing lookup for `claude:${model}`
  - Return USD estimate

**Design notes:**
- System prompt **cannot** be in the messages array; it's a separate parameter
- Anthropic SDK has different response shape than OpenAI (no `choices` array)
- Alternating-turn enforcement must be validated in the orchestrator, not here

---

## Task 6: Integration Tests

**Files:** `src/shared/llm/adapters/index.test.ts`

Write tests for each adapter:

- Mock credentials environment variables
- Factory returns correct adapter type for each provider
- Each adapter's `estimateCost()` returns a non-zero USD amount
- `complete()` and `stream()` methods are callable (mock SDK responses)
- Claude adapter filters system messages correctly and passes to `system` param
- Azure adapter routes through deployment name

**Note:** These are unit tests with mocked SDK responses, not integration tests against live APIs (those are deferred to Phase 3 end-to-end testing).

---

## Success Criteria

- [ ] All four adapters implement `LLMProvider` interface correctly
- [ ] Factory correctly instantiates each adapter based on config
- [ ] Pricing table loads (static + OpenRouter fetch with fallback)
- [ ] Cost estimation is deterministic and testable
- [ ] Claude's system prompt handling is isolated and correct
- [ ] All adapter tests pass (4 adapter types × 3 test scenarios = 12+ test cases)
- [ ] TypeScript compile check passes (no `any` in adapter signatures)
