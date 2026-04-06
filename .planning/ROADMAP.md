# ROADMAP — MCP Playwright Test Playground

**Core Value:** Honest, reproducible comparison of MCP tool quality for E2E browser automation.

## Milestones

- ✅ **v1.0 milestone** — Phases 1-13 (shipped 2026-04-04)
  Archive: `.planning/milestones/v1.0-ROADMAP.md`
  Audit accepted with known gaps: `.planning/milestones/v1.0-MILESTONE-AUDIT.md`

## Current Status

Phase 1 executing — 01-01-PLAN.md complete.

### Phase 1: Step-level execution traceability — screenshots, detailed logs, and real-time visibility per step

**Goal:** Enrich each execution step with visual evidence, detailed logs, and real-time per-step visibility in the UI, plus optional video recording.
**Requirements:** [TRACE-01, TRACE-02, TRACE-03, TRACE-04, TRACE-05, TRACE-06, TRACE-07, TRACE-08, TRACE-09]
**Plans:** 4 plans (1/4 complete)

| Plan | Title | Status |
|------|-------|--------|
| 01-01 | Backend: auto-capture screenshot per step, extend types, granular SSE tool-call events | DONE |
| 01-02 | Frontend: expandable step detail with tabbed sections (Tools/Reasoning/Timing/Errors) | pending |
| 01-03 | Frontend: inline thumbnails in live + history views, wire SSE tool-call data to detail panel | pending |
| 01-04 | Video recording toggle + playback in history | pending |

## Carry-Forward Gaps From v1.0

- Live MCP runs still need real translated `Then` assertion enforcement.
- Screenshot capture still needs to flow through the live tool path into persisted evidence and vision validation.
- Browserbase remains selectable without a complete executable runtime configuration.
- Production stale-ref recovery still needs real retry wiring.
- CLI benchmark execution and per-run CSV export still need alignment with the authoritative `runManager` path.
- Earlier phases still need broader milestone-level verification coverage.

---
