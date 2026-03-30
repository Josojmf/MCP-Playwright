# Phase 2: LLM Provider Adapters & MCP Registry - Context

**Gathered:** 2026-03-30  
**Status:** Ready for planning

---

## Phase Boundary

Finalize the `LLMProvider` interface, implement all four provider adapters (OpenRouter, Azure OpenAI, OpenAI, Claude) with pricing tables and cost estimation, define the MCP registry schema and register the first two servers (@playwright/mcp, @modelcontextprotocol/server-puppeteer), and translate Gherkin `Then` clauses into Playwright `expect()` assertions. All provider-specific logic is encapsulated in adapters — no provider coupling in the orchestration engine.

## Implementation Decisions

### LLMProvider Interface & Factory

- **D-01:** Interface defines `complete()` and `stream()` methods. No model selection in interface — model name passed at call time. Factory signature: `createProvider(config: ProviderConfig)` returns typed adapter.
- **D-02:** Config key is the only mechanism for provider selection. Credentials passed as separate env vars per provider (e.g., `OPENAI_API_KEY`, `AZURE_OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).

### Adapter Implementations

- **D-03:** OpenRouter uses `openai` npm SDK with `baseURL` override to `https://openrouter.io/api/v1`. Streaming via standard OpenAI streaming responses. Cost extracted from `x-total-cost` response header (in USD).
- **D-04:** Azure OpenAI uses `@azure/openai` SDK. Deployment name routing via config. `apiVersion` pinned to `2024-12-01-preview` or latest stable.
- **D-05:** OpenAI uses standard `openai` SDK with no overrides. Cost computed from token counts using local pricing table.
- **D-06:** Claude uses `@anthropic-ai/sdk` directly. System prompt as flat string (not message array). Alternating-turn enforcement (user → assistant → user) in conversation history.

### Pricing & Cost Estimation

- **D-07:** Pricing table lives in `src/shared/pricing/table.ts` with per-model input/output rates. OpenRouter pricing cached at startup via `/api/v1/models` endpoint (20-sec timeout). Fallback to static table if fetch fails.
- **D-08:** `estimateCost()` function: `(inputTokens, outputTokens, model, provider) => USD dollars`. Deterministic and testable.

### MCP Registry

- **D-09:** Registry schema: tool namespace prefix, transport mode (stdio/sse/http), auth requirements, parallelism model. Stored in `src/shared/registry/index.ts` as a flat TypeScript object.
- **D-10:** First two entries: `@playwright/mcp` with `browser_*` prefix, `@modelcontextprotocol/server-puppeteer` with `puppeteer_*` prefix.
- **D-11:** System prompt assembly: for each MCP registry entry, include only tools with its declared namespace prefix. Use LLM's existing tool descriptions from tool definitions.

### Gherkin Assertion Translator

- **D-12:** Known patterns: URL check, page title, element visibility, element text, element count, element attribute, form field value, redirect presence. Patterns are regex-based or simple keyword matching.
- **D-13:** Output is a Playwright `expect()` call as a string (e.g., `expect(page).toHaveURL("https://example.com")`). Stored in parsed step metadata for Phase 3 validation.

## Phase 1 Dependencies

✓ Safety harness types (`TimeoutError`, `AbortController`)  
✓ SSE endpoint (`/stream/:runId`, event publishing)  
✓ Gherkin parser (parses feature files into step arrays)  

## Phase 3 Hard Dependencies

Both `LLMProvider` and `MCPRegistry` must be finalized and correctly typed — Phase 3 orchestrator depends on them.

## No External Services Required for Phase 2 Planning

OpenRouter, Azure, OpenAI, and Anthropic client libraries are npm packages. Actual credential setup deferred to Phase 3+ (when MCPs are launched).
