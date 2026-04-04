# Phase 12: mejorar-fiabilidad-seguridad-y-transparencia-del-ejecutor-de-tests-para-qa - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Harden the real test execution path for QA use so benchmark runs are safer to execute, easier to audit, and clearer about when results are trustworthy versus degraded.

This phase focuses on executor reliability, security, and operational transparency in the backend/CLI/UI handoff around run creation, step execution, validation, evidence capture, and persisted audit records. It does not add new benchmark capabilities or new MCP servers.

The workspace copy of `.planning/ROADMAP.md` currently renders through Phase 11 only, but `gsd-tools init phase-op 12` resolves this phase slug and directory successfully. The phase slug is therefore the scope anchor for this context until the roadmap file is refreshed.

</domain>

<decisions>
## Implementation Decisions

### Assertion execution safety
- **D-01:** Replace dynamic assertion execution in `src/server/validation/assertionsRunner.ts` with a strict allowlisted runner. Phase 12 must not execute translated assertions through `new Function(...)` or equivalent arbitrary-code evaluation.
- **D-02:** Only explicitly supported translated assertion patterns may run automatically. Unsupported assertion shapes must be surfaced as non-auditable or review-required outcomes rather than executed dynamically.
- **D-03:** Assertion safety takes priority over assertion coverage. Expanding supported assertions should happen by adding explicit translator/runner mappings, not by widening dynamic execution.

### Evidence and audit trail
- **D-04:** Persist real step-level screenshots rather than the current 1x1 placeholder images in `src/server/runManager.ts`.
- **D-05:** Persist per-tool-call trace metadata alongside step evidence: tool name, arguments, result/error summary, latency, correlation IDs, and any available screenshot references captured by instrumentation.
- **D-06:** Screenshot remains the primary QA evidence artifact. Video or richer session replay is not required for this phase.
- **D-07:** Evidence persistence must survive past in-memory execution. Instrumentation data currently held only in memory by `InstrumentedMcpClient` must be promoted into persisted run records or linked storage so history/export surfaces can audit it later.

### Trust model: blocked vs degraded execution
- **D-08:** The executor may continue in degraded mode when non-fatal audit prerequisites are missing, but the run must be explicitly labeled as degraded or non-auditable in the live UI, persisted history, and exports.
- **D-09:** Degraded mode is the required response when evidence or validation quality is incomplete, for example missing screenshot evidence, unsupported assertion auto-execution, or similar transparency gaps.
- **D-10:** Truly invalid or unsafe starts still hard-block the run, for example malformed request input, unsupported MCP selection, invalid provider configuration, or other conditions where execution would be misleading or impossible.
- **D-11:** The current mix of local aborts, silent fallbacks, and weak log-only signaling should be replaced with an explicit trust-state model that QA can understand without reading server logs.

### Reproducible run configuration
- **D-12:** Provider choice, orchestrator model, and both auditor models must be explicit run inputs in UI and CLI flows rather than silently inferred from environment state.
- **D-13:** The resolved execution configuration must be persisted with each run so QA can reproduce the exact benchmark context later.
- **D-14:** Environment variables may still supply secrets or defaults behind the scenes, but the actual resolved provider/model values used for the run must be visible to the user and stored in the run record.
- **D-15:** The backend should stop auto-detecting provider/model as the source of truth for QA runs. The run payload should carry those decisions explicitly.

### the agent's Discretion
- Exact naming of the trust-state labels (`degraded`, `non-auditable`, etc.) as long as the semantics are explicit and consistent across UI, history, and exports.
- Exact persistence shape for tool-call evidence, as long as it preserves correlation IDs, latency, and screenshot linkage cleanly.
- Whether degraded-state reasons are represented as enum codes, structured arrays, or both.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project and scope anchor
- `.planning/PROJECT.md` — Core value and product constraints: honest, reproducible MCP benchmarking with QA-grade trustworthiness.
- `.planning/REQUIREMENTS.md` — Existing execution, validation, CLI, and history requirements that Phase 12 must harden rather than bypass.
- `.planning/ROADMAP.md` — Current roadmap snapshot; note that the workspace copy renders through Phase 11 even though `gsd-tools init phase-op 12` resolves this phase.

