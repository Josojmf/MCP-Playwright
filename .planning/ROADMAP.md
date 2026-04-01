# ROADMAP — MCP Playwright Test Playground

**Core Value:** Honest, reproducible comparison of MCP tool quality for E2E browser automation — exposing which MCPs actually work versus which ones hallucinate their way through tests.

**Granularity:** Standard
**Total v1 Requirements:** 54
**Coverage:** 54/54 mapped — no orphans

---

## Milestone Summary

| Phase | Name | Goal Summary | Requirements | Status |
|-------|------|--------------|--------------|--------|
| 1 | Core Infrastructure & UI Shell | SSE streaming proven end-to-end, safety harness active, Gherkin parser handles all edge cases, basic UI shell up | 13 | Completed |
| 2 | LLM Provider Adapters & MCP Registry | All 4 LLM adapters working, MCP registry with first 2 servers, provider swappable via config only | 12 | Completed |
| 3 | Orchestrator Engine & Single-MCP Run | Full pipeline proven for one MCP: parse → orchestrate → dispatch → stream → save → display | 11 | Completed |
| 4 | Parallel Execution Across Multiple MCPs | All registered MCPs run simultaneously, side-by-side comparison UI, cloud MCP support | 5 | Completed |
| 5 | Screenshot Validation & Scorecard | Full hallucination detection, tiered vision validation, complete scorecard UI, cost dashboard | 10 | Completed |
| 6 | CLI & Export | CI-ready headless CLI, debug mode, run history export, mcp-playwright community server | 5 | Completed |
| 7 | Wire Dead Modules into Execution Path | 5/5 | Complete   | 2026-03-31 |
| 8 | Real MCP Process Protocol & Integration Fixes | Replace stub MCP process with real JSON-RPC stdio communication; fix loop detection and pricing | 4 | Pending |
| 9 | Real Vision LLM Validation | Implement async LLM API call in vision validator; back hallucination detection with real model verdicts | 6 | Completed |
| 10 | CLI Debug Trace & CSV Scorecard | Fix debug tool-call trace output and CSV per-MCP scorecard format | 2 | Pending |

---

## Phases

- [x] **Phase 1: Core Infrastructure & UI Shell** — SSE streaming, safety harness, Gherkin parser, basic UI shell
- [x] **Phase 2: LLM Provider Adapters & MCP Registry** — All 4 LLM adapters, MCP registry, provider-agnostic factory
- [x] **Phase 3: Orchestrator Engine & Single-MCP Run** — Full pipeline end-to-end on one MCP, run history, step UI
- [x] **Phase 4: Parallel Execution Across Multiple MCPs** — Concurrent multi-MCP runs, side-by-side UI, cloud MCPs
- [x] **Phase 5: Screenshot Validation & Scorecard** — Hallucination detection, tiered vision validation, full scorecard
- [x] **Phase 6: CLI & Export** — Headless CLI runner, debug mode, JSON/CSV export
- [x] **Phase 7: Wire Dead Modules into Execution Path** — assembleSystemPrompt, InstrumentedMcpClient, assertionsRunner, stalenessRecovery, TokenBudget wired in (completed 2026-03-31)
- [ ] **Phase 8: Real MCP Process Protocol & Integration Fixes** — Real MCP stdio JSON-RPC, real CLI provider, loop detection fix, pricing fix
- [x] **Phase 9: Real Vision LLM Validation** — Real async vision LLM call, multimodal support, hallucination detection with independent auditor (completed 2026-04-01)
- [ ] **Phase 10: CLI Debug Trace & CSV Scorecard** — Tool call trace in debug mode, per-MCP CSV scorecard format

---

## Phase Details

### Phase 1: Core Infrastructure & UI Shell

**Goal**: SSE streaming works end-to-end, the safety harness (timeout / loop detection / token budget) is in place and tested, the Gherkin parser handles all real-world edge cases (including CRLF on Windows), and the basic UI shell is running with a working scenario editor and MCP selector.

**Why Now**: Nothing else is safe to build until events flow correctly and execution is bounded. A broken SSE layer makes all subsequent debugging invisible. Loop detection and token budget must exist before any LLM or MCP calls are wired in — discovering a runaway loop in Phase 3 means expensive retroactive fixes. CRLF normalization is a silent day-one failure on Windows 11 if skipped.

**Depends on**: Nothing — this is the foundation.

**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, GHERKIN-01, GHERKIN-02, GHERKIN-03, GHERKIN-04, UI-01, UI-02, UI-08, UI-09

**Plans**:
1. **gsd:plan-phase** — Fastify SSE server: `/stream/:runId` endpoint with heartbeat, `X-Accel-Buffering: no` header, client-disconnect abort via `AbortController`, and HTTP/2 enabled for concurrent SSE beyond 6 connections (INFRA-01, INFRA-02)
2. **gsd:plan-phase** — Safety harness: `withTimeout` utility (layered `Promise.race` + `AbortController` at screenshot/LLM/Playwright/step/run tiers), `LoopDetector` (sliding-window fingerprint + per-tool call-count budget), `TokenBudget` class (accumulate, warn at configurable threshold, hard-stop before cap, pre-run cost estimate) (INFRA-03, INFRA-04, INFRA-05, INFRA-06)
3. **gsd:plan-phase** — Gherkin parser service: `@cucumber/gherkin` + `@cucumber/messages`, CRLF→LF normalization before every parse call, `And`/`But` canonical-type resolution from preceding step, `Background` step prepending, `Scenario Outline` expansion to concrete scenarios at parse time (GHERKIN-01, GHERKIN-02, GHERKIN-03, GHERKIN-04)
4. **gsd:ui-phase** — UI shell: React + Tailwind + shadcn/ui project scaffold, dark/light mode, PostHog/Datadog aesthetic, responsive desktop layout (1280px+), scenario editor (base URL input + Gherkin textarea + `.feature` file upload), MCP selector (checkboxes, default all selected) (UI-01, UI-02, UI-08, UI-09)

