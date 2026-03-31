# Phase 08: Real MCP Process Protocol & Integration Fixes - Research

**Researched:** 2026-03-31
**Domain:** MCP JSON-RPC stdio protocol, LLM provider factory, loop detection, pricing resolution
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**MCP spawn command source**
- D-01: Add `spawnCommand: string[]` to `MCPServerEntry` in `src/shared/registry/types.ts`. `McpProcessManager` reads the command from the registry by server ID — does NOT derive or guess commands.
- D-02: For `@playwright/mcp`, registry `spawnCommand` is `["npx", "-y", "@playwright/mcp@latest"]`.
- D-03: For `@modelcontextprotocol/server-puppeteer`, use `["npx", "-y", "@modelcontextprotocol/server-puppeteer@latest"]`.
- D-04: Adding a new MCP server in future phases requires only a registry update — zero changes to `McpProcessManager`.

**McpProcessManager as real BaseMcpClient**
- D-05: `McpProcessManager` implements `BaseMcpClient` (exposes `callTool(name, args)`). Stub in `runManager.ts` is replaced with the `McpProcessManager` instance. `InstrumentedMcpClient` wraps it as before.
- D-06: Health check uses MCP capability negotiation (successful `initialize` handshake) rather than `process.kill(pid, 0)`.
- D-07: On crash or clean completion, `McpProcessManager` closes the SDK transport and nulls internal state. Existing `crashed`/`crashReason` fields preserved.

**CLI provider config loading**
- D-08: `mcp-bench run` loads provider config from env vars only — no config file fallback.
- D-09: Provider selected via `--provider` flag: `openrouter | openai | azure | anthropic`. No default auto-detect.
- D-10: Each provider reads its own env var: `openrouter` → `OPENROUTER_API_KEY`; `openai` → `OPENAI_API_KEY`; `azure` → `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_ENDPOINT`; `anthropic` → `ANTHROPIC_API_KEY`.
- D-11: Model set via `--model` flag (optional; provider default applies if omitted).
- D-12: If `--provider` not passed, `mcp-bench` exits with clear error listing supported providers and required env vars.

**LoopDetector fingerprinting fix**
- D-13: After fix, fingerprint input is `{ name: toolCallTrace.toolName, argsString: JSON.stringify(toolCallTrace.arguments) }` — NOT Gherkin step text.
- D-14: When a single Gherkin step produces multiple tool calls, each tool call is fed individually to `loopDetector.recordAndCheck()`. The per-step `resetStep()` call moves to after all calls in the step are fed.
- D-15: When `stepResult.toolCalls` is empty, skip loop detector for that step — do not fall back to step text.
- D-16: When `LoopDetector` throws `LoopError`, step is marked `aborted` (not `failed`).

**estimateRun() pricing fix**
- D-17: `estimateRun()` remains synchronous. Use `resolvePricing(providerName, model)` instead of hardcoded 1.5/6 constants. `runManager` must know active provider name and model at estimate time.
- D-18: If `resolvePricing()` returns `null`, throw an error naming the unrecognized model and provider.

### Claude's Discretion
- Exact error message phrasing for unknown model in `estimateRun()`
- Whether `McpProcessManager` exposes `listTools()` publicly or only uses it internally during `initialize`
- How `StdioClientTransport` reconnect behavior interacts with crash detection
- Timeout duration for the `initialize` handshake before declaring health-check failure

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXEC-03 | MCP process lifecycle: spawn, health-check, cleanup on completion and on crash | `@modelcontextprotocol/sdk` v1.28.0 `StdioClientTransport` + `Client.connect()` patterns documented below |
| CLI-01 | Headless CLI runner outputs structured JSON results | `createProvider(config)` factory already supports all 4 adapters; CLI just needs to replace mock with real call |
| INFRA-04 | `LoopDetector` aborts MCP that repeats identical tool calls (sliding-window fingerprint) | `LoopDetector.recordAndCheck()` already accepts correct `ToolCallRecord` shape; call site in `runManager.ts` feeds wrong data — fix is call-site only |
| ORCH-07 | Pricing table with OpenRouter `/api/v1/models` cache | `resolvePricing()` already exists and is sync; `RunEstimateRequest` needs `provider`/`model` fields added |
</phase_requirements>

