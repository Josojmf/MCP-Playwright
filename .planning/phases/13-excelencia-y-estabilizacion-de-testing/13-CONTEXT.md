# Phase 13: Excelencia y Estabilizacion de Testing - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Audit the current automated test suite against the real implementation and refactor the testing infrastructure so it becomes more reliable, faster, and easier to diagnose in CI and local development.

This phase may reorganize tests, helpers, and execution lanes when that improves confidence, speed, and maintainability. It does not add new benchmark product capabilities or new MCP targets. The only folded product-adjacent todo is richer per-step failure artifacts when they directly improve test diagnostics.

</domain>

<decisions>
## Implementation Decisions

### Test portfolio policy
- **D-01:** Keep both source-shape contract tests and executable behavioral tests as first-class layers in the suite.
- **D-02:** Reduce weak regex-only guards that assert incidental source text rather than meaningful contracts. Contract tests should protect architectural invariants, required wiring, and non-regression points that are expensive to miss.
- **D-03:** Behavioral and integration tests should carry more of the confidence burden for real execution paths than phase-tagged source inspection tests do today.

### Execution lanes
- **D-04:** Split the suite into a fast default lane and a slower integration or smoke lane.
- **D-05:** The default local and CI lane should stay fast and deterministic so it remains the routine safety check for everyday work.
- **D-06:** Slower tests that exercise real persistence, process lifecycle, richer artifacts, or broader end-to-end flows should move into an explicit secondary lane instead of inflating the default `npm test` path.

### Flakiness strategy
- **D-07:** Prefer deterministic isolation and mocking by default for the majority of tests.
- **D-08:** Keep a small number of real smoke tests for SQLite, filesystem, process lifecycle, or similarly high-risk seams so the suite still validates key integrations against reality.
- **D-09:** When a test is flaky because of timing, shared global state, or ambiguous waits, Phase 13 should favor redesigning the test boundary or fixture strategy over adding loose retries.

### Failure diagnostics
- **D-10:** Add structured failure bundles for the important lanes, including enough context to diagnose failures without re-running locally.
- **D-11:** Failure bundles should emphasize traces, fixture snapshots, stdout or stderr, timing, and other compact audit artifacts before resorting to heavy always-on capture.
- **D-12:** Terminal output should still be improved where useful, but richer diagnostics should live in structured artifacts rather than only in TAP logs.

### Refactor scope
- **D-13:** Phase 13 is allowed to reorganize test files, helpers, fixtures, and scripts when that materially improves clarity, speed, and reliability.
- **D-14:** The reorganization should be driven by execution layers and stable ownership boundaries, not by phase labels alone.

### Folded Todos
- **D-15:** Fold the pending todo `Mostrar screenshot o video por paso` into Phase 13 only as a testing-diagnostics concern. Per-step screenshot or video retention is in scope when it improves failure bundles and post-failure debugging for the slower diagnostic lanes.
- **D-16:** Screenshot-first evidence remains the default. Video is optional and should only be added where it provides clear diagnostic value relative to storage and runtime cost.

### the agent's Discretion
- Exact lane naming and script names as long as the split between default-fast and slower-diagnostic coverage is explicit.
- Exact threshold for moving a test from default lane to slower lanes, as long as determinism and speed are protected.
- Exact artifact packaging format for failure bundles, as long as it is structured and CI-friendly.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope and prior decisions
- `.planning/PROJECT.md` — Core value and product constraints; Phase 13 must harden trustworthiness without adding unrelated benchmark scope.
- `.planning/REQUIREMENTS.md` — Active execution, validation, CLI, UI, and history requirements; test refactors must still protect these behaviors.
- `.planning/ROADMAP.md` — Phase 13 goal, why-now rationale, and success criteria.
- `.planning/STATE.md` — Current project status and recent planning history.
- `.planning/phases/10-cli-debug-trace-csv-scorecard/10-CONTEXT.md` — Prior CLI and export auditability decisions that affect diagnostic expectations.
- `.planning/phases/11-execution-transparency-and-live-playwright-step-viewer/11-CONTEXT.md` — Prior screenshot-first transparency decisions and folded artifact todo history.
- `.planning/phases/12-mejorar-fiabilidad-seguridad-y-transparencia-del-ejecutor-de-tests-para-qa/12-CONTEXT.md` — Trust-state, evidence persistence, and reproducible execution decisions that Phase 13 tests must preserve.

