# Project Research Summary

**Project:** MCP Playwright Test Playground
**Domain:** Browser automation benchmarking platform with LLM orchestration
**Researched:** 2026-03-30
**Confidence:** MEDIUM-HIGH (training knowledge through Aug 2025; no live web access during research; all critical fields flagged for live verification before building)

---

## Executive Summary

This project is a specialized benchmarking harness, not a general test framework. Its core job is to drive multiple MCP browser automation servers through identical Gherkin BDD scenarios in parallel, then score them against each other using a dual-layer validation strategy: ground-truth Playwright assertions plus screenshot-based LLM hallucination detection. The most important architectural insight from the research is that the system has two entirely separate Playwright layers — the MCP servers under test use Playwright internally, and the benchmark platform runs its own independent Playwright instance to capture screenshots and run assertions. These must never share state.

The recommended implementation path centers on a thin custom LLM adapter pattern (not Vercel AI SDK or LangChain) wired to OpenRouter by default, with one concrete adapter per provider swappable via config. The MCP registry cannot assume uniform tool naming across servers — each of the six candidate servers uses a different prefix (`browser_*`, `puppeteer_*`, `playwright_*`, `browserbase_*`, `agentql_*`) — so the system prompt fed to the orchestrating LLM must be dynamically assembled per MCP. The platform's own execution safety harness (loop detector, step timeouts, token budget) must be built before any external calls are wired in, or runaway costs and hung processes will make the platform unusable during development.

The most significant risks are cost amplification and hallucination measurement validity. Screenshot validation via a vision LLM at `detail: high` costs roughly 1,100 tokens per screenshot; a 50-step scenario costs ~55,000 validation tokens on top of orchestration tokens. This makes tiered escalation (cheap model first, expensive model only on suspected contradictions) mandatory for any meaningful volume. The hallucination detection model itself must not be the same model driving the MCP session, or verdicts will be circular. On the implementation side, the project runs on Windows 11 and CRLF in `.feature` files will silently corrupt the Gherkin tokenizer — source normalization must happen before every parse call.

---

## Key Findings

### MCP Server Landscape

See full detail in `.planning/research/mcp-servers.md`.

**Recommended registry order (priority for initial implementation):**

1. `@playwright/mcp` (Microsoft) — The reference target. ARIA snapshot mode is the most LLM-reliable interaction paradigm (unambiguous element refs vs. guessed CSS selectors). Supports headless CI. Tool prefix: `browser_*`. HIGH confidence.
2. `@modelcontextprotocol/server-puppeteer` (Anthropic) — Official reference server. CSS-selector based (more fragile, useful as baseline comparison). Tool prefix: `puppeteer_*`. HIGH confidence.
3. `mcp-playwright` (ExecuteAutomation) — Popular community package, also CSS-selector based. Represents what many users have already tried. Tool prefix: `playwright_*`. MEDIUM confidence.
4. `@browserbasehq/mcp` (Browserbase) — Cloud browser; adds 100-400ms latency per tool call. Requires API key. Tests cloud-vs-local performance gap. MEDIUM confidence.
5. Steel Browser MCP — Cloud + self-hosted option; lower MCP integration maturity. Exact package name needs live verification. MEDIUM confidence.
6. AgentQL MCP — Natural-language element resolution, distinct paradigm. Requires second API key. LOW confidence on current package name/schema.

**Critical paradigm split the registry must handle:**

| Paradigm | Servers | LLM Reliability |
|----------|---------|-----------------|
| ARIA snapshot + element refs | @playwright/mcp | High — refs are unambiguous |
| CSS/XPath selector generation | Puppeteer MCP, mcp-playwright | Low — LLM hallucinates selectors |
| Cloud proxy | Browserbase, Steel | Depends on underlying engine |
| Natural-language query | AgentQL | Medium-high but opaque failures |

**Session isolation rule:** One process (or cloud session) per parallel run, no exceptions. `@playwright/mcp` in stdio mode uses a single browser context for the whole process. Shared contexts cause state bleed between benchmark runs and invalidate results.

---

### LLM Orchestration

See full detail in `.planning/research/orchestration.md`.