**Success Criteria** (what must be TRUE when Phase 1 is complete):
1. A browser opening the app can type a Gherkin scenario and base URL into the editor, select MCPs, and see the inputs persist without error.
2. An SSE connection opened to `/stream/:runId` receives heartbeat frames; closing the browser tab aborts the stream server-side with no dangling handles.
3. `withTimeout` wrapping a 60-second mock task aborts at the configured tier limit and surfaces the correct error type — not after the full 60 seconds.
4. `LoopDetector` triggers and marks a run as aborted after N identical tool call fingerprints within the sliding window; per-tool budget catches semantic loops where fingerprints vary slightly.
5. A `.feature` file with Windows CRLF line endings parses identically to the same file with LF endings; `And`/`But` steps resolve to `given`/`when`/`then`; `Background` steps prepend to every scenario; `Scenario Outline` expands to the correct number of concrete scenarios.
6. `TokenBudget` emits a warning event at the configured threshold and hard-stops before the cap, refusing to make another LLM call.

**UAT Checklist**:
- [ ] Load app in browser — scenario editor and MCP selector render correctly in both dark and light mode at 1280px width
- [ ] Paste a multi-scenario `.feature` file with Windows CRLF endings into the editor; verify parser output shows correct step counts with no extra blank steps
- [ ] Upload a `.feature` file via the file upload control; verify it populates the editor
- [ ] Open browser devtools Network tab, connect to SSE endpoint, verify heartbeat frames arrive every ~30s
- [ ] Close the browser tab while SSE is open; verify server log shows clean abort (no "write after end" errors)
- [ ] Run safety-harness unit tests: timeout fires at correct tier, loop detector aborts at correct window threshold, token budget hard-stops correctly

**UI hint**: yes

---

### Phase 2: LLM Provider Adapters & MCP Registry

**Goal**: All four LLM provider adapters (`OpenRouterAdapter`, `AzureOpenAIAdapter`, `OpenAIAdapter`, `ClaudeAdapter`) are implemented and swap-able via config only, the `LLMProvider` interface is finalized, pricing tables are populated with OpenRouter live-fetch at startup, the MCP registry schema is defined, and the first two servers (`@playwright/mcp` and `@modelcontextprotocol/server-puppeteer`) are registered with correct tool namespaces for dynamic system-prompt assembly.

**Why Now**: The `LLMProvider` interface is a hard dependency for the orchestration engine. The MCP registry's tool namespace declarations are a hard dependency for assembling per-MCP system prompts. Both must exist before Phase 3 can wire them together. Doing adapters and registry together avoids a second setup pass.

**Depends on**: Phase 1 (safety harness types used by adapters for timeout/abort; SSE endpoint ready for cost events)

**Requirements**: ORCH-01, ORCH-02, ORCH-03, ORCH-04, ORCH-05, ORCH-06, ORCH-07, ORCH-09, REGISTRY-01, REGISTRY-02, REGISTRY-03, REGISTRY-06, GHERKIN-05

**Plans**:
1. **gsd:plan-phase** — `LLMProvider` interface and types: `LLMRequest`, `LLMResponse`, `LLMChunk`, `LLMUsage` — zero business-logic changes needed to swap providers; `createProvider(config)` factory returns the correct adapter from a config key (ORCH-01, ORCH-06)
2. **gsd:plan-phase** — LLM adapters: `OpenRouterAdapter` (openai SDK + baseURL override, streaming, inline cost extraction), `AzureOpenAIAdapter` (deployment-name routing, apiVersion pin, pricing-table cost), `OpenAIAdapter` (standard API, pricing-table cost), `ClaudeAdapter` (Anthropic SDK directly, flat system-prompt string, alternating-turn enforcement); pricing table + `estimateCost()` + OpenRouter `/api/v1/models` live cache at startup (ORCH-02, ORCH-03, ORCH-04, ORCH-05, ORCH-07)
3. **gsd:plan-phase** — MCP registry: schema definition (tool namespace prefix, transport mode, auth requirements, parallelism model), registry entries for `@playwright/mcp` (ARIA snapshot, `browser_*` prefix, stdio) and `@modelcontextprotocol/server-puppeteer` (CSS selector, `puppeteer_*` prefix, stdio), `REGISTRY-06` enforcement so adding any new server requires only a registry entry; dynamic system-prompt assembly per MCP using declared tool namespace (REGISTRY-01, REGISTRY-02, REGISTRY-03, REGISTRY-06, ORCH-09)
4. **gsd:plan-phase** — Gherkin `Then`-clause assertion translator: translate `Then` steps matching ~10 known patterns (URL, title, visibility, text, count, attribute) into Playwright `expect()` assertion calls; store translated assertions alongside parsed steps for use in Phase 3 validation (GHERKIN-05)

