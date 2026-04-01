# Phase 11: Execution Transparency and Live Playwright Step Viewer — Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Upgrade the live run view and add a post-run scorecard to close requirements UI-04, UI-05, UI-06, UI-07.

Three concrete deliverables:
1. **Live multi-MCP layout** — side-by-side column view replacing the current stacked card layout, with per-column auto-scroll and live screenshot feed.
2. **Post-run scorecard** — inline transition from live view to metrics table + step replay when a run completes.
3. **Suspicious step flagging** — visual treatment for `hallucinated` and `needsReview` steps in both live and post-run views.

No new backend endpoints, no new MCP servers, no CLI changes. Pure frontend + minimal wiring to data already available.

**Requirements closed:** UI-04, UI-05, UI-06, UI-07
**Folded todo:** "Mostrar screenshot o video por paso" — per-step screenshot visibility during live run

</domain>

<decisions>
## Implementation Decisions

### Live View Layout

- **D-01:** The live run section uses **side-by-side columns** — one column per MCP. Replaces the current stacked `progressByMcp` cards in App.tsx. Each column scrolls independently and auto-scrolls to the latest step as it arrives.

- **D-02:** Typical run is **1–2 MCPs**. Layout is designed for that case — two columns side by side, each taking ~half the available width.

- **D-03:** When the number of MCPs exceeds available column space (narrow screens or 3+ MCPs), layout **degrades to tabs** — one tab per MCP, user clicks to switch. The same step list and screenshot are shown per tab.

- **D-04:** The existing `LiveStepTimeline` component (`src/client/components/run/LiveStepTimeline.tsx`) should be evaluated for reuse as the step list within each column. It already has progress bar, step rows, and status icons.

### Screenshot Display During Live Run

- **D-05:** Each MCP column shows the **latest screenshot only**, always visible — replacing the previous one as each step completes. This is the "live camera feed" pattern. No per-step thumbnail accumulation during the run.

- **D-06:** Clicking the screenshot thumbnail opens a **modal lightbox** with full-resolution image. Reuse the existing `/api/screenshots/:id` REST endpoint.

- **D-07:** This closes the folded todo "Mostrar screenshot o video por paso" — the screenshot is always visible per MCP column during execution.

### Post-Run Scorecard

- **D-08:** When a run reaches `completed` or `aborted` status, the live column view **transitions inline to a scorecard**. No navigation, no new route — same panel, different content. RunState `"completed"` triggers the scorecard render.

- **D-09:** Scorecard structure: **metrics summary table at top, step replay below** — single scrollable view.

- **D-10:** Metrics table columns (one row per MCP, columns are metrics):
  - Pass rate (% steps passed)
  - Hallucination count (steps with `validation.hallucinated === true`)
  - Tokens + cost (total tokens, estimated USD)
  - Avg step latency (ms)

- **D-11:** Step replay below the metrics table: expandable step list per MCP. Each step row shows status, step text, tokens, latency. Clicking a step row expands to show its screenshot inline (already available via `screenshotsByStep` pattern in `RunDetailView`).

### Suspicious Step Flagging

- **D-12:** In the **live step feed**, flagged steps use **color + icon on the step row**:
  - `hallucinated === true` → red row background + ❌ icon + `[HALLUCINATED]` label
  - `needsReview === true` → yellow row background + ⚠️ icon + `[NEEDS REVIEW]` label
  - Consistent with Phase 10 CLI coloring (red/yellow established pattern)

- **D-13:** In the **post-run scorecard step replay**, same visual treatment as D-12. Additionally, the hallucination count in the metrics table (D-10) provides the at-a-glance summary.

- **D-14:** No dedicated "suspicious steps" filter tab or separate panel. The inline color treatment in the step list is sufficient for the expected 1–2 MCP, 5–15 step typical run.

### Claude's Discretion

- Whether to animate the transition from live view → scorecard (fade, slide, or instant swap)
- Exact column width handling (50/50 split, or auto-distributed for 3+ MCPs before tab fallback)
- Whether step replay in scorecard defaults to expanded or collapsed state per MCP
- Screenshot modal implementation (custom overlay or shadcn/ui Dialog)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Components
- `src/client/components/run/LiveStepTimeline.tsx` — Current step timeline component (evaluate for reuse in column layout)
- `src/client/components/history/RunDetailView.tsx` — History step replay with `screenshotsByStep` pattern (reference for scorecard step replay)
- `src/client/App.tsx` — Contains `progressByMcp`, `lastScreenshotByMcp`, `RunState`, SSE event handlers (central wiring point)

### Data Model
- `src/client/types/` — Shared types for RunDetail, PersistedStep, step validation fields
- `src/server/index.ts:166` — SSE endpoint `/stream/:runId` — review what fields are emitted per step event

### Design System
- `.planning/phases/01-core-infrastructure-ui-shell/01-UI-SPEC.md` — Color tokens, component patterns, PostHog/Datadog aesthetic

### Prior Phase Context
- `.planning/phases/09-real-vision-llm-validation/09-CONTEXT.md` — Defines `hallucinated`, `needsReview`, `verdict` field semantics
- `.planning/phases/10-cli-debug-trace-csv-scorecard/10-CONTEXT.md` — Defines CLI color scheme (red=hallucinated, yellow=needsReview) — UI should mirror this

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `LiveStepTimeline` (`src/client/components/run/LiveStepTimeline.tsx`, 180 lines): Has progress bar, step rows with status icons, isRunning/onAbort props. Currently unused in App.tsx main run view — candidate for the per-column step list.
- `RunDetailView` (`src/client/components/history/RunDetailView.tsx`, 159 lines): Already implements `screenshotsByStep` map and step row rendering with screenshot thumbnails. Scorecard step replay can follow this pattern.
- `progressByMcp` state in App.tsx: Contains `ProgressState` per MCP with status, step counts, tokens, networkOverheadMs — foundation for metrics table data.
- `lastScreenshotByMcp` state in App.tsx: Already tracks latest screenshotId per MCP — maps directly to D-05.
- `/api/screenshots/:id` endpoint: Already exists, used by both App.tsx and RunDetailView — drives the modal lightbox.

### Established Patterns
- shadcn/ui Dialog — likely candidate for screenshot lightbox modal (per Phase 1 constraint)
- CSS custom properties `--app-*` tokens for theming — all color decisions must use these
- `status-chip` + `app-badge` classes — existing status indicator patterns; flagging should extend these

### Integration Points
- App.tsx `RunState` — `"running"` → live columns; `"completed"` / `"aborted"` → scorecard transition (D-08)
- SSE event handlers in App.tsx (~line 453–554) — emit `screenshotId` per step; live column subscribes here
- `progressByMcp` state drives the column rendering; transition to scorecard reads `RunDetail` from history API

</code_context>

<specifics>
## Specific Ideas

- Preview selected during discussion: `| playwright ⏳ | puppeteer ✅ |` column layout — two columns, step rows with status icons, screenshot below or above the step list per column.
- Scorecard preview selected: metrics table (pass rate, hallucination count, tokens+cost, avg latency) as a single table with MCPs as rows, then step replay below.
- Flagging preview selected: `❌ Step 3: Then see dashboard [HALLUCINATED]` / `⚠️ Step 5: Then count items [NEEDS REVIEW]` — explicit text label + color, not just a dot.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### Reviewed Todos (not folded)
None — the only matched todo ("Mostrar screenshot o video por paso") was folded into scope.

</deferred>

---

*Phase: 11-execution-transparency-and-live-playwright-step-viewer*
*Context gathered: 2026-04-01*