---

## Summary

Phase 8 replaces four stubs and correctness bugs to make the execution engine real. All four changes are surgical: no new abstractions, no new dependencies. The `@modelcontextprotocol/sdk` v1.28.0 is already installed. The `createProvider()` factory already handles all four LLM adapters. The `resolvePricing()` function is already sync. The `LoopDetector` already accepts the correct data shape — only the call site feeds it wrong values.

The most architecturally significant change is `McpProcessManager`: it goes from spawning a dummy `node -e 'setInterval()'` to spawning the real MCP server binary via `StdioClientTransport`, performing an MCP JSON-RPC handshake via `Client.connect()`, and implementing `BaseMcpClient.callTool()` by delegating to `client.callTool()`. The `spawn()` method becomes a two-phase operation: OS process spawn (handled by `StdioClientTransport.start()` which is called implicitly by `Client.connect()`) then MCP protocol `initialize` handshake (D-06: health check).

One implementation-critical discrepancy exists: CONTEXT.md D-09/D-10 uses the CLI flag value `anthropic` but the codebase's `ProviderName` type uses `"claude"`. The CLI flag must map the string `"anthropic"` → `ProviderConfig.provider: "claude"` before calling `createProvider()`.

**Primary recommendation:** Implement in plan order — registry type first (D-01), then `McpProcessManager` (most complex), then CLI (straightforward factory call), then loop detector call-site fix, then pricing fix. Each change is isolated; all can be tested independently.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | 1.28.0 (already installed) | MCP JSON-RPC stdio client | Official SDK; already in node_modules |
| `node:child_process` | Node built-in | Process lifecycle (used by StdioClientTransport internally) | StdioClientTransport handles spawning internally |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `cross-spawn` | (SDK dependency) | Cross-platform process spawn | Used internally by StdioClientTransport — no direct use needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Client` + `StdioClientTransport` from SDK | Raw `readline`/JSON-RPC handshake | SDK handles framing, reconnect, error propagation — never hand-roll |
| `createProvider()` factory for CLI | `new OpenRouterAdapter(key)` direct | Factory is the established pattern; already handles all 4 providers |

**No new packages to install.** All required libraries are already in `node_modules`.

---

## Architecture Patterns

### Pattern 1: StdioClientTransport + Client.connect() — The Real Spawn Flow

**What:** `StdioClientTransport` spawns the child process and sets up stdio pipes. `Client.connect(transport)` calls `transport.start()` then immediately sends the MCP `initialize` request and awaits the `initialize` response. This is the entire spawn+handshake flow in one call.

**When to use:** Phase 8 `McpProcessManager.spawn()` replacement.

**How the SDK exposes it:**
```typescript
// Source: node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.d.ts
// Source: node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.d.ts

import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@playwright/mcp@latest'],
  stderr: 'pipe', // or 'inherit' — 'pipe' allows capturing MCP server logs
});

const client = new Client(
  { name: 'mcp-bench', version: '1.0.0' },
  { capabilities: {} }
);

// connect() calls transport.start() then sends initialize + awaits response
// After connect() resolves, client.getServerCapabilities() is populated
await client.connect(transport);

// Health check: if connect() succeeded, initialization succeeded (D-06)
const caps = client.getServerCapabilities();
// caps.tools being present means server supports tools/list and tools/call
```

**Key behaviour (verified from SDK source):**
- `connect()` throws if the subprocess errors during spawn (rejects promise)
- `connect()` sends `initialize` with `LATEST_PROTOCOL_VERSION` and the client `capabilities`
- If initialization fails, `connect()` calls `this.close()` before throwing
- `transport.pid` is available after `start()` is called (i.e., after `connect()`)

### Pattern 2: client.callTool() — The BaseMcpClient Implementation

```typescript
// Source: node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.d.ts