**Success Criteria** (what must be TRUE when Phase 2 is complete):
1. Changing `provider: "openrouter"` to `provider: "azure"` in config (with valid Azure credentials) causes the app to route LLM calls through Azure with no code changes — only config differs.
2. `estimateCost()` returns a non-zero dollar estimate before any run starts, using either the OpenRouter live-model cache or the local pricing table.
3. `createProvider` called with each of the four provider keys returns a correctly typed adapter that satisfies the `LLMProvider` interface; a mock integration test for each adapter passes.
4. The MCP registry returns the `@playwright/mcp` entry with tool namespace `browser_*`; the system-prompt assembly function includes `browser_*` tools and does not mention `puppeteer_*` tools when called for that entry.
5. A `Then I should see the URL "https://example.com"` step produces a Playwright `expect(page).toHaveURL("https://example.com")` assertion call via the translator.

**UAT Checklist**:
- [ ] Set provider to `openrouter` in config; call `createProvider` in a test script; verify the returned adapter has `complete()` and `stream()` methods
- [ ] Set provider to `claude` in config; verify `ClaudeAdapter` is returned and system prompt is placed as a flat string, not a `role: system` message array entry
- [ ] Call `estimateCost()` with a sample token count; verify the dollar figure is non-zero and plausible
- [ ] Request system prompt for `@playwright/mcp`; verify it lists `browser_*` tool names from the registry
- [ ] Request system prompt for `@modelcontextprotocol/server-puppeteer`; verify it lists `puppeteer_*` tool names, not `browser_*`
- [ ] Run Gherkin assertion translator on a `.feature` file with 3 `Then` clauses matching known patterns; verify each produces the expected `expect()` call

---

### Phase 3: Orchestrator Engine & Single-MCP Run

**Goal**: The full pipeline is proven for one MCP — Gherkin parsed, LLM orchestrated step-by-step, MCP tool calls dispatched, screenshots captured, step results streamed over SSE, run saved to local history, and results visible in the UI with a step list and pass/fail status.

**Why Now**: Prove correctness on a single MCP before adding the complexity of parallelism. Isolation bugs, ARIA ref staleness, and pre-flight failures are all far easier to diagnose against one process. A working single-MCP run is the mandatory correctness baseline for Phase 4.

**Depends on**: Phase 1 (SSE, safety harness), Phase 2 (LLM adapters, MCP registry, Gherkin translator)

**Requirements**: ORCH-08, EXEC-01, EXEC-03, EXEC-04, EXEC-05, VALID-01, VALID-02, UI-03, UI-04, HIST-01, HIST-03

**Plans**:
1. **gsd:plan-phase** — `OrchestratorService.runScenario()`: `AsyncGenerator<StepResult>` driving a full Gherkin scenario against one MCP; stateful conversation history maintained across all steps so all prior turns remain in LLM context (ORCH-08, EXEC-01)
2. **gsd:plan-phase** — MCP process lifecycle + pre-flight: spawn MCP process, health-check with PID uniqueness, capability negotiation log; pre-flight check validates Playwright binary version match against MCP's own dependency before any run starts; cleanup on completion and crash; ARIA ref staleness detection (retry with fresh snapshot, not counted as benchmark failure) (EXEC-03, EXEC-04, EXEC-05)
3. **gsd:plan-phase** — `InstrumentedMcpClient` proxy + independent Playwright capture: wraps every MCP tool call; captures screenshot from the platform's own separate Playwright `Page` immediately after each call; stores screenshot with step correlation ID; Playwright `expect()` assertions run independently on `Then` steps using the translated assertion registry from Phase 2 (VALID-01, VALID-02)
4. **gsd:plan-phase** — Run persistence + history UI: all run results saved to SQLite; run history list view shows past runs with summary metrics; clicking a run opens its full step detail; REST endpoint serves run data to the UI (HIST-01, HIST-03)
5. **gsd:ui-phase** — Live run UI: pre-run cost estimate modal with user confirmation (within budget gate), live step-progress view streaming per-MCP step status from SSE (running / passed / failed / needs-review), per-step token count display (UI-03, UI-04)

**Success Criteria** (what must be TRUE when Phase 3 is complete):
1. A user can paste a valid Gherkin scenario, click Run on a single MCP, see each step status update live in the browser as it executes, and the run completes without hanging.
2. The pre-run cost estimate modal appears before execution and requires the user to confirm; a configured token cap prevents the run from starting if the estimate exceeds it.
3. A screenshot is present in the database for every MCP tool call in a completed run.
4. If a `Then` step's Playwright `expect()` assertion fails, the step is marked `failed` in the UI — independently of what the MCP reported.
5. A completed run appears in the run history list with step count, pass rate, and token total; clicking it loads the full step detail view.
6. Triggering an ARIA ref staleness error in `@playwright/mcp` causes a fresh snapshot retry, and the step result reflects the retry outcome — not the stale-ref error.
7. A pre-flight version mismatch between Playwright binaries and the MCP dependency blocks the run with a clear error message before any steps execute.