**Stack decisions (all HIGH confidence):**

- **LLM abstraction:** Custom adapter pattern. Define `LLMProvider` interface with `complete()` and `stream()` methods; implement `OpenRouterAdapter`, `AzureOpenAIAdapter`, `OpenAIAdapter`, `ClaudeAdapter`. Zero business-logic code changes to swap providers — config-only switch.
- **OpenRouter integration:** Use the `openai` npm package with `baseURL: 'https://openrouter.ai/api/v1'`. OpenRouter is wire-compatible with the OpenAI REST API.
- **Anthropic Claude adapter:** Use `@anthropic-ai/sdk` directly (not via OpenRouter proxy) to avoid cost markup and get cleaner error messages. System prompt must be a flat string (not a `role: system` array entry); turns must strictly alternate user/assistant.
- **Do not use Vercel AI SDK or LangChain.js.** Both impose wrong-runtime optimizations (Next.js RSC/edge for AI SDK) or massive transitive overhead (LangChain). The thin adapter pattern is ~200 lines and gives exact control over token/cost data, which the benchmark scorecard needs.
- **Gherkin parser:** `@cucumber/gherkin` v28+ with `@cucumber/messages`. The only credible option. Always normalize CRLF to LF before parsing (`source.replace(/\r\n/g, '\n')`).
- **`And`/`But` step resolution:** Must be done manually — the parser returns raw keyword; the orchestrator must track and propagate canonical type (`given`/`when`/`then`) from the preceding non-And/But step.
- **Scenario Outline expansion:** Expand at parse time into flat concrete scenarios. The orchestrator should see only concrete step lists, never templates.
- **Background step prepending:** `@cucumber/gherkin` does NOT prepend background steps to scenario lists. The parser consumer must do this explicitly.

**Cost tracking architecture:**

- Azure and OpenAI do not return cost inline. Maintain a pricing table (`inputPer1MTokens`, `outputPer1MTokens` keyed by model name).
- OpenRouter returns cost inline; exact field name on the `usage` object (`total_cost` or similar) must be verified against current docs — this has changed historically.
- For streaming responses, use `stream_options: { include_usage: true }` to get token counts in the final chunk. Fall back to char/4 estimation only when the field is absent.
- Fetch current pricing from OpenRouter's `/api/v1/models` endpoint at startup and cache it rather than hardcoding values that will go stale.

---

### Validation and Real-time Streaming

See full detail in `.planning/research/validation-realtime.md`.

**Transport: SSE, not WebSocket (HIGH confidence).** The data flow is purely server-push during a test run. SSE over `reply.raw` in Fastify requires no plugins, has native browser reconnect, and is trivially compatible with HTTP proxies. For more than 6 concurrent runs, enable HTTP/2 on Fastify (`http2: true`) to bypass the browser's 6-connection-per-origin limit for EventSource.

**Screenshot capture strategy (HIGH confidence):** Wrap every MCP tool call in a proxy (`InstrumentedMcpClient`) that captures a screenshot from the platform's own Playwright `Page` reference immediately after each call completes. This is framework-agnostic, correlates screenshots to tool calls precisely, and handles failures non-fatally. Do not use Playwright reporter hooks — they only work for `@playwright/test`-driven tests, not raw MCP sessions.

**Hallucination detection (dual-layer validation):**

The most valuable detection case is `Playwright passed + LLM verdict contradicts`: the MCP server claimed success but the screenshot shows the browser never changed state. This is the canonical AI hallucination in MCP reporting.

Tiered escalation to control cost:
1. Fast cheap model (Gemini Flash or GPT-4o-mini) at `detail: low` (85 tokens/image) for all steps.
2. Escalate to high-accuracy model (Claude Sonnet or Gemini Pro) at `detail: high` (~1,105 tokens/image for 1280×720) only when fast-model confidence > 0.8 and verdict is `contradicts`.
3. Steps where fast-model confidence < 0.4 are flagged `NEEDS_REVIEW`, not auto-escalated.

This tiered approach cuts validation cost by ~70% while maintaining accuracy on high-confidence contradiction cases.

**Safety harness (all HIGH confidence):**

