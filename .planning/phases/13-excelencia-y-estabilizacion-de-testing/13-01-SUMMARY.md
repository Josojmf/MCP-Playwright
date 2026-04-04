---
phase: 13-excelencia-y-estabilizacion-de-testing
plan: 01
subsystem: testing
tags: [node, tsx, testing, ci, manifest]
requires:
  - phase: 12-mejorar-fiabilidad-seguridad-y-transparencia-del-ejecutor-de-tests-para-qa
    provides: explicit runtime and evidence seams that now define smoke-lane ownership
provides:
  - manifest-driven fast and smoke test lane ownership
  - single lane runner for local, smoke, and CI test entrypoints
  - README workflow for deterministic default testing
affects: [phase-13-plan-02, phase-13-plan-03, phase-13-plan-04, testing-workflow]
tech-stack:
  added: []
  patterns: [manifest-driven test lane resolution, single entrypoint for npm test variants]
key-files:
  created: [scripts/test/run-lane.mjs]
  modified: [scripts/test/test-manifest.mjs, package.json, README.md]
key-decisions:
  - "Keep `npm test` bound to the fast lane and move slower real-I/O seams behind an explicit smoke inventory."
  - "Route `test`, `test:fast`, `test:smoke`, and `test:ci` through the same runner so lane policy stays centralized."
patterns-established:
  - "Lane ownership lives in `scripts/test/test-manifest.mjs`, not in scattered npm globs."
  - "Real persistence and filesystem tests must be listed explicitly before they can enter the smoke lane."
requirements-completed: []
duration: 8 min
completed: 2026-04-04
---

# Phase 13 Plan 01: Fast/Smoke Lane Foundation Summary

**Manifest-driven fast and smoke test lanes with a shared runner, explicit smoke inventory, and documented npm workflows**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-04T21:44:00Z
- **Completed:** 2026-04-04T21:52:06Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `scripts/test/run-lane.mjs` as the single entrypoint for lane-aware test execution and deterministic `--list` output.
- Replaced the broad `npm test` glob with explicit `test`, `test:fast`, `test:smoke`, and `test:ci` scripts routed through the runner.
- Seeded the smoke lane with the current real persistence and filesystem tests, then documented the lane split and commands in the README.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the lane runner and manifest contracts** - `658ddbf8` (feat)
2. **Task 2: Document the lane policy and seed the initial smoke inventory** - `b49166c4` (docs)

## Files Created/Modified

- `scripts/test/run-lane.mjs` - Resolves the manifest, lists lane membership, and runs `tsx --test` with explicit file sets.
- `scripts/test/test-manifest.mjs` - Defines fast-lane suffix policy plus the seeded smoke inventory and rationale.
- `package.json` - Routes all test-facing npm scripts through the lane runner.
- `README.md` - Documents the fast lane, smoke lane, CI sequence, and concrete listing commands.

## Decisions Made

- Kept the fast lane as the default `npm test` path so routine work stays deterministic and quick.
- Centralized lane execution behind one runner so future Phase 13 test moves only need manifest updates, not script rewrites.
- Stored smoke ownership as explicit file entries with reasons to make slow-lane membership reviewable in code review.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `gsd-tools state advance-plan` and `state record-metric` could not parse the legacy `STATE.md` structure, so `STATE.md` was updated manually after the task commits to keep Phase 13 progress accurate.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The repo now has a stable lane policy for moving or expanding tests in Plans 13-02 through 13-04.
- Future test portfolio changes can update the manifest without changing the public npm command surface.

## Self-Check: PASSED

- Verified summary file exists at `.planning/phases/13-excelencia-y-estabilizacion-de-testing/13-01-SUMMARY.md`.
- Verified task commit `658ddbf8` exists in git history.
- Verified task commit `b49166c4` exists in git history.