**UAT Checklist**:
- [ ] Run a 3-step Gherkin scenario against `@playwright/mcp`; verify live step status updates appear in the browser in real time
- [ ] Verify the pre-run cost estimate modal shows a dollar figure before execution begins; set a cap below the estimate and verify the run is blocked with an informative message
- [ ] After run completes, query SQLite for the run; verify screenshot blobs are present for each step
- [ ] Write a Gherkin `Then` step that will definitely fail (wrong expected URL); run it; verify the step is marked `failed` in the UI even if the MCP reports success
- [ ] Find the completed run in the history list; verify summary metrics (step count, pass rate, token total) are present; click to open full detail
- [ ] Manually simulate an ARIA staleness error (or check server logs); verify a retry was attempted and the staleness event is not counted as a benchmark failure in the stored results

**UI hint**: yes

---

### Phase 4: Parallel Execution Across Multiple MCPs

**Goal**: All registered MCPs run the same Gherkin scenario simultaneously in isolated processes; results stream side-by-side in the UI; cloud MCP support (Browserbase) is added with latency instrumentation and session-leak prevention; `mcp-playwright` and `@browserbasehq/mcp` are in the registry.

**Why Now**: Isolation and process-pool management must be validated with at least two concurrent runs before adding the cost and latency of screenshot validation. Adding parallelism after a single-MCP pipeline is proven correct means isolation bugs surface cleanly rather than being masked by validation errors.

**Depends on**: Phase 3 (single-MCP pipeline proven correct and stable)

**Requirements**: EXEC-02, EXEC-06, EXEC-07, REGISTRY-04, REGISTRY-05

**Plans**:
1. **gsd:plan-phase** — Parallel run manager: spawn N concurrent `runScenario()` processes (one isolated process per MCP), lifecycle pool management, per-run PID uniqueness enforcement, all runs wired to the same SSE fan-out so the frontend receives interleaved step events (EXEC-02)
2. **gsd:plan-phase** — Cloud MCP support: registry entries for `mcp-playwright` (ExecuteAutomation, `playwright_*` prefix) and `@browserbasehq/mcp` (Browserbase, cloud, requires API key); `finally`-block session cleanup + startup sweep for orphaned Browserbase sessions; tool-call-sent vs. result-received timestamps stored per step for latency instrumentation (REGISTRY-04, REGISTRY-05, EXEC-06, EXEC-07)
3. **gsd:ui-phase** — Side-by-side comparison UI: parallel MCP comparison panels fed by independent `EventSource` instances, each panel showing live step status for one MCP; cloud latency delta visible as a separate column in the step table (no conflation with MCP execution time)