const result = await client.callTool(
  { name: 'browser_navigate', arguments: { url: 'https://example.com' } },
  // second arg defaults to CallToolResultSchema — omit for standard use
);
// result.content is Array<{ type: string; text: string; ... }>
// result.isError is boolean

// Map to BaseMcpClient.ToolResult shape:
return {
  type: result.isError ? 'error' : 'success',
  content: result.content as Array<{ type: string; text: string }>,
  error: result.isError ? String(result.content?.[0]?.text ?? 'tool error') : undefined,
};
```

### Pattern 3: client.listTools() — Used During Initialize for D-06 Capability Check

```typescript
// Source: node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.d.ts
const { tools } = await client.listTools();
// tools: Array<{ name: string; description?: string; inputSchema: {...} }>
// Used to populate assembleSystemPrompt() (Phase 8 annotation in runManager.ts)
```

### Pattern 4: Crash Detection — transport.onclose

After `connect()`, wire `transport.onclose` and `transport.onerror` to update `this.crashed` and `this.crashReason`, then call `transport.close()` in `dispose()`.

```typescript
// After client.connect(transport):
transport.onclose = () => {
  this.crashed = true;
  this.crashReason = `MCP process (${this.mcpId}) closed unexpectedly`;
};
transport.onerror = (err: Error) => {
  this.crashed = true;
  this.crashReason = `MCP process (${this.mcpId}) error: ${err.message}`;
};
```

### Pattern 5: CLI Provider Build — D-08 through D-12

```typescript
// In runHeadless() — replaces createCliProvider():
const providerFlag = args.provider; // e.g. "anthropic"
if (!providerFlag) {
  console.error(
    'Error: --provider is required. Supported: openrouter | openai | azure | anthropic\n' +
    'Required env vars:\n' +
    '  openrouter → OPENROUTER_API_KEY\n  openai → OPENAI_API_KEY\n' +
    '  azure → AZURE_OPENAI_API_KEY + AZURE_OPENAI_ENDPOINT\n  anthropic → ANTHROPIC_API_KEY'
  );
  return 1;
}

// Map "anthropic" CLI flag → "claude" ProviderName (critical — see Pitfall 1)
const providerName = providerFlag === 'anthropic' ? 'claude' : providerFlag;

const config: ProviderConfig = {
  provider: providerName as ProviderName,
  model: args.model, // undefined is fine — provider default applies
};
const provider = await createProvider(config); // throws ProviderConfigError if env var missing
```

### Pattern 6: Loop Detector Call-Site Fix

```typescript
// Before (wrong):
loopDetector.resetStep();
loopDetector.recordAndCheck({
  name: `${mcpId}:${stepResult.canonicalType}`,
  argsString: stepResult.stepText,
});

// After (D-13 through D-16):
if (stepResult.toolCalls.length > 0) {
  for (const toolCall of stepResult.toolCalls) {
    loopDetector.recordAndCheck({
      name: toolCall.toolName,
      argsString: JSON.stringify(toolCall.arguments),
    });
  }
}
loopDetector.resetStep(); // D-14: move resetStep to after all calls are fed

// If LoopError thrown: mark step status as 'aborted' (D-16)
```

### Pattern 7: estimateRun() Pricing Fix — D-17 + D-18

`RunEstimateRequest` must gain `provider` and `model` fields so `estimateRun()` can call `resolvePricing()`. The `RunEstimateRequest` shape is used in the HTTP API body (`/api/runs/estimate`) and in `mcp-bench.ts`, so both call sites must supply these fields.

```typescript
// In runManager.ts:
import { resolvePricing, estimateCostUsd } from '../shared/pricing/resolver';

