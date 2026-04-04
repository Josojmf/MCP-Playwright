---
phase: 12-mejorar-fiabilidad-seguridad-y-transparencia-del-ejecutor-de-tests-para-qa
plan: 02
subsystem: api
tags: [run-config, react, api, reproducibility]
requires:
  - phase: 09-real-vision-llm-validation
    provides: two-tier auditor model semantics
provides:
  - explicit run request contract with provider and three model fields
  - normalized execution config emitted at run start
  - UI controls and local persistence for reproducible run configuration
affects: [ui, api, history, trust]
tech-stack:
  added: []
  patterns: [explicit execution config, UI-request parity]
key-files:
  created:
    - src/server/runManager.phase12.contract.test.ts
  modified:
    - src/server/runManager.ts
    - src/server/runManager.test.ts
    - src/server/runManager.phase8.contract.test.ts
    - src/client/App.tsx
key-decisions:
  - "Normalized request values are now the source of truth for runs instead of environment autodetection."
  - "Execution config is emitted to the UI at run start so trust surfaces can use it immediately."
patterns-established:
  - "Provider and model choices must travel end-to-end as explicit request payload fields."
requirements-completed: [EXEC-04, UI-04]
duration: recovery
completed: 2026-04-04
---

# Phase 12: Plan 02 Summary

**Run creation now carries explicit provider and model choices from the React UI through backend normalization**

## Performance

- **Duration:** recovery
- **Started:** 2026-04-04T00:00:00Z
- **Completed:** 2026-04-04T00:00:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Replaced the ambiguous single `model` request shape with `provider`, `orchestratorModel`, `lowCostAuditorModel`, and `highAccuracyAuditorModel`.
- Made `PhaseOneRunManager` preserve normalized request values as the source of truth for a run session.
- Added React controls and local persistence so QA can choose and repeat the exact execution stack.

## Task Commits

Execution was recovered inline from a previously incomplete subagent run, so atomic task commits were not produced for this plan.

## Files Created/Modified
- `src/server/runManager.ts` - Explicit request normalization and run-start execution config payload
- `src/server/runManager.phase12.contract.test.ts` - Contract guard for the new request shape
- `src/client/App.tsx` - Provider/model controls, persistence, and request payload wiring
- `src/server/runManager.test.ts` - Regression coverage for explicit config handling
- `src/server/runManager.phase8.contract.test.ts` - Adjusted older contract coverage to the new request shape

## Decisions Made

- Environment variables still provide secrets and fallback defaults, but no longer overwrite explicit run choices.
- The live UI logs the resolved execution config as soon as the run starts.

## Deviations from Plan

`src/server/index.ts` did not require structural changes because it already forwards the request body directly into `estimateRun()` and `createRun()`.

## Issues Encountered

- Existing pricing-table tests referenced obsolete model names and had to be updated to valid configured model ids.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Persisted trust and evidence metadata can now store a stable execution config alongside each run.
- UI trust surfaces have a consistent config payload to render.

---
*Phase: 12-mejorar-fiabilidad-seguridad-y-transparencia-del-ejecutor-de-tests-para-qa*
*Completed: 2026-04-04*