**Success Criteria** (what must be TRUE when Phase 4 is complete):
1. Starting a run with two MCPs selected causes both processes to begin simultaneously; step events for both MCPs appear in the live view without one blocking the other.
2. Each MCP run has a unique process ID; no shared browser context or session state is detectable between parallel runs (e.g., cookies from run A do not appear in run B's screenshots).
3. A Browserbase run creates a session, executes steps, and closes the session in the `finally` block — even if a step throws an unhandled error mid-run; no orphaned sessions remain after the run ends.
4. The scorecard step table for a Browserbase run shows a latency column with a non-zero "network overhead" delta separate from the MCP execution time.
5. `mcp-playwright` (ExecuteAutomation) completes a basic navigation scenario and its results appear in the side-by-side view alongside `@playwright/mcp`.

**UAT Checklist**:
- [ ] Select two MCPs (`@playwright/mcp` + `@modelcontextprotocol/server-puppeteer`); run the same scenario; verify both panels update live with independent step progress
- [ ] Inspect process list during a parallel run; verify two separate PIDs exist for the two MCP processes
- [ ] Kill one MCP process mid-run; verify the other continues to completion and the killed run is marked as failed/aborted in the UI
- [ ] Run a scenario with `@browserbasehq/mcp` (requires Browserbase API key); verify cloud session is created, steps execute, and session is closed; check Browserbase dashboard for no orphaned sessions
- [ ] Check the latency column in the Browserbase run's step results; verify network overhead delta is reported separately from MCP execution time
- [ ] Verify `mcp-playwright` registry entry resolves with `playwright_*` tool namespace in the system prompt

**UI hint**: yes

---

### Phase 5: Screenshot Validation & Scorecard

**Goal**: The full hallucination detection pipeline is operational — tiered vision LLM validation, `NEEDS_REVIEW` flagging, circular-verdict prevention, deterministic JSON auditor responses; the complete scorecard UI shows per-MCP metrics (pass rate, tokens, cost, latency, hallucination rate), screenshot thumbnails in the live feed, full-res screenshots on demand, suspicious-step visual flags, and the cumulative cost dashboard.

**Why Now**: Validation is expensive in both vision tokens and latency. Building it last means the core run pipeline is stable and token budgets are verified working before adding validation cost on top of every step. Earlier phases have proven the screenshots are being captured correctly (Phase 3), making this purely additive.

**Depends on**: Phase 4 (parallel pipeline stable, all MCPs running, screenshots being captured per step)

**Requirements**: VALID-03, VALID-04, VALID-05, VALID-06, VALID-07, UI-05, UI-06, UI-07, INFRA-07

**Plans**:
1. **gsd:plan-phase** — Vision validation service: `validateStepWithVision()` using the `LLMProvider` interface; `LLMMessage.content` extended to `string | ContentPart[]` for multimodal payloads (handling OpenAI `image_url`, Anthropic `source.type: base64`, and Azure variants); tiered escalation (cheap model at `detail: low` first, escalate to high-accuracy model only when `confidence > 0.8` + verdict `contradicts`); `temperature: 0` + `response_format: json_object` for deterministic auditable verdicts; auditor model always different from orchestration model (VALID-03, VALID-06, VALID-07)
2. **gsd:plan-phase** — Hallucination detection logic: hallucination flag asserted only when `playwrightResult === passed` AND LLM verdict is `contradicts` AND `confidence > 0.7`; steps with `confidence < 0.4` flagged `NEEDS_REVIEW` without auto-escalation; `StepValidation` data model with all six result combinations (`passed/failed` × `matches/contradicts/uncertain`) stored per step (VALID-04, VALID-05)
3. **gsd:plan-phase** — Screenshot delivery: screenshot ID in SSE frame, full-res JPEG served via dedicated REST endpoint (quality 80, ~5x compression vs PNG), 320×200 thumbnail in live feed, endpoint capped to prevent memory pressure; cumulative cost tracker: sum spend across all sessions from SQLite, display on dashboard (INFRA-07)
4. **gsd:ui-phase** — Full scorecard UI: per-MCP metrics table (step pass rate, tokens, cost, latency split MCP-execution vs. network-overhead, hallucination rate), step-by-step replay with screenshot thumbnails, full-res screenshot on click, `NEEDS_REVIEW` visual flag in step rows, suspicious-step divergence callout (Playwright vs. LLM verdict mismatch) (UI-05, UI-06, UI-07)

**Success Criteria** (what must be TRUE when Phase 5 is complete):
1. A step where the MCP reports success but the screenshot shows the page did not change is flagged as `hallucinated: true` in the scorecard — not just as `failed`.
2. Vision validation on a 50-step run does not exhaust the token budget: the tiered approach uses `detail: low` for the majority of steps and escalates for only the subset with high-confidence contradictions.
3. The auditor LLM model key stored in the `StepValidation` record is never the same as the orchestration model key for that run.
4. A step where vision confidence is below 0.4 appears as `NEEDS_REVIEW` in the scorecard with a distinct visual indicator — it is not auto-asserted as hallucinated.
5. Clicking a screenshot thumbnail in the live feed opens the full-res JPEG via the REST endpoint without page reload.
6. The cumulative cost dashboard shows the total dollar spend aggregated across all historical runs, updating after each new run completes.
7. The suspicious-step flag appears for any step where Playwright and the LLM vision verdict disagree, with both verdicts displayed side by side.

**UAT Checklist**:
- [ ] Run a scenario where at least one `Then` step should pass Playwright but the browser DOM is actually in an unexpected state; verify the step is flagged `hallucinated` in the scorecard
- [ ] Run a 10-step scenario; check server logs to confirm only 1-2 steps were escalated to high-accuracy vision validation; verify the rest used the cheap `detail: low` model
- [ ] Inspect `StepValidation` records in SQLite; verify `auditorModel` field is never equal to the run's `orchestratorModel` field
- [ ] Identify a step with a low-confidence vision result; verify it appears as `NEEDS_REVIEW` in the UI and is NOT in the `hallucinated` list
- [ ] Click a screenshot thumbnail in the live feed; verify the full-res JPEG loads via REST endpoint (check network tab for the `/screenshots/:id` request)
- [ ] Complete several runs; open the cumulative cost dashboard; verify the total reflects all historical runs from SQLite
- [ ] Find a step with diverging Playwright/LLM verdicts in the scorecard; verify the suspicious-step flag is visible with both verdict values shown

**UI hint**: yes

---

### Phase 6: CLI & Export

**Goal**: The platform is CI-ready — `npx mcp-bench run` executes a scenario headlessly and outputs structured JSON with correct exit codes; `mcp-bench debug` replays step responses for terminal-based diagnosis; run history is exportable as JSON and CSV; the `mcp-playwright` (ExecuteAutomation) community server is fully integrated (if not completed in Phase 4).

**Why Now**: CLI and export are the delivery mechanism for QA teams using this platform in real workflows. They depend on the full pipeline (Phases 1-5) being stable, and they add no architectural complexity — they are thin consumers of the existing engine.

**Depends on**: Phase 5 (full pipeline including validation and scorecard data model complete)

**Requirements**: CLI-01, CLI-02, CLI-03, HIST-02, REGISTRY-04 (mcp-playwright, if not in Phase 4)

**Plans**:
1. **gsd:plan-phase** — Headless CLI runner: `npx mcp-bench run --url <url> --feature <file.feature>` invokes the same `OrchestratorService.runScenario()` engine without starting the React UI; outputs structured JSON results to stdout; exit code 0 = all MCPs passed all steps, exit code 1 = any failure or hallucination detected (CLI-01, CLI-02)
2. **gsd:plan-phase** — Developer debug mode: `mcp-bench debug --mcp <name>` replays step responses from a stored run, prints MCP tool call trace (tool name, arguments, response, latency) to terminal, highlights steps flagged as hallucinated or needing review (CLI-03)
3. **gsd:plan-phase** — Run history export: REST endpoint + UI button to export a run as full-detail JSON (all steps, screenshots paths, validation results, token costs) and as summary CSV (one row per MCP with scorecard columns); batch export for all runs in a date range (HIST-02)

**Success Criteria** (what must be TRUE when Phase 6 is complete):
1. Running `npx mcp-bench run --url https://example.com --feature smoke.feature` from a terminal with no browser open completes the scenario and writes valid JSON to stdout.
2. When any step fails or is flagged hallucinated, the CLI exits with code 1; when all steps pass, it exits with code 0 — verifiable in a CI pipeline with `echo $?`.
3. Running `mcp-bench debug --mcp playwright` after a completed run prints the full tool call trace to the terminal in a readable format, with hallucinated steps clearly marked.
4. Clicking "Export JSON" on a run in the UI produces a downloadable file containing all step data, validation results, and token costs.
5. Clicking "Export CSV" produces a file with one row per MCP and columns for step pass rate, hallucination count, total tokens, and total cost — importable into a spreadsheet without errors.

**UAT Checklist**:
- [ ] Run CLI command against a local test URL with a known-good feature file; verify JSON output is well-formed and contains step results for each Gherkin step
- [ ] Introduce a deliberate failure in the feature file (wrong expected URL); run CLI; verify exit code is 1
- [ ] Run with all steps passing; verify exit code is 0
- [ ] Run `mcp-bench debug --mcp playwright` after a completed run; verify tool call trace is printed with tool names, arguments, response snippets, and latency values
- [ ] Export a run as JSON from the UI; open the file in a JSON viewer; verify it contains steps, screenshots, validation results, and cost fields
- [ ] Export the same run as CSV; open in a spreadsheet; verify column headers are present and data rows contain numeric values for all scorecard metrics

---

### Phase 7: Wire Dead Modules into Execution Path

**Goal**: All fully-implemented Phase 2/3 modules that exist only as dead code are connected into the live production execution path. No new implementation required — this phase is entirely integration wiring and verification.

**Why Now**: The audit identifies four modules (`assembleSystemPrompt`, `InstrumentedMcpClient`, `assertionsRunner`, `stalenessRecovery`) that are tested in isolation but never called from production code. These are the core anti-hallucination differentiation of this platform. Until they are wired in, screenshots are 1×1 placeholders, Then-step assertions never run, staleness causes step failures, and all MCPs receive an identical generic system prompt.

**Gap Closure:** Closes gaps from v1.0 audit

**Depends on**: Phases 1–6 (all modules already implemented)

**Requirements**: ORCH-09, VALID-01, VALID-02, EXEC-05, INFRA-05

**Plans**:
1. Wire `assembleSystemPrompt(mcpId, tools)` into `OrchestratorService` — replace static inline system prompt string with call to `assembleSystemPrompt` from `src/shared/llm/systemPrompt.ts` (ORCH-09)
2. Instantiate `InstrumentedMcpClient` in `OrchestratorService` — wrap MCP tool calls through `InstrumentedMcpClient`; verify screenshots are captured and stored per step (VALID-01)
3. Call `runAssertion()` for `Then` steps — consume `ParsedStep.assertion` in orchestrator step loop; invoke `assertionsRunner.runAssertion()` after each Then step; propagate result to step status (VALID-02)
4. Import and call `retryWithNewSnapshot()` on stale-ref errors — detect stale-ref error class in execution path; call `stalenessRecovery.retryWithNewSnapshot()`; do not count as benchmark failure (EXEC-05)
5. Call `TokenBudget.checkBudget()` before each LLM request — guard every `provider.complete()` / `provider.stream()` call in `OrchestratorService` with a budget check; abort run if cap would be exceeded (INFRA-05)

**Success Criteria**:
1. A run for `@playwright/mcp` uses a system prompt containing `browser_*` tool names, not the static generic prompt.
2. A screenshot blob is present in SQLite for every MCP tool call in a completed run (not a 1×1 placeholder).
3. A `Then` step whose Playwright assertion fails is marked `failed` in the run results — independently of what the MCP reported.
4. Triggering a stale ARIA ref results in a retry attempt logged in the server output; the step reflects the retry outcome, not the stale-ref error.
5. `TokenBudget.checkBudget()` is called before each LLM request; a run configured below the token estimate is blocked before the first LLM call.

**UAT Checklist**:
- [ ] Run a scenario against `@playwright/mcp`; inspect server log for the assembled system prompt; verify it contains `browser_*` tool names from the registry
- [ ] Complete a run; query SQLite screenshots table; verify all rows contain non-placeholder image data (file size > 100 bytes)
- [ ] Write a `Then` step with a wrong expected URL; run it; verify step is marked `failed` even though MCP did not error
- [ ] Set token cap below run estimate; attempt to start run; verify it is blocked with a budget message before any steps execute

---

### Phase 8: Real MCP Process Protocol & Integration Fixes

**Goal**: The stub MCP process (`node -e 'setInterval()'`) is replaced with real MCP JSON-RPC stdio communication using `@modelcontextprotocol/sdk`. The CLI uses a real LLM provider. Loop detection uses actual tool call fingerprints. Cost estimation uses the live pricing table.

**Why Now**: Phase 7 wires dead modules, but the orchestrator still routes LLM responses as step results with no actual browser actions. This phase makes the execution engine real. It also closes correctness tech-debt in loop detection and pricing that affects result accuracy.

**Gap Closure:** Closes gaps from v1.0 audit

**Depends on**: Phase 7 (execution path wired before replacing the process)

**Requirements**: EXEC-03, CLI-01, INFRA-04, ORCH-07

**Plans:** 2 plans

Plans:
- [x] 08-01-PLAN.md — Registry spawnCommand + McpProcessManager rewrite + wiring into executeMcpRun (EXEC-03)
- [ ] 08-02-PLAN.md — CLI real provider, LoopDetector fingerprint fix, estimateRun pricing fix (CLI-01, INFRA-04, ORCH-07)

**Success Criteria**:
1. Running a Gherkin scenario with `@playwright/mcp` selected causes actual browser actions to execute (navigations visible in a headed browser or in Playwright trace).
2. `npx mcp-bench run` with a valid config invokes the real LLM adapter; the JSON output contains non-synthetic step results.
3. A loop of identical tool calls (same tool name + args repeated N times) triggers `LoopDetector` abort; a loop of varying Gherkin steps with the same tool call does not escape detection.
4. `runManager.estimateRun()` returns a cost figure derived from the adapter's pricing table, not the hardcoded flat rate.

**UAT Checklist**:
- [ ] Run a 2-step Gherkin scenario against `@playwright/mcp` in headed mode; verify the browser window opens and navigates
- [ ] Run `npx mcp-bench run` from CLI with a real OpenRouter API key; verify JSON output contains real LLM-generated step results
- [ ] Inspect server logs for MCP capability negotiation messages on run start
- [ ] Trigger the same tool call 5+ times; verify `LoopDetector` aborts the run before step 10

---

### Phase 9: Real Vision LLM Validation

**Goal**: `validateStepWithVision()` makes a real async LLM API call with the captured screenshot as image payload. Hallucination detection, `NEEDS_REVIEW` flags, and tiered escalation are all backed by real vision model verdicts, not heuristics. Browserbase orphaned-session sweep added.

**Why Now**: Phase 7 wires `InstrumentedMcpClient` so real screenshots exist. Phase 8 makes the MCP process real. This phase completes the anti-hallucination pipeline by making the vision validator call a real LLM.

**Gap Closure:** Closes gaps from v1.0 audit

**Depends on**: Phase 7 (real screenshots captured), Phase 8 (real execution baseline)

**Requirements**: VALID-07, VALID-03, VALID-04, VALID-05, VALID-06, EXEC-07

**Plans**:
1. Implement real vision LLM call in `validateStepWithVision()` — add `imageBuffer: Buffer` parameter; construct multimodal `LLMMessage` with `ContentPart[]`; call `provider.complete()` with `temperature: 0` and `response_format: json_object`; return structured verdict (VALID-07, VALID-03)
2. Wire hallucination and `NEEDS_REVIEW` logic to real verdicts — update `StepValidation` model to store vision LLM response fields; assert hallucination only when Playwright passed + `contradicts` + `confidence > 0.7`; flag `NEEDS_REVIEW` when `confidence < 0.4` (VALID-04, VALID-05)
3. Add auditor model uniqueness check + Browserbase startup sweep — validate at run-start that auditor model key ≠ orchestration model key; add startup sweep for orphaned Browserbase sessions in `McpProcessManager.initialize()` (VALID-06, EXEC-07)
4. Fix runManager implementation divergences — correct inverted call policy (passed steps only), replace single auditorModel with two-tier fields (lowCostAuditorModel + highAccuracyAuditorModel), update model equality guard for both tiers (VALID-03, VALID-04, VALID-05, VALID-06, VALID-07)

**Success Criteria**:
1. `validateStepWithVision()` makes an outbound HTTP request to the vision LLM API (visible in network trace or server log) with a base64-encoded image payload.
2. A step where the screenshot shows the page did not change is flagged `hallucinated: true`; a matching screenshot is flagged `passed`.
3. The `auditorModel` field in `StepValidation` records is never equal to the run's `orchestratorModel` field.
4. A low-confidence vision result appears as `NEEDS_REVIEW` in the scorecard and is NOT in the hallucinated list.
5. No orphaned Browserbase sessions remain after a run that throws mid-execution.

**UAT Checklist**:
- [ ] Run a scenario; check server logs for outbound vision LLM API calls with image payloads
- [ ] Inspect a `StepValidation` SQLite record; verify `verdict`, `confidence`, `auditorModel` fields are populated from a real LLM response
- [ ] Set orchestration model = vision model in config; verify run-start validation blocks with a clear error
- [ ] Identify a step with low confidence in the scorecard; verify it shows `NEEDS_REVIEW` badge, not `hallucinated`

---

### Phase 10: CLI Debug Trace & CSV Scorecard

**Goal**: `mcp-bench debug` prints the full per-step tool call trace (tool name, arguments, response, latency). CSV export produces one row per MCP with scorecard columns. Both confirmed gaps from Phase 06 VERIFICATION.md (score 2/5).

**Why Now**: These are small, independent fixes to the CLI and export layer. All required data already exists in the data model — this is purely a rendering/formatting fix.

**Gap Closure:** Closes gaps from v1.0 audit

**Depends on**: Phase 6 (CLI and export layer already implemented)

**Requirements**: CLI-03, HIST-02

**Plans**:
1. Fix `runDebug()` tool call trace — iterate `step.toolCalls` array; print tool name, arguments (formatted JSON), response snippet, and latency per call; highlight hallucinated/needs-review steps with terminal color (CLI-03)
2. Fix `buildSummaryCsv()` scorecard format — change from per-step or per-run rows to one row per MCP; add columns: `passRate`, `hallucinationCount`, `totalTokens`, `totalCostUsd`; verify importable into Excel/Google Sheets without errors (HIST-02)

**Success Criteria**:
1. `mcp-bench debug --mcp playwright` prints tool name, arguments, response, and latency for every tool call in a stored run.
2. `buildSummaryCsv()` produces a file with one row per MCP and the four scorecard columns present and populated.
3. The CSV opens in Excel/Google Sheets without parse errors.

**UAT Checklist**:
- [ ] Complete a run with 3+ steps; run `mcp-bench debug --mcp playwright`; verify tool name, args, response, and latency appear for each tool call
- [ ] Export a run as CSV; open in a spreadsheet; verify one row per MCP with `passRate`, `hallucinationCount`, `totalTokens`, `totalCostUsd` columns

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Infrastructure & UI Shell | 4/4 | Completed | 2026-03-30 |
| 2. LLM Provider Adapters & MCP Registry | 4/4 | Completed | 2026-03-30 |
| 3. Orchestrator Engine & Single-MCP Run | 5/5 | Completed | 2026-03-30 |
| 4. Parallel Execution Across Multiple MCPs | 3/3 | Completed | 2026-03-30 |
| 5. Screenshot Validation & Scorecard | 4/4 | Completed | 2026-03-30 |
| 6. CLI & Export | 3/3 | Completed | 2026-03-30 |
| 7. Wire Dead Modules into Execution Path | 5/5 | Completed | 2026-03-31 |
| 8. Real MCP Process Protocol & Integration Fixes | 0/4 | Pending | — |
| 9. Real Vision LLM Validation | 3/3 | Completed | 2026-04-01 |
| 10. CLI Debug Trace & CSV Scorecard | 0/2 | Pending | — |

---

## Requirements Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Completed |
| INFRA-02 | Phase 1 | Completed |
| INFRA-03 | Phase 1 | Completed |
| INFRA-04 | Phase 8 | Pending |
| INFRA-05 | Phase 7 | Completed |
| INFRA-06 | Phase 1 | Completed |
| INFRA-07 | Phase 5 | Completed |
| GHERKIN-01 | Phase 1 | Completed |
| GHERKIN-02 | Phase 1 | Completed |
| GHERKIN-03 | Phase 1 | Completed |
| GHERKIN-04 | Phase 1 | Completed |
| GHERKIN-05 | Phase 7 | Pending |
| ORCH-01 | Phase 2 | Completed |
| ORCH-02 | Phase 2 | Completed |
| ORCH-03 | Phase 2 | Completed |
| ORCH-04 | Phase 2 | Completed |
| ORCH-05 | Phase 2 | Completed |
| ORCH-06 | Phase 2 | Completed |
| ORCH-07 | Phase 8 | Pending |
| ORCH-08 | Phase 3 | Completed |
| ORCH-09 | Phase 7 | Pending |
| REGISTRY-01 | Phase 2 | Completed |
| REGISTRY-02 | Phase 2 | Completed |
| REGISTRY-03 | Phase 2 | Completed |
| REGISTRY-04 | Phase 4 | Completed |
| REGISTRY-05 | Phase 4 | Completed |
| REGISTRY-06 | Phase 2 | Completed |
| EXEC-01 | Phase 3 | Completed |
| EXEC-02 | Phase 4 | Completed |
| EXEC-03 | Phase 8 | Pending |
| EXEC-04 | Phase 3 | Completed |
| EXEC-05 | Phase 7 | Pending |
| EXEC-06 | Phase 4 | Completed |
| EXEC-07 | Phase 9 | Completed |
| VALID-01 | Phase 7 | Pending |
| VALID-02 | Phase 7 | Pending |
| VALID-03 | Phase 9 | Completed |
| VALID-04 | Phase 9 | Completed |
| VALID-05 | Phase 9 | Completed |
| VALID-06 | Phase 9 | Completed |
| VALID-07 | Phase 9 | Completed |
| UI-01 | Phase 1 | Completed |
| UI-02 | Phase 1 | Completed |
| UI-03 | Phase 3 | Completed |
| UI-04 | Phase 3 | Completed |
| UI-05 | Phase 5 | Completed |
| UI-06 | Phase 5 | Completed |
| UI-07 | Phase 5 | Completed |
| UI-08 | Phase 1 | Completed |
| UI-09 | Phase 1 | Completed |
| CLI-01 | Phase 8 | Pending |
| CLI-02 | Phase 6 | Completed |
| CLI-03 | Phase 10 | Pending |
| HIST-01 | Phase 3 | Completed |
| HIST-02 | Phase 10 | Pending |
| HIST-03 | Phase 3 | Completed |

**Coverage: 54/54 v1 requirements mapped — no orphans.**

---

*Roadmap created: 2026-03-30*
*Last updated: 2026-03-31 after gap closure phases 7–10 added*

