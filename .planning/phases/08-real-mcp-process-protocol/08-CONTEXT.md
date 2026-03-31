# Phase 08: Real MCP Process Protocol & Integration Fixes - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace four stubs and correctness bugs to make the execution engine real:
1. `McpProcessManager` — replace stub `node -e 'setInterval()'` with real MCP JSON-RPC stdio transport (`@modelcontextprotocol/sdk`): `initialize` handshake, `tools/list`, `tools/call`, health-check via capability negotiation, graceful cleanup on completion and crash
2. CLI provider — replace `createCliProvider()` mock in `mcp-bench.ts` with `createProvider(config)` factory backed by real env vars
3. `LoopDetector` fingerprinting — fix fingerprint from Gherkin step text to actual MCP tool name + serialized arguments
4. `estimateRun()` pricing — replace hardcoded `$1.5/$6 per 1M` with adapter pricing table via `resolvePricing()`

No new user-visible features; no UI changes; no new MCP servers added.

</domain>

<decisions>
## Implementation Decisions

### MCP spawn command source
- **D-01:** Add a `spawnCommand: string[]` field to `MCPServerEntry` in `src/shared/registry/types.ts`. McpProcessManager reads the command from the registry by server ID — it does NOT derive or guess commands.
- **D-02:** For `@playwright/mcp`, the registry entry `spawnCommand` is `["npx", "-y", "@playwright/mcp@latest"]` (always latest from npm, no local install required).
- **D-03:** For `@modelcontextprotocol/server-puppeteer`, use `["npx", "-y", "@modelcontextprotocol/server-puppeteer@latest"]` analogously.
- **D-04:** Adding a new MCP server in future phases requires only a registry update — zero changes to `McpProcessManager`.

### McpProcessManager as real BaseMcpClient
- **D-05:** `McpProcessManager` implements `BaseMcpClient` (exposes `callTool(name, args)`). The stub in `runManager.ts` is replaced with the `McpProcessManager` instance. `InstrumentedMcpClient` wraps it as before.
- **D-06:** Health check uses MCP capability negotiation (successful `initialize` handshake) rather than `process.kill(pid, 0)`.
- **D-07:** On crash or clean completion, `McpProcessManager` closes the SDK transport and nulls internal state. The existing `crashed` / `crashReason` fields are preserved.

### CLI provider config loading
- **D-08:** `mcp-bench run` loads provider config from **env vars only** — no config file fallback.
- **D-09:** Provider is selected via a `--provider` flag: `openrouter | openai | azure | anthropic`. No default auto-detect from env.
- **D-10:** Each provider reads its own env var:
  - `openrouter` → `OPENROUTER_API_KEY`
  - `openai` → `OPENAI_API_KEY`
  - `azure` → `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_ENDPOINT`
  - `anthropic` → `ANTHROPIC_API_KEY`
- **D-11:** Model is set via `--model` flag (optional; provider default applies if omitted).
- **D-12:** If `--provider` is not passed, `mcp-bench` exits with a clear error listing supported providers and required env vars.

### LoopDetector fingerprinting fix
- **D-13:** After the fix, fingerprint input is `{ name: toolCallTrace.toolName, argsString: JSON.stringify(toolCallTrace.arguments) }` — NOT the Gherkin step text.
- **D-14:** When a single Gherkin step produces multiple tool calls, **each tool call is fed individually** to `loopDetector.recordAndCheck()`. The per-step `resetStep()` call moves to after all calls in the step are fed.
- **D-15:** When `stepResult.toolCalls` is empty (step has no tool calls), skip the loop detector for that step — do not fall back to step text.
- **D-16:** When `LoopDetector` throws `LoopError`, the step is marked **`aborted`** (not `failed`) to distinguish loop-guard termination from genuine test failures in the scorecard.

### estimateRun() pricing fix
- **D-17:** `estimateRun()` remains **synchronous**. Use `resolvePricing(providerName, model)` (already sync) instead of the hardcoded 1.5/6 constants. `runManager` must know the active provider name and model at estimate time.
- **D-18:** If `resolvePricing()` returns `null` for the given provider/model combination, **throw an error** — do not silently fall back to a default. Error message must name the unrecognized model and provider so the user can fix their config.

