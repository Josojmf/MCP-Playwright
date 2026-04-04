---
phase: 13-excelencia-y-estabilizacion-de-testing
plan: 04
subsystem: testing
tags: [node-test, smoke, sqlite, fastify, diagnostics, artifacts]
requires:
  - phase: 13-01
    provides: "Manifest-driven fast and smoke test lanes"
provides:
  - "Runtime smoke harness for isolated temp dirs and DATA_DIR-scoped execution"
  - "Structured smoke-lane failure bundle metadata with stdout/stderr capture"
  - "Explicit *.smoke.test.ts ownership for history, sqlite, and screenshots real-I/O coverage"
affects: [phase-13, test-lanes, ci-diagnostics, persistence-tests]
tech-stack:
  added: []
  patterns: [runtime smoke harness, screenshot-first failure bundles, explicit smoke ownership]
key-files:
  created:
    - src/test/support/failureBundle.ts
    - src/test/support/runtimeSmokeHarness.ts
    - src/server/api/history.smoke.test.ts
    - src/server/storage/sqlite.smoke.test.ts
    - src/server/storage/screenshots.smoke.test.ts
  modified:
    - scripts/test/run-lane.mjs
    - scripts/test/test-manifest.mjs
key-decisions:
  - "Smoke tests activate their runtime after switching into an isolated temp workspace so sqlite.ts binds its .data path to the harnessed cwd."
  - "Failure bundles stay screenshot-first and collect compact JSON/CSV/response artifacts instead of always-on heavy capture."
patterns-established:
  - "Real persistence and filesystem seams live in explicit *.smoke.test.ts files owned only by the smoke lane manifest."
  - "Smoke diagnostics register artifact files and directories during the test run so the lane runner can materialize a CI-friendly bundle on failure."
requirements-completed: []
duration: 14min
completed: 2026-04-05
---

# Phase 13 Plan 04: Smoke Diagnostics Summary

**Runtime smoke harness plus screenshot-first failure bundles for SQLite, filesystem, and history/export seams**

## Performance

- **Duration:** 14 min
- **Started:** 2026-04-04T23:53:00+02:00
- **Completed:** 2026-04-05T00:07:01+02:00
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Added a reusable runtime smoke harness that isolates temp workspaces, scopes `DATA_DIR`, resets SQLite state, and registers runtime artifacts.
- Extended the smoke lane runner with structured failure-bundle sessions, captured stdout/stderr logs, and stable bundle metadata under `.artifacts/test-failures/smoke/`.
- Moved the real persistence/filesystem/API coverage into explicit `*.smoke.test.ts` files and attached JSON/CSV/response evidence to smoke diagnostics.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the smoke harness and structured failure bundle pipeline** - `5076b6f3` (`feat`)
2. **Task 2: Move the real persistence/filesystem tests into smoke ownership and wire bundle-aware diagnostics** - `08093d0c` (`test`)

## Files Created/Modified
- `src/test/support/failureBundle.ts` - Registers artifact paths and writes context files for smoke-failure capture.
- `src/test/support/runtimeSmokeHarness.ts` - Creates isolated temp workspaces, resets SQLite state, and exposes artifact helpers to smoke tests.
- `scripts/test/run-lane.mjs` - Captures smoke-lane stdout/stderr, manages failure-bundle sessions, and prints bundle paths on failure.
- `scripts/test/test-manifest.mjs` - Marks the smoke lane as bundle-enabled and points ownership at explicit `*.smoke.test.ts` files.
- `src/server/api/history.smoke.test.ts` - Covers persisted history plus JSON/CSV export behavior with artifact registration.
- `src/server/storage/sqlite.smoke.test.ts` - Covers real SQLite persistence and DB-file evidence capture.
- `src/server/storage/screenshots.smoke.test.ts` - Covers filesystem-backed screenshot storage with registered screenshot artifacts.

## Decisions Made
- Activated the smoke harness before dynamically importing sqlite-backed modules so their process-level data paths bind to the isolated workspace instead of the repo root.
- Kept failure evidence compact and screenshot-first by recording response bodies, DB files, and screenshot directories rather than introducing always-on video capture.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `npm run test:smoke` failed once in the sandbox with `spawn EPERM`; rerunning the verification outside the sandbox resolved it and the smoke lane passed.
- Parallel executors landed overlapping branch commits while Task 2 was in progress, so the task was closed with an atomic metadata commit after confirming the branch tip already contained the intended smoke-lane file state.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The fast lane is now cleanly separated from the real I/O smoke inventory, and smoke failures have a structured artifact path ready for CI debugging.
- Failure-bundle materialization is implemented but only the passing path was exercised during this execution; the next failing smoke run should validate the emitted bundle contents end to end.

## Self-Check: PASSED

- Verified all created summary and support files exist on disk.
- Verified both task commits (`5076b6f3`, `08093d0c`) exist in git history.
- Checked touched plan files for stub markers; the only `placeholder` hit is an internal sentinel used to derive a sanitized screenshot directory path in `screenshots.smoke.test.ts`, not an unresolved product stub.

---
*Phase: 13-excelencia-y-estabilizacion-de-testing*
*Completed: 2026-04-05*
