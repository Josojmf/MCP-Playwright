# Phase 1: Discussion Log

**Session:** 2026-03-30
**Workflow:** discuss-phase

---

## Area A: Project Structure

**Question:** How should the repo be organized?

**Options presented:**
1. Monorepo with packages (npm/pnpm workspaces) — `packages/frontend`, `packages/backend`, `packages/shared`
2. Flat src split (single package.json) — `src/client`, `src/server`, `src/shared`
3. Fully separate roots — independent `package.json` per side

**Selected:** `2` — Flat src split

---

## Area B: UI Shell Layout

**Question:** How should the app shell be structured?

**Options presented:**
1. Left sidebar navigation (persistent) — PostHog/Datadog style
2. Top navigation bar — full-width content below
3. Single-page flow — no persistent nav, editor → run → scorecard progression

**Selected:** `1` — Left sidebar navigation

---

## Area C: Dev Environment Setup

**Question:** How to run the project locally during development?

**Options presented:**
1. Single `npm run dev` with Vite proxy — `concurrently`, proxy `/api` and `/stream` to Fastify
2. Two separate terminals — `npm run dev:client` and `npm run dev:server`
3. Docker Compose — containerized frontend + backend

**Selected:** `1` — Single command, Vite proxy

---

## Area D: Safety Harness Placement

**Question:** Where should `withTimeout`, `LoopDetector`, `TokenBudget` live?

**Options presented:**
1. `src/shared/harness/` from day one — shared by backend and Phase 6 CLI
2. `src/server/harness/` — move to shared in Phase 6
3. `src/server/harness/` — CLI duplicates it

**Selected:** `1` — `src/shared/harness/` from the start

---

*Log generated: 2026-03-30*