### Existing execution path
- `src/server/runManager.ts` — Primary integration point for run creation, provider resolution, preflight, step tracking, screenshot persistence, and validation wiring.
- `src/server/orchestrator/OrchestratorService.ts` — Step execution loop, token-budget checks, tool-call accumulation, and step result semantics.
- `src/server/orchestrator/types.ts` — Step/tool-call data model currently missing richer instrumented evidence fields.
- `src/server/mcp/McpProcessManager.ts` — Real MCP process lifecycle and tool-call transport.
- `src/server/mcp/preflight.ts` — Current narrow preflight gate; candidate entry point for explicit blocked vs degraded trust semantics.
- `src/server/mcp/stalenessRecovery.ts` — Existing recovery policy for stale references; relevant to executor trust signaling.

### Evidence and persistence
- `src/server/mcp/InstrumentedMcpClient.ts` — In-memory per-tool-call tracing, latency, screenshot correlation, and current evidence capture behavior.
- `src/server/storage/screenshots.ts` — Screenshot persistence primitives and lookup behavior.
- `src/server/storage/sqlite.ts` — Persisted run/step schema; must evolve to store explicit trust state and reproducible config metadata.
- `src/server/api/history.ts` — Export and history surfaces that must expose degraded/non-auditable status and persisted execution config.

### Validation safety
- `src/server/validation/assertionsRunner.ts` — Current dynamic assertion execution via `new Function(...)`; this is the primary security hardening target.
- `src/server/validation/visionValidator.ts` — Existing deterministic validation model and tier semantics; relevant to degraded trust handling.
- `.planning/phases/09-real-vision-llm-validation/09-CONTEXT.md` — Prior decision source for auditor separation, tiering, and review/hallucination semantics.

### UX surfaces affected
- `src/client/App.tsx` — Run-start payload, SSE state, and run-state rendering that must expose explicit provider/model and trust-state information.
- `src/client/components/run/PreRunEstimateModal.tsx` — Pre-run confirmation surface; likely place to show reproducible execution config and trust implications.
- `src/client/components/run/RunScorecard.tsx` — Post-run scorecard that must show degraded/non-auditable labeling and persisted evidence quality.
- `.planning/phases/10-cli-debug-trace-csv-scorecard/10-CONTEXT.md` — Prior auditability decisions for CLI/export trace detail and explicit labels.
- `.planning/phases/11-execution-transparency-and-live-playwright-step-viewer/11-CONTEXT.md` — Prior screenshot-first and suspicious-step transparency decisions for run UI.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `InstrumentedMcpClient` already captures rich tool-call evidence: correlation IDs, latency, status, and optional screenshot IDs. Phase 12 can reuse this rather than inventing a second trace model.
- `screenshots.ts` and SQLite screenshot rows already support durable screenshot storage and linkage by run/step IDs.
- `RunScorecard.tsx` and the existing live-run UI already have places to surface trust badges and evidence completeness without introducing a new route.
- `visionValidator.ts` already models deterministic audit outcomes such as `needsReview` and `hallucinated`; Phase 12 can extend this with run-level trust/degraded status rather than creating a separate vocabulary from scratch.

### Established Patterns
- The project favors explicit audit labels over implicit styling alone. CLI and UI already use strong textual markers like `HALLUCINATED` and `NEEDS_REVIEW`.
- The current backend persists most run facts into SQLite and exposes them through history APIs. Phase 12 should extend that persistence layer rather than leaving new trust/evidence data in logs or memory only.
- Token budget, timeout, loop detection, and stale-ref handling are already treated as first-class execution guardrails. Phase 12 should align with that pattern by making trust-state transitions explicit.

### Integration Points
- `PhaseOneRunManager.createRun()` currently resolves provider/model too implicitly and is the main integration point for explicit reproducible run config.
- `trackStepResult()` in `runManager.ts` is the key place to replace placeholder screenshots and attach persisted evidence/trust metadata to each step.
- `assertionsRunner.ts` is the key security boundary for eliminating arbitrary assertion execution.
- History/export APIs and scorecard rendering are the key places where degraded or non-auditable status must remain visible after the run ends.

</code_context>

<specifics>
## Specific Ideas

- QA-facing runs should prefer trustworthy transparency over silent convenience.
- If a run proceeds without full evidence or with unsupported automatic validation, the product should say so plainly instead of implying a clean audit trail.
- Persisted run metadata should let someone answer: "Which provider and models were used, what evidence was captured, and which parts of this run are safe to trust?"

</specifics>

<deferred>
## Deferred Ideas

- Optional video/session replay artifacts — valid future enhancement, but not required for this hardening phase.
- Broader run analytics extensions beyond trust/evidence hardening — possible future phase, not part of the executor scope here.

</deferred>

---

*Phase: 12-mejorar-fiabilidad-seguridad-y-transparencia-del-ejecutor-de-tests-para-qa*
*Context gathered: 2026-04-04*
