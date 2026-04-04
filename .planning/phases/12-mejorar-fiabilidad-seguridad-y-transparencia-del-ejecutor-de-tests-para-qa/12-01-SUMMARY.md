---
phase: 12-mejorar-fiabilidad-seguridad-y-transparencia-del-ejecutor-de-tests-para-qa
plan: 01
subsystem: validation
tags: [playwright, assertions, security, validation]
requires:
  - phase: 07-wire-dead-modules
    provides: assertion translation and runtime assertion execution hook
provides:
  - strict allowlisted assertion execution keyed by translated pattern ids
  - explicit failure path for unsupported or untranslated assertions
  - regression tests guarding against dynamic execution
affects: [validation, run-manager, auditability]
tech-stack:
  added: []
  patterns: [allowlisted assertion runners, source-level regression checks]
key-files:
  created: []
  modified:
    - src/server/validation/assertionsRunner.ts
    - src/server/validation/assertionsRunner.test.ts
key-decisions:
  - "Removed dynamic code evaluation entirely instead of trying to sandbox it."
  - "Unsupported assertions now fail explicitly with auditable messages."
patterns-established:
  - "Assertion execution must branch on translator patternId, never on raw playwrightCall strings."
requirements-completed: [VALID-02]
duration: recovery
completed: 2026-04-04
---

# Phase 12: Plan 01 Summary

**Allowlisted Playwright assertion runners replaced arbitrary evaluation in the validation path**

## Performance

- **Duration:** recovery
- **Started:** 2026-04-04T00:00:00Z
- **Completed:** 2026-04-04T00:00:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Replaced the `new Function(...)` assertion path with explicit runners for the translated high-value assertion patterns.
- Added deterministic failures for missing or unsupported `patternId` values so unsafe shapes never execute.
- Added regression tests that verify supported patterns still work and that dynamic evaluation does not return.

## Task Commits

Execution was recovered inline from a previously incomplete subagent run, so atomic task commits were not produced for this plan.

## Files Created/Modified
- `src/server/validation/assertionsRunner.ts` - Allowlisted runner table keyed by translated assertion ids
- `src/server/validation/assertionsRunner.test.ts` - Coverage for allowlisted success/failure and unsupported pattern rejection

## Decisions Made
- Removed the dynamic evaluation path completely rather than wrapping it.
- Used the translator pattern registry as the runtime allowlist boundary.

## Deviations from Plan

None in scope. `src/server/parser/assertionPatterns.ts` did not require changes because the existing pattern ids already matched the new runner table.

## Issues Encountered

- The initial delegated executor did not return completion artifacts, so execution had to be recovered inline from the validated working tree.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Assertion execution is now auditable and safe to build trust-state persistence on top of.
- Phase 12 validation can treat unsupported assertions as degraded trust instead of hidden execution.

---
*Phase: 12-mejorar-fiabilidad-seguridad-y-transparencia-del-ejecutor-de-tests-para-qa*
*Completed: 2026-04-04*
