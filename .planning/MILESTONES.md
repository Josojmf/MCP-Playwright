# Milestones

## v1.0 milestone

**Shipped:** 2026-04-04  
**Status:** Archived with accepted audit gaps  
**Scope:** 13 phases, 29 plans, 50 tasks

### Delivered

- Provider-agnostic LLM adapters and typed MCP registry foundations.
- Real MCP JSON-RPC stdio process management and pricing-aware orchestration plumbing.
- Live per-MCP run transparency UI plus post-run scorecard, replay, trust-state, and audit surfaces.
- History persistence and richer QA-oriented execution metadata.
- Fast/smoke lane test architecture with deterministic fixtures and structured smoke failure bundles.

### Known Gaps Accepted At Archive Time

- `GHERKIN-05`, `VALID-02`: live MCP runs still do not enforce translated `Then` assertions consistently.
- `VALID-01`, `VALID-03`, `VALID-04`, `VALID-05`, `VALID-07`, `HIST-01`: screenshot capture is still disconnected from the real evidence and vision-validation path.
- `REGISTRY-05`, `EXEC-06`, `EXEC-07`: Browserbase is still selectable without a fully executable runtime path.
- `EXEC-05`: stale-ref recovery remains implemented but not wired into production execution.
- `CLI-01`, `CLI-02`, `HIST-02`: CLI benchmark execution and per-run CSV export still diverge from the real `runManager` path.

### Archive

- `milestones/v1.0-ROADMAP.md`
- `milestones/v1.0-REQUIREMENTS.md`
- `milestones/v1.0-MILESTONE-AUDIT.md`

---