- `LoopDetector`: sliding-window fingerprint detector (default: 3 identical calls in last 10 = loop). Supplement with per-tool call-count budget (max 20 calls/tool) to catch semantic loops where args vary slightly.
- `withTimeout`: `Promise.race` + `AbortController`. Layered: screenshot capture (5s) < LLM API (15s) < Playwright action (25s) < step (30s) < full run (5 min).
- `TokenBudget`: accumulate from `usage.total_tokens` after each LLM call; check before each call; emit warning at configurable threshold (e.g., 80% of max). Pre-call reject if prompt alone would exceed per-step limit using tiktoken estimation.

**Large screenshots over SSE:** Send a screenshot ID in the SSE frame and serve the full image via a separate REST endpoint. JPEG at quality 80 reduces size ~5x vs PNG. Only send thumbnails (320×200) in the live feed; full-res on demand.

---

## Critical Risks

1. **Hallucination detection is itself vulnerable to hallucination.** The vision LLM auditing screenshots can itself produce wrong verdicts. Use `temperature: 0`, `response_format: json_object`, and require `confidence` field with a minimum threshold (0.7+) before asserting `hallucinated: true`. Never use the same model that drove the MCP session as the auditor.

2. **Non-standardized MCP tool names break the orchestrator prompt.** The system prompt that tells the LLM which tools to call must be dynamically constructed per MCP server. Hardcoding `browser_*` tool names in the prompt means Puppeteer MCP (which uses `puppeteer_*`) will fail silently — the LLM will call tools that don't exist and not understand the error. The registry entry for each MCP must declare its tool namespace.

3. **ARIA ref staleness causes false MCP failures.** In `@playwright/mcp`, element refs returned by `browser_snapshot` are invalidated by any DOM mutation. If the LLM uses a ref from a stale snapshot, the click fails with an opaque error. The orchestrator must detect this error class and retry with a fresh snapshot, not count it as a benchmark failure.

4. **Cloud MCP latency inflates benchmark timing.** Browserbase/Steel add 100-500ms of network latency per tool call — pure overhead, not a quality measurement. The scorecard must separate "MCP execution time" from "network latency overhead" by timestamping at the orchestrator layer (tool call sent vs. result received).

5. **Vision mode token explosion.** `@playwright/mcp --vision` mode embeds base64 PNGs in LLM context. A 1280×720 screenshot is ~100-300KB of base64. A 20-step vision-mode scenario can exhaust a 128K context window from screenshots alone. Cap vision-mode runs to a lower step count and compress/resize before injecting into LLM context.

6. **Cloud session leaks (Browserbase, Steel).** If the orchestrator crashes between `create_session` and `close_session`, the paid session stays open. Implement `finally`-block cleanup with a session registry and a startup sweep for orphaned sessions.

7. **CRLF corruption on Windows.** This project runs on Windows 11. Feature files saved with CRLF will produce silent tokenizer failures in `@cucumber/gherkin`. Normalize every source string before parsing. This is a day-one bug if not handled.

8. **Playwright binary version mismatch.** `@playwright/mcp` requires matching Playwright browser binaries. A version mismatch produces cryptic errors that look like MCP failures. Run a pre-flight check (`npx playwright --version` vs. `@playwright/mcp` package.json dependency) before any benchmarked run.

---

## Implications for Roadmap

### Phase 1: Core Infrastructure — Transport, Safety Harness, and Gherkin Parsing

**Rationale:** Everything else depends on events flowing correctly and execution being safe. No LLM calls, no MCP connections, no screenshots until SSE works end-to-end and the safety harness is in place. CRLF normalization goes here too — it must be day-one.

**Delivers:**
- Fastify SSE endpoint (`/stream/:runId`) with heartbeat, nginx header, and client-disconnect abort
- React `useTestStream` hook + Zustand store (`immer` middleware for parallel run state)
- `withTimeout` utility (per-step + per-run `AbortController`)
- `LoopDetector` (fingerprint window + per-tool budget)
- `TokenBudget` class (accumulate, warn, hard stop)
- Gherkin parser service (`@cucumber/gherkin` + `@cucumber/messages`): CRLF normalization, `And`/`But` canonical resolution, Background prepending, Scenario Outline expansion, tag stripping
- Feature file upload or inline editor in the UI

