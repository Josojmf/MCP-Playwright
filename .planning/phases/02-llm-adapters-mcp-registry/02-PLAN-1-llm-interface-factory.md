# Phase 2, Plan 1: LLMProvider Interface & Factory

**Phase:** 2 (LLM Provider Adapters & MCP Registry)  
**Focus:** Define the provider-agnostic interface and factory pattern for swapping LLM implementations.  
**Requirements Covered:** ORCH-01, ORCH-06

---

## Task 1: LLMProvider Interface & Types

**Files:** `src/shared/llm/types.ts`

Create the core types that all adapter implementations will satisfy:

- **`LLMRequest`** — model name, messages array, max_tokens, temperature, top_p
- **`LLMResponse`** — choices array with finish_reason, usage (prompt_tokens, completion_tokens, total_tokens)
- **`LLMChunk`** — streaming chunk with delta content and optional usage
- **`LLMProvider`** interface with:
  - `complete(request: LLMRequest): Promise<LLMResponse>` — single synchronous response
  - `stream(request: LLMRequest): AsyncIterable<LLMChunk>` — streaming response yields chunks
  - `estimateCost(inputTokens: number, outputTokens: number, model: string): Promise<number>` — returns USD
- **`LLMMessage`** type — `{ role: 'user' | 'assistant' | 'system', content: string }`
- **`ProviderConfig`** — minimal config type with provider name and any provider-specific fields (optional API version, deployment name, etc.)

**Design notes:**
- Zero business logic in the interface — it's a pure contract
- Message format is standard (OpenAI-like) with one exception: Claude's system prompt is a flat string (handled in adapter's message construction)
- Both `complete()` and `stream()` return the same usage info for consistency
- `estimateCost()` is async because OpenRouter may fetch live pricing

---

## Task 2: Provider Factory Function

**Files:** `src/shared/llm/factory.ts`

Implement `createProvider(config: ProviderConfig): Promise<LLMProvider>`:

- Route on `config.provider` key: `"openrouter" | "azure" | "openai" | "claude"`
- Return the correct adapter class instance
- Load and validate credentials from environment variables:
  - `OPENROUTER_API_KEY` for OpenRouter
  - `AZURE_OPENAI_API_KEY` for Azure (also needs `AZURE_OPENAI_ENDPOINT`)
  - `OPENAI_API_KEY` for OpenAI
  - `ANTHROPIC_API_KEY` for Claude
- Throw `ProviderConfigError` if any required credential is missing
- For Azure, extract `deploymentName` and `resourceName` from config, throw if missing
- Return immediately; actual client initialization (SDK instantiation) deferred to each adapter's constructor

---

## Task 3: Test Factory & Mock Adapter

**Files:** `src/shared/llm/types.test.ts`

Write tests that verify:
- Factory with `provider: "openrouter"` returns an object satisfying `LLMProvider` interface (duck-type check)
- Factory with `provider: "azure"` with valid deployment/resource config returns an adapter
- Factory with `provider: "openai"` returns an adapter
- Factory with `provider: "claude"` returns an adapter
- Factory throws `ProviderConfigError` if a required credential is missing
- Interface is fully typed (TypeScript compile-time check)

Use a mock `LLMProvider` implementation for these tests (simple stub that returns dummy responses).

---

## Success Criteria

- [ ] `LLMProvider` interface compiles and is exported from `src/shared/llm/index.ts`
- [ ] All four provider keys route through factory without errors
- [ ] Credentials validated at factory time with clear error messages
- [ ] Message format contract is well-documented (OpenAI-standard, system=flat-string for Claude)
- [ ] All tests pass (interface, factory routing, credential validation)
