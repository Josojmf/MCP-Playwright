# MCP Playwright Test Playground

## What This Is

A research and benchmarking platform for comparing the efficiency of AI-driven MCP (Model Context Protocol) tools for browser automation in QA E2E functional testing. Users define test scenarios as Gherkin BDD scripts with a base URL, and the platform runs them in parallel across multiple Playwright-compatible MCP servers using a provider-agnostic LLM orchestrator. Results are presented as a full scorecard: quality (accuracy, hallucination detection), cost (tokens, $), and reliability (consistency across runs).

## Core Value

Honest, reproducible comparison of MCP tool quality for E2E browser automation — exposing which MCPs actually work versus which ones hallucinate their way through tests.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Orchestration**
- [ ] Provider-agnostic LLM orchestrator service (adapter pattern) — supports OpenRouter, Azure OpenAI, OpenAI, Claude API with zero coupling to any specific provider
- [ ] OpenRouter as default orchestrator implementation
- [ ] Orchestrator parses Gherkin BDD scripts and dispatches step-by-step instructions to MCP servers
- [ ] Per-run token budget cap with cost estimation before execution and real-time cost dashboard
- [ ] Per-MCP token ceiling — exceeding limit marks MCP result as incomplete

**MCP Execution**
- [ ] Support for all available Playwright-compatible MCP servers (pluggable registry)
- [ ] Parallel execution of same Gherkin scenario across all selected MCPs simultaneously
- [ ] Hard timeout per Gherkin step (configurable) — timeout = step fail
- [ ] Loop detection — abort MCP if identical action repeats N times (prevents runaway token burn)
- [ ] Auto-retry failed steps N times (configurable); determinism score across 3 runs per MCP

**Validation & Anti-Hallucination**
- [ ] Screenshot captured at every Gherkin step for each MCP
- [ ] Dual-layer step validation: Playwright expect() assertions on Then clauses + LLM screenshot analysis
- [ ] Suspicious step flagging for human review in scorecard (when assertion and LLM confidence diverge)
- [ ] Ground truth: Gherkin Then clauses translated into Playwright expect() calls that run independently

**UI**
- [ ] Scenario editor: base URL + Gherkin BDD script input
- [ ] MCP selector: choose which MCPs to include in a run (default: all)
- [ ] Real-time run progress via SSE/WebSocket — per-MCP step status streams live as it executes
- [ ] Full scorecard view: metrics table (pass/fail per step, time, tokens, cost) + step-by-step replay with screenshots per MCP
- [ ] Cumulative cost tracker dashboard across sessions
- [ ] Run history: persisted locally, exportable as JSON and CSV
- [ ] Technical + polished visual design (PostHog/Datadog aesthetic) — dark/light mode, data-dense, zero fluff

**CLI**
- [ ] CI-ready headless runner: same Gherkin + URL scenarios without browser, outputs structured results
- [ ] Developer debug mode: inspect MCP responses, replay steps, diagnose failures from terminal

### Out of Scope

- Managing or hosting MCP servers — playground connects to them, does not run infrastructure
- Writing Gherkin scripts for the user — input is user-provided
- Real user management / auth — single-user local tool for v1
- Custom LLM fine-tuning or model training
- Mobile browser automation (desktop/headless only for v1)

## Context

- **Domain**: MCP (Model Context Protocol) is the emerging standard for AI agents to interact with tools. Browser automation MCPs (like @playwright/mcp) let LLMs drive browsers natively. The quality gap between different MCPs and models is largely unmeasured — this platform fills that gap.
- **Key risk**: AI hallucination in step reporting is the #1 reliability problem. An MCP can claim success while the DOM state tells a different story. The dual-layer validation (Playwright assertions + LLM screenshot analysis) directly addresses this.
- **Flakiness**: E2E tests are notoriously flaky. The retry + determinism scoring approach distinguishes "MCP is bad" from "test is flaky".
- **Cost discipline**: Parallel multi-MCP runs multiply token spend quickly. Budget caps and loop detection are first-class features, not afterthoughts.

## Constraints

- **Tech Stack — Frontend**: React + Tailwind + shadcn/ui — component-owned, Radix primitives, no vibe-coded UI
- **Tech Stack — Backend**: Fastify (Node.js) — fast, schema-first API server
- **Tech Stack — Realtime**: SSE or WebSocket for live step streaming during runs
- **Architecture — Orchestrator**: Strict adapter pattern, zero hard dependency on any LLM provider. Swapping OpenRouter for Azure OpenAI, Claude API, or OpenAI must require only a config change.
- **Architecture — MCPs**: Pluggable MCP registry — adding or removing MCP servers requires no core changes
- **GSD Skills**: All phases use gsd:ui-phase (design contracts) + gsd:plan-phase + gsd:execute-phase + gsd:verify-work + gsd:ui-review

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Provider-agnostic orchestrator via adapter pattern | Avoid lock-in to OpenRouter; any LLM provider must be swappable via config | — Pending |
| Dual-layer step validation (Playwright + LLM screenshot) | LLM alone can hallucinate pass; Playwright alone can't catch semantic errors | — Pending |
| Parallel MCP execution (same scenario, all MCPs simultaneously) | Eliminates time-ordering bias in comparison; faster overall runs | — Pending |
| Determinism score (3 runs per MCP) | Separates flaky tests from genuinely unreliable MCPs | — Pending |
| Loop detection + hard step timeout | Prevents runaway token burn from stuck MCPs | — Pending |
| shadcn/ui + Tailwind over full component library | Owned components, no runtime dependency, consistent with Radix primitives | — Pending |
| Run history exportable as JSON + CSV | Enables external analysis and longitudinal MCP quality tracking | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-30 after initialization*