**Avoids:** Runaway costs, hung processes, CRLF parse failures, state bleed between runs.

**Research flag:** Standard patterns — no additional research needed. SSE, AbortController, and `@cucumber/gherkin` are well-documented. Verify `@cucumber/gherkin` current version on npm before pinning.

---

### Phase 2: LLM Provider Adapter + MCP Registry Foundation

**Rationale:** The `LLMProvider` interface must exist before the MCP dispatch layer can be built, because the orchestrator needs a provider to interpret each Gherkin step into a tool call. The MCP registry must declare tool namespaces before the system prompt can be assembled dynamically.

**Delivers:**
- `LLMProvider` interface and `LLMRequest`/`LLMResponse`/`LLMChunk`/`LLMUsage` types
- `OpenRouterAdapter` (openai SDK, baseURL override, streaming, inline cost)
- `AzureOpenAIAdapter` (deployment-not-model routing, apiVersion pin)
- `OpenAIAdapter`
- `ClaudeAdapter` (system-prompt separation, alternating-turn enforcement)
- `createProvider` factory (config-only provider swap)
- Pricing table + `estimateCost()` function + OpenRouter `/api/v1/models` cache at startup
- MCP registry: metadata schema (tool namespace, transport mode, parallelism model, auth requirements)
- Registry entries for `@playwright/mcp` and `@modelcontextprotocol/server-puppeteer` as initial targets
- Dynamic system prompt assembly per MCP (injects correct tool names from registry)

**Avoids:** Tool name hardcoding, cost tracking blind spots, leaky provider SDK types.

**Research flag:** Verify OpenRouter cost field name (`total_cost` vs. other) and streaming cost endpoint (`/api/v1/generation?id={id}`) against live docs before implementing cost tracking. Verify Azure `apiVersion` current recommended stable value.

---

### Phase 3: Orchestrator Engine + Single-MCP End-to-End Run

**Rationale:** Wire the safe harness (Phase 1) and the LLM/MCP layer (Phase 2) together for a single MCP run. Prove the full pipeline — parse Gherkin, orchestrate LLM, dispatch MCP tool calls, stream step results — before adding parallelism or validation.

**Delivers:**
- `OrchestratorService.runScenario()` as an `AsyncGenerator<StepResult>`
- Stateful conversation history (all prior assistant turns kept for context)
- `InstrumentedMcpClient` proxy (wraps every MCP tool call, captures screenshot post-call)
- Screenshot pipeline: platform Playwright `Page` instance separate from MCP's internal browser
- MCP process lifecycle management: spawn/connect, health-check PID uniqueness, cleanup on completion
- Pre-flight check: Playwright binary version match, MCP capability negotiation log
- Run results stored in backend (SQLite or in-memory for v1), accessible via REST
- Basic run status UI (step list, per-step pass/fail, token count)

**Avoids:** ARIA ref staleness (retry-on-stale-ref logic here), dialog blocking (auto-handle dialog on timeout), binary version mismatch (pre-flight gate).

**Research flag:** Verify `@playwright/mcp` HTTP/SSE server mode session isolation behavior — critical to know before building the parallel execution model in Phase 4.

---

### Phase 4: Parallel Execution Across Multiple MCPs

**Rationale:** Once a single run is proven correct, add parallelism. The isolation model, process management, and SSE multiplexing need to be tested with at least two MCPs running concurrently before adding validation cost.

**Delivers:**
- Run manager: spawn N concurrent runs (one process per MCP), manage lifecycle pool
- HTTP/2 on Fastify for SSE (eliminates 6-connection browser limit at scale)
- Parallel results view in React: side-by-side MCP comparison panels fed by independent `EventSource` instances (or single-endpoint fan-out if HTTP/2 not available)
- Per-run isolation enforcement (verify unique PID per MCP process)
- Cloud MCP support: Browserbase session create/close with `finally`-block leak prevention, latency timestamp instrumentation (tool-call-sent vs. result-received delta in scorecard)
- Registry entries for `mcp-playwright` (ExecuteAutomation) and `@browserbasehq/mcp`

