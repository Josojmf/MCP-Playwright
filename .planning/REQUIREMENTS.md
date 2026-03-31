# Requirements: MCP Playwright Test Playground

**Defined:** 2026-03-30
**Core Value:** Honest, reproducible comparison of MCP tool quality for E2E browser automation — exposing which MCPs actually work versus which ones hallucinate their way through tests.

## v1 Requirements

### Infrastructure

- [ ] **INFRA-01**: Fastify SSE endpoint streams step-by-step results to the React UI in real time during a run
- [ ] **INFRA-02**: HTTP/2 enabled on Fastify to handle multiple concurrent SSE connections (>6 MCPs in parallel)
- [ ] **INFRA-03**: `withTimeout` utility enforces layered timeouts (screenshot 5s, LLM API 15s, Playwright action 25s, step 30s, full run 5min)
- [ ] **INFRA-04**: `LoopDetector` aborts an MCP that repeats identical tool calls (sliding-window fingerprint + per-tool call-count budget)
- [ ] **INFRA-05**: `TokenBudget` tracks token spend per run, warns at configurable threshold, hard-stops before exceeding cap
- [ ] **INFRA-06**: Per-run token budget cap configurable by user before execution, with cost estimate shown before run starts
- [ ] **INFRA-07**: Cumulative cost dashboard showing spend across all sessions

### Gherkin Parser

- [ ] **GHERKIN-01**: Gherkin `.feature` file is parsed using `@cucumber/gherkin` with CRLF→LF normalization (Windows safety)
- [ ] **GHERKIN-02**: `And`/`But` step keywords are resolved to canonical type (`given`/`when`/`then`) from preceding step
- [ ] **GHERKIN-03**: `Background` steps are prepended to each scenario automatically
- [ ] **GHERKIN-04**: `Scenario Outline` is expanded to concrete scenarios at parse time
- [ ] **GHERKIN-05**: `Then` clauses are translated into Playwright `expect()` assertion calls where patterns match a known registry (~10 high-value patterns: URL, title, visibility, text, count, attribute)

### LLM Orchestration

- [ ] **ORCH-01**: `LLMProvider` interface with `complete()` and `stream()` methods — zero business-logic changes to swap providers
- [ ] **ORCH-02**: `OpenRouterAdapter` — uses `openai` npm SDK with `baseURL` override, supports streaming, extracts inline cost
- [ ] **ORCH-03**: `AzureOpenAIAdapter` — deployment-name routing, `apiVersion` pin, pricing table for cost tracking
- [ ] **ORCH-04**: `OpenAIAdapter` — standard OpenAI API with pricing table cost tracking
- [ ] **ORCH-05**: `ClaudeAdapter` — uses `@anthropic-ai/sdk` directly; handles system-prompt-as-flat-string, alternating turns
- [ ] **ORCH-06**: `createProvider(config)` factory — provider swapped via config key only, no code changes required
- [ ] **ORCH-07**: Pricing table (`inputPer1MTokens`, `outputPer1MTokens` per model) with OpenRouter `/api/v1/models` cache fetched at startup
- [ ] **ORCH-08**: Stateful conversation history maintained across all steps in a scenario run (prior turns kept for LLM context)
- [x] **ORCH-09**: System prompt dynamically assembled per MCP server using tool namespace declared in registry entry

### MCP Registry

- [ ] **REGISTRY-01**: Pluggable MCP registry schema: each entry declares tool namespace prefix, transport mode, auth requirements, parallelism model
- [ ] **REGISTRY-02**: Registry entry for `@playwright/mcp` (Microsoft) — ARIA snapshot mode, stdio transport
- [ ] **REGISTRY-03**: Registry entry for `@modelcontextprotocol/server-puppeteer` (Anthropic) — CSS selector mode, stdio transport
- [ ] **REGISTRY-04**: Registry entry for `mcp-playwright` (ExecuteAutomation) — CSS selector mode, community server
- [ ] **REGISTRY-05**: Registry entry for `@browserbasehq/mcp` — cloud browser, latency-instrumented
- [ ] **REGISTRY-06**: Adding a new MCP server requires only a registry entry — no core orchestrator changes

### Execution Engine

