# Phase 13: Excelencia y Estabilizacion de Testing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-04
**Phase:** 13-excelencia-y-estabilizacion-de-testing
**Areas discussed:** pending todo, test portfolio policy, execution lanes, flakiness strategy, failure diagnostics, refactor scope

---

## Pending todo

| Option | Description | Selected |
|--------|-------------|----------|
| Defer it again | Keep Phase 13 focused strictly on test infrastructure, not artifact expansion | |
| Fold it into Phase 13 | Include richer per-step screenshot or video retention only when it helps test diagnostics | ✓ |

**User's choice:** Fold the todo into Phase 13 as a diagnostics concern.
**Notes:** The folded todo is not a broad UX feature request. It is only in scope where per-step artifacts help debug failing tests or CI runs.

---

## Test portfolio policy

| Option | Description | Selected |
|--------|-------------|----------|
| Keep both layers, prune weak regex-only guards | Preserve contract plus behavioral coverage, but remove low-value source-text assertions | ✓ |
| Strongly favor behavioral or integration tests | Contract tests become rare | |
| Keep the current contract-heavy style | Source-shape guards remain a major safety layer | |

**User's choice:** Keep both layers, but prune weak regex-only guards.
**Notes:** Contract tests remain valid when they protect important invariants, not incidental formatting or source text.

---

## Execution lanes

| Option | Description | Selected |
|--------|-------------|----------|
| Split into fast default lane + slower integration or smoke lane | Protect day-to-day speed while keeping deeper coverage elsewhere | ✓ |
| Keep one single `npm test` lane only | Simpler workflow, but everything stays coupled | |
| Split more aggressively | Separate unit, contract, integration, and smoke or perf lanes | |

**User's choice:** Split into a fast default lane and a slower integration or smoke lane.
**Notes:** The suite should remain quick for routine work while allowing heavier diagnostics and real-environment checks in a secondary lane.

---

## Flakiness strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Prefer deterministic isolation and mocking by default | Keep only a few real persistence or process smoke tests | ✓ |
| Keep more real-component coverage | Accept slower or flakier tests for broader realism | |
| Hybrid biased toward real behavior | Favor SQLite, filesystem, and process behavior over mocks | |

**User's choice:** Prefer deterministic isolation and mocking by default.
**Notes:** A few real smoke tests should remain for the highest-risk seams, but most tests should become more isolated and predictable.

---

## Failure diagnostics

| Option | Description | Selected |
|--------|-------------|----------|
| Improve terminal logs only | Diagnostics stay mostly in console output | |
| Add structured failure bundles | Include traces, snapshots, stdout or stderr, timing, and similar artifacts | ✓ |
| Go further with near-ubiquitous rich diagnostics | Capture heavy artifacts for most failing tests | |

**User's choice:** Add structured failure bundles for the important lanes.
**Notes:** Diagnostics should be CI-friendly and useful without forcing a local rerun.

---

## Refactor scope

| Option | Description | Selected |
|--------|-------------|----------|
| Reorganize test files and helpers if it improves clarity or speed | Structural refactors are allowed when justified | ✓ |
| Only additive fixes | Avoid broader restructuring | |
| Heavy reorganization as a goal in itself | Large-scale layout changes are a primary objective | |

**User's choice:** Allow reorganization where it improves clarity, speed, or reliability.
**Notes:** Refactors should be outcome-driven rather than aesthetic or taxonomy-only changes.

---

## the agent's Discretion

- Exact lane names and script naming.
- Exact placement of high-value smoke tests versus isolated fast tests.
- Exact artifact packaging for failure bundles.

## Deferred Ideas

None — discussion stayed within phase scope.
