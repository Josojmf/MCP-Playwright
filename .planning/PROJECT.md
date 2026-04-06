# MCP Playwright Test Playground

## What This Is

A benchmarking and QA research platform for comparing MCP-driven browser automation systems against the same Gherkin scenarios. The product runs scenarios across multiple Playwright-compatible MCP servers, records execution evidence, and surfaces quality, trust, cost, and reliability differences in a shared UI and CLI.

## Core Value

Honest, reproducible comparison of MCP tool quality for E2E browser automation.

## Current State

`v1.1` shipped on 2026-04-06 after Phase 1 (step-level execution traceability). Added per-step screenshot capture, expandable step detail with tabbed sections, inline thumbnails in live/history views, SSE tool-call streaming, and optional video recording with playback.

`v1.0` was archived on 2026-04-04 after Phases 1-13 with known live-path gaps.

See:

- `.planning/milestones/v1.1-ROADMAP.md`
- `.planning/milestones/v1.1-REQUIREMENTS.md`
- `.planning/milestones/v1.0-ROADMAP.md`
- `.planning/milestones/v1.0-REQUIREMENTS.md`
- `.planning/milestones/v1.0-MILESTONE-AUDIT.md`

## Requirements

### Validated

- Provider-agnostic LLM adapter architecture and MCP registry scaffolding shipped in `v1.0`.
- Real MCP stdio JSON-RPC process management shipped in `v1.0`.
- Live run transparency and post-run scorecard surfaces shipped in `v1.0`.
- QA trust-state, degradation reason, and execution-config visibility shipped in `v1.0`.
- Fast/smoke lane testing infrastructure and deterministic runtime fixtures shipped in `v1.0`.
- Per-step screenshot capture with auto-screenshot fallback — `v1.1`.
- Expandable step detail rows with tabbed Tools/Reasoning/Timing/Errors sections — `v1.1`.
- Inline screenshot thumbnails in live execution and history views — `v1.1`.
- Real-time tool-call SSE streaming during step execution — `v1.1`.
- Optional Playwright video recording toggle with history playback — `v1.1`.

### Active

- Enforce translated `Then` assertions in the real live-MCP execution path.
- Pass screenshot evidence through real tool calls into persistence and vision validation.
- Make Browserbase execution real or remove it from the default selectable inventory.
- Wire stale-ref retry into the production run path.
- Unify CLI benchmark execution with `runManager`.
- Fix per-run CSV export so it matches the promised per-MCP scorecard contract.
- Backfill milestone-level verification coverage where earlier phases still lack `*-VERIFICATION.md`.

### Out of Scope

- Managing or hosting MCP server infrastructure.
- Writing Gherkin scripts for the user.
- Multi-user auth and SaaS account management.
- Model fine-tuning or custom model training.
- Mobile browser automation for `v1`.

## Context

- Frontend: React, Tailwind, shadcn/ui.
- Backend: Fastify, Node.js, SQLite-backed local persistence.
- Realtime delivery: SSE.
- Current planning surface is reset for the next milestone; `v1.0` planning is archived under `.planning/milestones/`.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Adapter-based LLM orchestration | Provider swaps must remain config-only | ✓ Shipped |
| Registry-driven MCP integration | New MCPs should be added without core rewrites | ✓ Shipped |
| Live transparency plus post-run scorecard | Benchmark credibility depends on visible execution evidence | ✓ Shipped |
| Trust-state and degraded-run surfacing | QA needs to know when results are auditable versus suspect | ✓ Shipped |
| Fast/smoke test split | Daily development should stay deterministic while real-I/O seams remain covered | ✓ Shipped |
| Live-path assertion and evidence wiring | Truthfulness of benchmark results depends on it | ⚠ Still incomplete |
| Step-level execution traceability | Per-step visibility builds trust in benchmark results | ✓ Shipped v1.1 |

---
*Last updated: 2026-04-06 after v1.1 milestone*
