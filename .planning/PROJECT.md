# MCP Playwright Test Playground

## What This Is

A benchmarking and QA research platform for comparing MCP-driven browser automation systems against the same Gherkin scenarios. The product runs scenarios across multiple Playwright-compatible MCP servers, records execution evidence, and surfaces quality, trust, cost, and reliability differences in a shared UI and CLI.

## Core Value

Honest, reproducible comparison of MCP tool quality for E2E browser automation.

## Current State

`v1.0` was archived on 2026-04-04 after Phases 1-13. The shipped codebase includes provider abstraction, registry-driven MCP execution, live run transparency, QA trust-state surfaces, local history/export plumbing, and a substantially improved automated test stack.

The milestone audit was accepted with known live-path gaps. The most important remaining product work is not new surface area; it is closing the mismatch between what the live runtime claims and what the current execution path actually wires.

See:

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

---
*Last updated: 2026-04-05 after archiving v1.0 with accepted audit gaps*