// estimateRun() — synchronous, no signature change beyond input fields:
const pricing = resolvePricing(input.provider, input.model ?? 'default');
if (!pricing) {
  throw new Error(
    `Unknown pricing for provider "${input.provider}" model "${input.model ?? 'default'}". ` +
    `Check PRICING_TABLE in src/shared/pricing/table.ts.`
  );
}
const estimatedCostUsd = estimateCostUsd(
  estimatedInputTokens,
  estimatedOutputTokens,
  pricing,
);
```

**Note:** `resolvePricing(provider, model)` looks up `"${provider}:${model}"` in `PRICING_TABLE`. The table has `"openai:default"`, `"claude:default"`, etc. as fallbacks when model is `"default"`. Passing `undefined` as model will produce key `"openai:undefined"` which won't match — use `"default"` as the fallback string.

### Anti-Patterns to Avoid
- **Don't call `transport.start()` manually:** `Client.connect(transport)` calls it internally. Double-calling throws "StdioClientTransport already started!"
- **Don't use `process.kill(pid, 0)` for health check:** D-06 requires capability negotiation. The transport `pid` getter is available but the health check is the `connect()` call itself.
- **Don't fall back to step text when toolCalls is empty:** D-15 explicitly forbids fallback.
- **Don't pass `undefined` as model to `resolvePricing()`:** will produce a cache miss. Use `"default"` as the explicit fallback string.
- **Don't map `"anthropic"` directly to `ProviderName`:** `ProviderName` is `"claude"`, not `"anthropic"`. The CLI flag and the type are different strings.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP JSON-RPC framing | Custom readline/newline-delimited JSON parser | `StdioClientTransport` from SDK | Handles partial reads, buffering, message boundary detection |
| MCP `initialize` handshake | Manual `initialize` request/response | `Client.connect(transport)` | Handles protocol version negotiation, capability exchange, error cleanup |
| Process spawn with pipes | `child_process.spawn()` with manual stdio setup | `StdioClientTransport` constructor | Handles platform differences (Windows `windowsHide`), env inheritance, stderr routing |
| Pricing lookup | Arithmetic constants | `resolvePricing()` + `estimateCostUsd()` from `src/shared/pricing/resolver.ts` | Already sync, already tested, handles all 4 providers |
| LLM provider instantiation | `new OpenRouterAdapter(key)` directly | `createProvider(config)` factory | Consistent error messages, env var validation, all 4 adapters |

**Key insight:** All the hand-rolled solutions that existed before Phase 8 are replaced by infrastructure that was already built in earlier phases. Phase 8 is wiring, not building.

---

## Common Pitfalls

### Pitfall 1: "anthropic" vs "claude" — CLI flag vs ProviderName mismatch
**What goes wrong:** CONTEXT.md D-09 specifies the CLI `--provider` flag accepts `anthropic`, but `ProviderName` in `src/shared/llm/types.ts` is `"openrouter" | "azure" | "openai" | "claude"`. Passing `"anthropic"` directly to `createProvider()` will hit the final `throw new ProviderConfigError("Unsupported provider: anthropic")`.
**Why it happens:** The user-facing flag name "anthropic" doesn't match the codebase's internal string "claude" (the adapter was named after the product, not the company).
**How to avoid:** In the CLI's `runHeadless()`, map `"anthropic"` → `"claude"` before constructing `ProviderConfig`. This mapping is a single line and belongs in the CLI layer, not in `createProvider()`.
**Warning signs:** TypeScript won't catch this at compile time because the CLI args are `Record<string, string>`.

### Pitfall 2: StdioClientTransport.connect() vs StdioClientTransport.start()
**What goes wrong:** Calling `transport.start()` then `client.initialize()` separately. The SDK source shows `Client.connect()` calls `super.connect(transport)` which calls `transport.start()`, then sends `initialize`. If `transport.start()` is called before `client.connect()`, the second call throws "StdioClientTransport already started!".
**How to avoid:** Only ever call `client.connect(transport)`. Never call `transport.start()` directly.

### Pitfall 3: McpProcessManager.spawn() now async-throws on bad command
**What goes wrong:** Previously `spawn()` used the stub `node -e 'setInterval()'` which always succeeds. With `StdioClientTransport`, if `npx` is not found or the MCP package doesn't exist on npm, `Client.connect()` rejects. The `try/catch` in `executeMcpRun()` already wraps `processManager.spawn()`, so the run will abort cleanly, but the error message should be surfaced clearly.
**How to avoid:** Ensure `npx` is available (Environment Availability section confirms this). The registry `spawnCommand` uses `["npx", "-y", "...@latest"]` — the `-y` flag skips the "install?" prompt that would block stdin.

### Pitfall 4: `resolvePricing(provider, undefined)` returns null
**What goes wrong:** `RunEstimateRequest` gains `provider` and `model` fields, but callers (HTTP API, CLI) may not pass `model`. If `model` is `undefined`, `resolvePricing("openai", undefined)` looks up `"openai:undefined"` which is not in `PRICING_TABLE` → returns `null` → triggers D-18 error throw.
**How to avoid:** In `estimateRun()`, normalize `model ?? "default"` before calling `resolvePricing()`. `PRICING_TABLE` has `"openai:default"`, `"claude:default"`, `"azure:default"`, `"openrouter:default"` as explicit fallback entries.

### Pitfall 5: LoopDetector.resetStep() call order (D-14)
**What goes wrong:** The current code calls `resetStep()` before `recordAndCheck()`. D-14 moves `resetStep()` to after all tool calls in the step are processed. Calling it before clears state that should persist across the multiple `recordAndCheck()` calls within one step.
**How to avoid:** Move `resetStep()` call to after the `for (const toolCall of stepResult.toolCalls)` loop, not before it.

### Pitfall 6: `McpProcessManager` constructor signature change
**What goes wrong:** Current `McpProcessManager(mcpId: string)` looks up `spawnCommand` from the registry. But `runManager.ts` constructs it as `new McpProcessManager(mcpId)`. If `MCP_REGISTRY[mcpId]` has no `spawnCommand` field (because the registry wasn't updated first), the manager can't spawn.
**How to avoid:** Plan order matters — D-01 (add `spawnCommand` to `MCPServerEntry` and populate registry entries) must precede the `McpProcessManager` rewrite. The constructor should throw early if `spawnCommand` is missing from the registry entry.

---

## Code Examples

### Full McpProcessManager.spawn() replacement sketch

```typescript
// Source: analysis of node_modules/@modelcontextprotocol/sdk/dist/cjs/client/