### Current test execution entrypoints
- `package.json` — Current single-lane `npm test` entrypoint and existing script surface.
- `README.md` — Public developer workflow and current documented testing model.

### Core runtime surfaces the suite currently protects
- `src/server/runManager.ts` — Main execution coordinator, trust-state derivation, screenshot persistence, and run lifecycle.
- `src/server/orchestrator/OrchestratorService.ts` — Step execution loop, tool-call flow, token budget handling, and assertion integration.
- `src/server/api/history.ts` — History/export/screenshot APIs that diagnostic and regression tests must continue to validate.
- `src/server/storage/sqlite.ts` — Persistence layer and metadata shape for runs, steps, and evidence.
- `src/server/storage/screenshots.ts` — Screenshot persistence and retrieval behavior that currently has real filesystem coverage.
- `src/cli/mcp-bench.ts` — CLI execution and debug surfaces that may need lane-specific coverage or artifact-aware diagnostics.

### Current test patterns and coverage anchors
- `src/server/runManager.test.ts` — Behavioral tests around request normalization and run configuration.
- `src/server/orchestrator/OrchestratorService.test.ts` — Behavioral coverage for generator semantics, aborts, tool loops, and assertion override behavior.
- `src/server/api/history.test.ts` — Runtime API coverage against persisted run metadata and trust-state output.
- `src/server/storage/sqlite.test.ts` — Real persistence coverage for stored runs and screenshots.
- `src/server/storage/screenshots.test.ts` — Filesystem-backed screenshot storage smoke coverage.
- `src/server/runManager.phase12.evidence.test.ts` — Source-shape contract coverage for Phase 12 trust and evidence invariants; useful reference when pruning or upgrading contract tests.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/server/runManager.test.ts` — Already covers request normalization and provider-model defaults; useful base for expanding behavioral coverage around execution setup.
- `src/server/orchestrator/OrchestratorService.test.ts` — Strong behavioral fixture set for conversation flow, fatal errors, token budget aborts, and live MCP tool loops.
- `src/server/api/history.test.ts` — Real Fastify injection tests already exist and can anchor a slower integration lane with meaningful API assertions.
- `src/server/storage/sqlite.test.ts` and `src/server/storage/screenshots.test.ts` — Existing smoke coverage for real SQLite and filesystem behavior; these are natural candidates for a slower diagnostic lane rather than full removal.
- `src/server/runManager.phase12.evidence.test.ts` and similar `*.phase*.contract.test.ts` files — Existing contract guard pattern for architectural invariants; these should be pruned or strengthened rather than discarded blindly.

### Established Patterns
- Tests are colocated with source modules and currently all run through one script: `node ./node_modules/tsx/dist/cli.mjs --test "src/**/*.test.ts"`.
- The current suite mixes behavioral tests with source-inspection contract tests; both are accepted patterns in the repo today.
- SQLite and screenshot persistence tests use real storage behavior in the default lane, which provides confidence but also sets the pattern for what may move to a slower lane.
- The project already values explicit textual trust markers and auditable outputs, so test diagnostics should follow the same philosophy.

### Integration Points
- `package.json` is the main integration point for introducing separate fast and slow test lanes.
- `src/server/runManager.ts`, `src/server/orchestrator/OrchestratorService.ts`, and `src/server/api/history.ts` are the highest-value modules for reliability and regression coverage.
- Phase 12 trust-state and evidence fields flow through runtime, persistence, API, and UI layers, so any test reorganization must keep those seams covered end to end.

</code_context>

<specifics>
## Specific Ideas

- Current baseline observed during discussion: `npm test` passes with `175` tests in about `2.3s`.
- Current suite composition observed during discussion: `42` test files total, with `19` phase-tagged contract tests and `23` behavioral tests.
- Desired direction:
  - fast default lane for routine work
  - slower integration or smoke lane for real persistence and richer diagnostics
  - keep contract tests, but prune weak regex-only checks that assert incidental implementation text
- Richer per-step artifacts are allowed when they improve failure bundles for diagnostic lanes; they are not a new end-user feature goal by themselves.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 13-excelencia-y-estabilizacion-de-testing*
*Context gathered: 2026-04-04*