**Avoids:** State bleed between parallel runs, cloud session leaks, misleading wall-clock comparisons for cloud MCPs.

**Research flag:** Verify `@browserbasehq/mcp` transport mode (stdio or HTTP-only) before implementing process spawn strategy.

---

### Phase 5: Screenshot Validation and Hallucination Detection

**Rationale:** Validation is expensive (vision tokens) and adds latency. It must not be added until the core run pipeline is stable and cost controls (Phase 1 token budget) are verified working. Build cheapest tier first.

**Delivers:**
- `validateStepWithVision()` service using the `LLMProvider` interface (vision-capable model required)
- `LLMMessage.content` type extended to `string | ContentPart[]` for multimodal payloads
- Tiered escalation: cheap fast model first (`detail: low`), escalate to high-accuracy on `confidence > 0.8` + `contradicts`
- `StepValidation` data model with all six result combinations (`passed/failed` × `matches/contradicts/uncertain`)
- Hallucination flag: only asserted when `contradicts` + `playwrightResult === passed` + `confidence > 0.7`
- Screenshot delivery optimization: ID in SSE frame, full image via REST, JPEG compression, thumbnail in live feed
- Scorecard: per-MCP hallucination rate, step pass rate, token cost, latency (split MCP execution vs. network overhead), screenshot gallery per run

**Avoids:** Vision token explosion (tiering + `detail: low` default), circular verdicts (auditor model != orchestration model), small-element misidentification (flag LLM validation as not suitable for pixel-level assertions).

**Research flag:** Verify multimodal `ContentPart[]` message format for each provider (OpenAI, Anthropic, Azure) — format differs across providers and the `LLMMessage` type needs to handle all of them. Verify current vision model IDs and pricing on OpenRouter before committing to default model choices.

---

### Phase 6: Extended MCP Registry + Benchmark Scenarios Library

**Rationale:** With the full pipeline proven, add remaining MCPs and build a scenario library that exercises each paradigm difference (ARIA vs. selector, shadow DOM, iframes, dialogs, file upload).

**Delivers:**
- Registry entries for Steel Browser MCP and AgentQL MCP (after verifying current package names)
- Benchmark scenario categories: basic navigation, form fill, SPA interaction, iframe/shadow DOM, dialog handling, file upload
- Scenario metadata tags: `@shadowdom`, `@iframe`, `@dialog`, `@fileupload` — used to flag scenarios that expose specific MCP capability gaps
- Selector loop detection variant: track "N failed selector attempts on the same Gherkin step" as distinct loop pattern (relevant for CSS-selector-based MCPs)
- Export: JSON scorecard export per run batch, shareable results URL

**Research flag:** Verify Steel MCP current package name and tool schema on npm/GitHub. Verify AgentQL MCP current version and whether it has been updated to MCP SDK 1.x.

---

### Phase Ordering Rationale

- SSE before MCP because broken streaming makes all subsequent debugging harder — you need the live feed from day one.
- Safety harness before LLM calls because runaway loops and hung steps are expensive to debug retroactively.
- Single-MCP pipeline before parallelism because isolation bugs become invisible at scale.
- Validation last because it adds cost and latency that would slow every earlier phase's iteration cycle.
- CRLF normalization is in Phase 1 explicitly because the project runs on Windows 11 and this is a silent failure mode.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| LLM adapter pattern | HIGH | Interface shape and all four adapters are well-specified. OpenRouter cost field name needs live verification. |
| Gherkin parsing | HIGH | `@cucumber/gherkin` is canonical. All gotchas (CRLF, And/But, Background, Outline expansion, tag prefix) are well-documented. |
| SSE implementation | HIGH | `reply.raw` pattern in Fastify is documented. `X-Accel-Buffering` requirement is well-known. |
| Safety harness | HIGH | `AbortController`, `Promise.race`, loop detection are standard algorithms. |
| MCP server tool schemas | HIGH for @playwright/mcp and @modelcontextprotocol/server-puppeteer; MEDIUM for community and cloud servers | Tool names for official servers are well-documented. Community servers may have drifted. Steel exact package name unverified. |
| Screenshot validation strategy | HIGH for approach; MEDIUM for vision model IDs/pricing | Proxy-wrapper capture approach is solid. Vision model availability and pricing on OpenRouter change frequently. |
| Token budget / cost tracking | MEDIUM | Pricing table values will go stale. OpenRouter inline cost field name has changed historically. |
| Parallelism model | MEDIUM | @playwright/mcp HTTP/SSE server session isolation behavior needs live verification before building Phase 4. |