import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';
import { MCP_REGISTRY } from '../../shared/registry';
import type { BaseMcpClient, ToolResult } from './InstrumentedMcpClient';

export class McpProcessManager implements BaseMcpClient {
  private transport: StdioClientTransport | null = null;
  private client: Client | null = null;
  private mcpId: string;

  public pid: number | null = null;
  public startedAt: Date | null = null;
  public crashed: boolean = false;
  public crashReason: string | null = null;

  constructor(mcpId: string) {
    this.mcpId = mcpId;
  }

  async spawn(): Promise<{ pid: number; startedAt: Date }> {
    if (this.client !== null) {
      throw new Error(`MCP process already running (${this.mcpId})`);
    }

    const entry = MCP_REGISTRY[this.mcpId];
    if (!entry?.spawnCommand?.length) {
      throw new Error(`No spawnCommand in registry for ${this.mcpId}`);
    }

    const [command, ...args] = entry.spawnCommand;
    this.transport = new StdioClientTransport({ command, args, stderr: 'inherit' });
    this.client = new Client({ name: 'mcp-bench', version: '1.0.0' }, { capabilities: {} });

    // Wire crash detection before connect
    this.transport.onclose = () => {
      this.crashed = true;
      this.crashReason = `${this.mcpId} closed`;
    };
    this.transport.onerror = (err: Error) => {
      this.crashed = true;
      this.crashReason = `${this.mcpId}: ${err.message}`;
    };

    await this.client.connect(this.transport); // spawns process + initialize handshake

    this.pid = this.transport.pid ?? null;
    this.startedAt = new Date();
    this.crashed = false;
    return { pid: this.pid!, startedAt: this.startedAt };
  }