- [ ] **EXEC-01**: `OrchestratorService.runScenario()` drives a full Gherkin scenario against one MCP as an `AsyncGenerator<StepResult>`
- [ ] **EXEC-02**: All selected MCPs run the same scenario in parallel simultaneously (one isolated process per MCP)
- [ ] **EXEC-03**: MCP process lifecycle: spawn, health-check, cleanup on completion and on crash
- [ ] **EXEC-04**: Pre-flight check before any run: Playwright binary version match, MCP capability negotiation logged
- [ ] **EXEC-05**: ARIA ref staleness handled: detect stale-ref error class, retry with fresh snapshot, not counted as benchmark failure
- [ ] **EXEC-06**: Cloud MCP latency instrumented separately: tool-call-sent timestamp vs. result-received timestamp reported in scorecard
- [ ] **EXEC-07**: Cloud session leak prevention: `finally`-block cleanup + startup sweep for orphaned sessions (Browserbase, Steel)

### Validation & Anti-Hallucination

- [ ] **VALID-01**: `InstrumentedMcpClient` proxy captures screenshot from platform's own independent Playwright `Page` after every MCP tool call
- [ ] **VALID-02**: Playwright `expect()` assertions run independently on `Then` steps using translated assertion registry
- [ ] **VALID-03**: Tiered vision LLM validation: fast cheap model (`detail: low`) first; escalate to high-accuracy model (`detail: high`) only when confidence > 0.8 and verdict is `contradicts`
- [ ] **VALID-04**: Hallucination flag asserted only when: Playwright passed + LLM verdict `contradicts` + confidence > 0.7
- [ ] **VALID-05**: Steps with LLM confidence < 0.4 flagged as `NEEDS_REVIEW` in scorecard (not auto-asserted)
- [ ] **VALID-06**: Auditor LLM model is always different from the orchestration model (no circular verdict)
- [ ] **VALID-07**: Vision validator uses `temperature: 0` and `response_format: json_object` for deterministic auditable verdicts

### UI

- [ ] **UI-01**: Scenario editor: base URL input + Gherkin BDD script textarea (or `.feature` file upload)
- [ ] **UI-02**: MCP selector: checkboxes for all registered MCPs; default all selected
- [ ] **UI-03**: Pre-run cost estimate displayed before execution starts; user confirms within budget
- [ ] **UI-04**: Live run view: per-MCP step progress streams in real time via SSE; each step shows status (running / passed / failed / hallucinated / needs-review)
- [ ] **UI-05**: Full scorecard after run: metrics table (step pass rate, tokens, cost, latency, hallucination rate per MCP) + step-by-step replay with screenshots
- [ ] **UI-06**: Screenshot thumbnails in live feed; full-res on demand via REST endpoint (JPEG compressed)
- [ ] **UI-07**: Suspicious step visual flag in scorecard for human review (LLM vs Playwright verdict divergence)
- [ ] **UI-08**: Technical + polished visual design — dark/light mode, data-dense tables and charts, PostHog/Datadog aesthetic; built with React + Tailwind + shadcn/ui; zero vibe-coded components
- [ ] **UI-09**: Responsive layout for desktop (1280px+ primary target)

### CLI

- [ ] **CLI-01**: Headless CLI runner: `npx mcp-bench run --url <url> --feature <file.feature>` outputs structured JSON results
- [ ] **CLI-02**: CI-compatible exit codes: 0 = all MCPs passed all steps, 1 = any failure or hallucination detected
- [ ] **CLI-03**: Developer debug mode: `mcp-bench debug --mcp <name>` replays step responses, shows MCP tool call trace in terminal

### History & Export

- [ ] **HIST-01**: All run results persisted locally (SQLite) across sessions
- [ ] **HIST-02**: Run results exportable as JSON (full detail) and CSV (scorecard summary)
- [ ] **HIST-03**: Run history view in UI: list of past runs with summary metrics, clickable to full scorecard

## v2 Requirements

### Extended MCP Support

- **EXT-01**: Registry entry for Steel Browser MCP (verify package name before adding)
- **EXT-02**: Registry entry for AgentQL MCP (verify MCP SDK v1 compatibility before adding)
- **EXT-03**: Vision mode support for `@playwright/mcp --vision` (cap step count; compress/resize before LLM injection)

### Benchmark Scenario Library