**Overall confidence:** MEDIUM-HIGH

---

### Gaps to Address Before or During Building

1. **OpenRouter cost field name** (LOW confidence): Exact field on `usage` object. Check `https://openrouter.ai/docs/api-reference/overview` before implementing cost tracking. Field has been `total_cost`, `x-openrouter-cost`, and others historically.

2. **OpenRouter streaming cost endpoint** (MEDIUM confidence): Whether `/api/v1/generation?id={id}` is still the correct follow-up endpoint for streaming usage. Verify before implementing streaming cost accumulation.

3. **Azure OpenAI `apiVersion`** (MEDIUM confidence): `2024-02-01` may not be the current recommended stable version. Check Azure OpenAI release notes.

4. **@playwright/mcp HTTP/SSE server session isolation** (CRITICAL for Phase 4): Does HTTP/SSE server mode provide isolated browser contexts per connection, or does it share state? This determines whether Phase 4 can use a shared server process or must spawn one process per run.

5. **@browserbasehq/mcp transport mode**: Does it support stdio or only HTTP? This affects how the platform spawns it in Phase 4.

6. **Steel Browser MCP current package name**: May have changed since training cutoff. Verify before Phase 6.

7. **Vision multimodal message format per provider**: `LLMMessage.content` must be extended to `string | ContentPart[]`. The exact `ContentPart` shape differs between OpenAI (`image_url`), Anthropic (`image` with `source.type: base64`), and Azure. Verify each before Phase 5 implementation.

8. **`@cucumber/gherkin` current version**: v28 was current at training cutoff. Run `npm info @cucumber/gherkin version` to confirm before pinning.

9. **`include_usage` in streaming on OpenRouter** (MEDIUM confidence): Not all models routed through OpenRouter return usage in the streaming final chunk. Make the vision validation call non-streaming (max_tokens ~512 and short) to guarantee usage availability.

---

## Sources

### Primary (HIGH confidence)
- `https://github.com/microsoft/playwright-mcp` — @playwright/mcp tool catalog, configuration flags, transport modes
- `https://github.com/modelcontextprotocol/servers` — @modelcontextprotocol/server-puppeteer reference implementation
- OpenAI Node.js SDK (`openai` npm) — adapter pattern, streaming, `AzureOpenAI` class
- `@anthropic-ai/sdk` — Claude adapter system message handling, streaming events
- `@cucumber/gherkin` / `@cucumber/messages` — parser API, AST shape, dialect handling
- Fastify documentation — `reply.raw` SSE pattern, `http2` option
- Node.js `AbortController` / `Promise.race` — timeout and cancellation patterns

### Secondary (MEDIUM confidence)
- `https://github.com/browserbase/mcp-server-browserbase` — Browserbase MCP tool catalog (may have evolved)
- `https://openrouter.ai/docs` (training-time snapshot) — cost field, streaming generation endpoint
- `https://openrouter.ai/api/v1/models` — model pricing (verify at runtime; changes frequently)
- `https://github.com/executeautomation/mcp-playwright` — community mcp-playwright tool catalog
- Playwright `page.screenshot()` and timeout options — screenshot capture approach, vision mode token formulas

### Tertiary (LOW confidence — verify before building)
- Steel Browser MCP (`https://github.com/steel-dev/steel-browser`) — package name and tool schema need verification
- AgentQL MCP (`https://github.com/tinyfish-io/agentql-mcp`) — tool schema and MCP SDK version need verification
- OpenRouter cost field name — historical values `total_cost`, `x-openrouter-cost`; current name needs live check
- Azure `apiVersion` `2024-02-01` — may not be current recommended version

---

*Research completed: 2026-03-30*
*Ready for roadmap: yes*