  async healthCheck(): Promise<boolean> {
    // D-06: health = successful connect(); if we reach here, it passed
    return this.client !== null && !this.crashed;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.client) throw new Error('MCP client not initialized');
    const result = await this.client.callTool({ name, arguments: args });
    return {
      type: result.isError ? 'error' : 'success',
      content: result.content as Array<{ type: string; text: string }>,
      error: result.isError ? String((result.content as any)?.[0]?.text ?? 'tool error') : undefined,
    };
  }

  async dispose(): Promise<void> {
    try {
      if (this.transport) await this.transport.close();
    } finally {
      this.transport = null;
      this.client = null;
      this.pid = null;
      this.startedAt = null;
    }
  }
}
```

### RunEstimateRequest with provider fields

```typescript
// src/server/runManager.ts — interface extension
export interface RunEstimateRequest {
  baseUrl: string;
  featureText: string;
  selectedMcpIds: string[];
  tokenCap: number;
  provider: string;   // e.g. "openai", "claude", "azure", "openrouter"
  model?: string;     // optional; "default" used as fallback in resolvePricing
}
```

---

## Runtime State Inventory

> Skipped — this is a code/stub replacement phase. No string rename, no database migration, no OS-registered state involved.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `process.kill(pid, 0)` health check | `Client.connect()` capability negotiation | Phase 8 (D-06) | Health check is now protocol-verified, not just process-alive |
| `node -e 'setInterval()'` stub | Real MCP server via `StdioClientTransport` | Phase 8 (EXEC-03) | Actual browser actions execute |
| Hardcoded `$1.5/$6 per 1M` | `resolvePricing(provider, model)` lookup | Phase 8 (D-17) | Accurate per-model cost estimates |
| Gherkin step text as loop fingerprint | MCP tool name + serialized args | Phase 8 (D-13) | Loop detection works correctly across paraphrased steps |

---

## Open Questions

1. **`stop()` method with real transport**
   - What we know: `McpProcessManager.stop(timeoutMs)` currently sends SIGTERM then polls. With `StdioClientTransport`, the transport has a `close()` method that presumably sends SIGTERM internally.
   - What's unclear: Does `transport.close()` respect a timeout? The SDK `close()` is `async` but there's no timeout parameter.
   - Recommendation: Implement `stop()` as `await this.transport.close()` with a manual `setTimeout` SIGKILL fallback on `transport.pid` if `close()` hangs. Keep the existing timeout logic.

2. **`tools/list` call and system prompt population**
   - What we know: Phase 8 annotation in `runManager.ts` says "Phase 8 will populate with real MCP tool capabilities" for `assembleSystemPrompt`. The CONTEXT.md is silent on whether `listTools()` result feeds the system prompt in Phase 8.
   - What's unclear: Is populating `assembleSystemPrompt` with real tools in scope for Phase 8, or deferred?
   - Recommendation: Treat as Claude's Discretion. Call `client.listTools()` after `connect()` and store the result on `McpProcessManager`. Expose it as `getTools()`. The planner can decide whether to wire it into `assembleSystemPrompt` in Phase 8 or defer.

3. **`RunEstimateRequest` API schema change**
   - What we know: Adding `provider` and `model` to `RunEstimateRequest` changes the HTTP `POST /api/runs/estimate` and `POST /api/runs/start` body schemas. The UI (not built yet) calls these endpoints.
   - What's unclear: Should `provider`/`model` be optional in the request (backward-compat) or required?
   - Recommendation: Make them required in the TypeScript interface but handle `null`/`undefined` in `normalizeInput()` by defaulting to `openai` / `default`. This maintains backward-compat for existing tests.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@modelcontextprotocol/sdk` | EXEC-03 McpProcessManager | Yes | 1.28.0 (node_modules) | — |
| `npx` | D-02/D-03 spawnCommand | Yes (npm built-in) | bundled with npm | — |
| Node.js | All | Yes | project runtime | — |