- **SCEN-01**: Built-in scenario library: basic navigation, form fill, SPA interaction, iframe/shadow DOM, dialog handling, file upload
- **SCEN-02**: Scenario metadata tags (`@shadowdom`, `@iframe`, `@dialog`, `@fileupload`) for capability gap reporting
- **SCEN-03**: Selector loop detection variant: track N failed selector attempts on same Gherkin step (CSS-selector MCP failure pattern)

### Sharing & Collaboration

- **SHARE-01**: Shareable results URL (local deep-link to stored run)
- **SHARE-02**: Batch export: JSON scorecard for multiple runs in one file

### Determinism Scoring

- **DET-01**: Optional 3x run mode: same scenario runs 3 times per MCP; consistency score added to scorecard

## Out of Scope

| Feature | Reason |
|---------|--------|
| Hosting or managing MCP servers | Platform connects to MCPs, does not run their infrastructure |
| Writing Gherkin scripts for the user | Input is always user-provided |
| User auth / multi-user accounts | Single-user local tool for v1 |
| Custom LLM fine-tuning | Not relevant to benchmarking problem |
| Mobile browser automation | Desktop/headless only for v1 |
| Real-time collaboration | Single-user scope |
| Cloud deployment / SaaS | Local-first for v1 |
| Importing from existing test frameworks (Jest, Cypress, etc.) | Gherkin BDD is the only input format for v1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 8 | Pending |
| INFRA-05 | Phase 7 | Pending |
| INFRA-06 | Phase 1 | Pending |
| INFRA-07 | Phase 5 | Pending |
| GHERKIN-01 | Phase 1 | Pending |
| GHERKIN-02 | Phase 1 | Pending |
| GHERKIN-03 | Phase 1 | Pending |
| GHERKIN-04 | Phase 1 | Pending |
| GHERKIN-05 | Phase 7 | Pending |
| ORCH-01 | Phase 2 | Pending |
| ORCH-02 | Phase 2 | Pending |
| ORCH-03 | Phase 2 | Pending |
| ORCH-04 | Phase 2 | Pending |
| ORCH-05 | Phase 2 | Pending |
| ORCH-06 | Phase 2 | Pending |
| ORCH-07 | Phase 8 | Pending |
| ORCH-08 | Phase 3 | Pending |
| ORCH-09 | Phase 7 | Complete |
| REGISTRY-01 | Phase 2 | Pending |
| REGISTRY-02 | Phase 2 | Pending |
| REGISTRY-03 | Phase 2 | Pending |
| REGISTRY-04 | Phase 4 | Pending |
| REGISTRY-05 | Phase 4 | Pending |
| REGISTRY-06 | Phase 2 | Pending |
| EXEC-01 | Phase 3 | Pending |
| EXEC-02 | Phase 4 | Pending |
| EXEC-03 | Phase 8 | Pending |
| EXEC-04 | Phase 3 | Pending |
| EXEC-05 | Phase 7 | Pending |
| EXEC-06 | Phase 4 | Pending |
| EXEC-07 | Phase 9 | Pending |
| VALID-01 | Phase 7 | Pending |
| VALID-02 | Phase 7 | Pending |
| VALID-03 | Phase 9 | Pending |
| VALID-04 | Phase 9 | Pending |
| VALID-05 | Phase 9 | Pending |
| VALID-06 | Phase 9 | Pending |
| VALID-07 | Phase 9 | Pending |
| UI-01 | Phase 1 | Pending |
| UI-02 | Phase 1 | Pending |
| UI-03 | Phase 3 | Pending |
| UI-04 | Phase 3 | Pending |
| UI-05 | Phase 5 | Pending |
| UI-06 | Phase 5 | Pending |
| UI-07 | Phase 5 | Pending |
| UI-08 | Phase 1 | Pending |
| UI-09 | Phase 1 | Pending |
| CLI-01 | Phase 8 | Pending |
| CLI-02 | Phase 6 | Pending |
| CLI-03 | Phase 10 | Pending |
| HIST-01 | Phase 3 | Pending |
| HIST-02 | Phase 10 | Pending |
| HIST-03 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 54 total
- Mapped to phases: 54
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-30*
*Last updated: 2026-03-31 after gap closure phases 7–10 added; traceability reassigned for 17 requirements*
