# Phase 1: Core Infrastructure & UI Shell - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the foundation: SSE streaming endpoint (Fastify), safety harness (`withTimeout` / `LoopDetector` / `TokenBudget`), Gherkin parser service, and basic UI shell with scenario editor + MCP selector. Nothing from Phase 2+ (LLM adapters, MCP execution, validation) belongs here.

</domain>

<decisions>
## Implementation Decisions

### Project Structure
- **D-01:** Flat `src/` split — `src/client/` (Vite + React), `src/server/` (Fastify), `src/shared/` (types, utilities). Single root `package.json`, single `tsconfig`. No monorepo workspaces.

### UI Shell Layout
- **D-02:** Left sidebar navigation — persistent sidebar with sections: New Run, History, Settings. Main content area fills the right. Sidebar stays visible across all views (editor → live run → scorecard → history).

### Dev Environment
- **D-03:** Single `npm run dev` command using `concurrently` to start Vite dev server + Fastify simultaneously. Vite proxies `/api` and `/stream` routes to Fastify. No Docker.

### Safety Harness Placement
- **D-04:** `withTimeout`, `LoopDetector`, and `TokenBudget` live in `src/shared/harness/` from day one — shared by backend (Phase 1+) and CLI runner (Phase 6). No relocation refactor needed later.

### Claude's Discretion
- TypeScript strictness level — use strict mode throughout
- `concurrently` vs `npm-run-all` — either is fine
- Specific shadcn/ui component selection for the shell (sidebar, inputs, checkboxes)
- Exact Vite proxy config syntax
- HTTP/2 setup details for Fastify (INFRA-02)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — Full v1 requirement list; Phase 1 requirements: INFRA-01 through INFRA-06, GHERKIN-01 through GHERKIN-04, UI-01, UI-02, UI-08, UI-09

### Project
- `.planning/PROJECT.md` — Stack constraints (React + Tailwind + shadcn/ui, Fastify, SSE/WebSocket), architecture principles, PostHog/Datadog aesthetic direction

### Roadmap
- `.planning/ROADMAP.md` §Phase 1 — Goal, plans breakdown, success criteria, UAT checklist

No external specs — requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None yet — Phase 1 establishes all patterns

### Integration Points
- `src/server/` Fastify server exposes `/stream/:runId` (SSE) and `/api/*` (REST)
- `src/client/` Vite app connects via proxy during dev; direct URLs in production build
- `src/shared/harness/` imported by both `src/server/` and (Phase 6) CLI entry point

</code_context>

<specifics>
## Specific Ideas

- **PostHog/Datadog aesthetic**: data-dense, dark/light mode, technical polish — no vibe-coded components. shadcn/ui primitives only.
- **Windows CRLF**: CRLF→LF normalization must happen before every `@cucumber/gherkin` parse call (GHERKIN-01) — this is a day-one Windows 11 failure mode if missed.
- **SSE safety**: client-disconnect abort via `AbortController`; `X-Accel-Buffering: no` header; heartbeat frames to keep connections alive.
- **OpenRouter API key**: present in `.env.txt` — relevant for Phase 2, but Phase 1 should scaffold the `.env` loading pattern.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-core-infrastructure-ui-shell*
*Context gathered: 2026-03-30*