**No missing dependencies.**

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none — scripts.test in package.json: `node ./node_modules/tsx/dist/cli.mjs --test "src/**/*.test.ts"` |
| Quick run command | `npm test -- --test-name-pattern "McpProcessManager"` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXEC-03 | McpProcessManager spawns real process, health-check returns true after connect | unit | `npm test -- --test-name-pattern "McpProcessManager"` | Partial — `McpProcessManager.test.ts` exists but tests stub behavior; needs rewrite for real transport |
| EXEC-03 | McpProcessManager.dispose() closes transport and nulls state | unit | same | Partial |
| EXEC-03 | McpProcessManager.callTool() delegates to client.callTool() | unit (mock transport) | same | No — Wave 0 gap |
| CLI-01 | runHeadless exits 1 when --provider not passed | unit | `npm test -- --test-name-pattern "CLI"` | No — Wave 0 gap |
| INFRA-04 | LoopDetector detects repeated tool name+args | unit | `npm test -- --test-name-pattern "LoopDetector"` | Check `src/shared/harness/LoopDetector.test.ts` |
| INFRA-04 | LoopDetector does NOT trigger on same step text with different tool args | unit | same | No — Wave 0 gap |
| ORCH-07 | estimateRun throws for unknown provider:model | unit | `npm test -- --test-name-pattern "estimateRun"` | No — Wave 0 gap |
| ORCH-07 | estimateRun uses resolvePricing output for cost calc | unit | same | No — Wave 0 gap |

### Sampling Rate
- **Per task commit:** `npm test` (full suite, 105 tests, runs in <10s with tsx)
- **Per wave merge:** `npm test && npx tsc --noEmit`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Update `src/server/mcp/McpProcessManager.test.ts` — existing tests test stub behavior (`node -e 'setInterval()'`); all 6 tests need rewriting for the real `StdioClientTransport`-backed implementation. Use a mock/lightweight MCP server or spy on `Client.connect`.
- [ ] `src/cli/mcp-bench.test.ts` — covers CLI-01: `--provider` required error, `--provider anthropic` maps to `"claude"` ProviderName
- [ ] `src/shared/harness/LoopDetector` test for D-13/D-15: "same tool+args triggers abort; different args do not; empty toolCalls skips check"
- [ ] `src/server/runManager.estimateRun.test.ts` — covers ORCH-07: `resolvePricing` path, unknown model throws D-18 error

---

## Sources

### Primary (HIGH confidence)
- `node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.d.ts` — `Client` class API: `connect()`, `callTool()`, `listTools()`, `getServerCapabilities()`
- `node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.d.ts` — `StdioClientTransport`, `StdioServerParameters`, `pid` getter
- `node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js` — verified `connect()` calls `initialize` internally; `callTool()` and `listTools()` implementations
- `node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.js` — verified `start()` uses `cross-spawn`, platform handling
- `src/server/mcp/McpProcessManager.ts` — current stub to be replaced
- `src/server/mcp/InstrumentedMcpClient.ts` — `BaseMcpClient` interface (target implementation shape)
- `src/shared/registry/types.ts` — `MCPServerEntry` (needs `spawnCommand` field)
- `src/shared/registry/index.ts` — existing entries (needs `spawnCommand` values)
- `src/shared/llm/factory.ts` — `createProvider()` factory, `ProviderName` = `"claude"` not `"anthropic"`
- `src/shared/pricing/resolver.ts` — `resolvePricing()` sync function signature
- `src/shared/pricing/table.ts` — `PRICING_TABLE` with `"provider:default"` fallback keys
- `src/cli/mcp-bench.ts` — `createCliProvider()` mock to replace, existing arg parsing pattern
- `src/server/runManager.ts` lines 128-132, 338-440, 702-743 — hardcoded pricing, stub client, `resolveProviderConfig()`
- `src/server/orchestrator/types.ts` — `StepResult.toolCalls: ToolCallTrace[]` confirmed present with `toolName` and `arguments` fields

### Secondary (MEDIUM confidence)
- `@modelcontextprotocol/sdk` version 1.28.0 — verified from `node_modules/@modelcontextprotocol/sdk/package.json`

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies verified by inspection of installed node_modules
- Architecture: HIGH — patterns derived from installed SDK type definitions and source
- Pitfalls: HIGH — derived from reading actual source code of files to be modified
- Test infrastructure: HIGH — test files and framework verified by inspection

**Research date:** 2026-03-31
**Valid until:** 2026-04-30 (SDK patch releases unlikely to break these APIs; pricing table is static)