### Claude's Discretion
- Exact error message phrasing for unknown model in `estimateRun()`
- Whether `McpProcessManager` exposes `listTools()` publicly or only uses it internally during `initialize`
- How the `StdioClientTransport` reconnect behavior interacts with crash detection (implementation detail)
- Timeout duration for the `initialize` handshake before declaring health-check failure

</decisions>

<specifics>
## Specific Ideas

- "It should support many providers: OpenRouter, OpenAI, Azure OpenAI, Anthropic" — all four must be wired in the CLI, not just OpenRouter
- The `--provider` flag makes the CLI explicit and CI-friendly — no ambiguity from which env var happens to be set

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### MCP process and execution
- `src/server/mcp/McpProcessManager.ts` — Current stub implementation; Plan 1 rewrites this
- `src/server/mcp/InstrumentedMcpClient.ts` — `BaseMcpClient` interface definition; McpProcessManager must implement this interface
- `src/server/runManager.ts` lines 338–440 — `executeMcpRun()` with stub `BaseMcpClient`, loop detector call site, Phase 8 annotations

### Registry
- `src/shared/registry/types.ts` — `MCPServerEntry` type; needs `spawnCommand: string[]` added (D-01)
- `src/shared/registry/index.ts` — Existing registry entries for `@playwright/mcp` and `@modelcontextprotocol/server-puppeteer`

### Loop detection
- `src/shared/harness/LoopDetector.ts` — Current implementation (fingerprints by exact match on `ToolCallRecord`)
- `src/server/runManager.ts` lines 400–405 — Current `loopDetector.recordAndCheck()` call site using wrong fingerprint

### CLI provider
- `src/cli/mcp-bench.ts` lines 55, 213–260 — `createCliProvider()` mock and where `createProvider()` replaces it
- `src/shared/llm/factory.ts` (or `src/shared/llm/adapters/`) — `createProvider()` factory that CLI will call

### Pricing
- `src/server/runManager.ts` lines 128–132 — Hardcoded pricing constants to replace
- `src/shared/pricing/resolver.ts` (or similar) — `resolvePricing()` function to use instead
- `src/shared/harness/TokenBudget.ts` — `estimateCostUsd()` static helper

### Requirements mapping
- `.planning/ROADMAP.md` §Phase 8 — Plans, success criteria, UAT checklist
- EXEC-03, CLI-01, INFRA-04, ORCH-07 in `.planning/REQUIREMENTS.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `InstrumentedMcpClient` + `BaseMcpClient` interface (`src/server/mcp/InstrumentedMcpClient.ts`) — McpProcessManager slots in as the real `BaseMcpClient` implementation
- `createProvider()` factory (`src/shared/llm/`) — already supports all four adapters; CLI just needs to call it
- `resolvePricing()` + `estimateCostUsd()` — already sync, already used by all four adapters; `estimateRun()` uses them directly
- `@modelcontextprotocol/sdk` — already installed in `node_modules`

### Established Patterns
- All adapters import `{ estimateCostUsd, resolvePricing }` from `../../pricing/resolver` — follow same pattern in `runManager`
- `McpProcessManager` already has `crashed` / `crashReason` crash-detection fields — preserve them in the real implementation
- `LoopDetector.recordAndCheck()` already accepts `ToolCallRecord { name, argsString }` — call shape is correct, just the input values need fixing

### Integration Points
- `runManager.ts:executeMcpRun()` — stub `BaseMcpClient` replaced with `McpProcessManager` instance; `McpProcessManager` receives `mcpId` and reads registry for `spawnCommand`
- `mcp-bench.ts:runHeadless()` — `createCliProvider()` replaced with `createProvider(config)` where `config` is built from `--provider` flag + env vars
- `loopDetector.recordAndCheck()` call site — loop over `stepResult.toolCalls` instead of single call per step

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-real-mcp-process-protocol*
*Context gathered: 2026-03-31*
