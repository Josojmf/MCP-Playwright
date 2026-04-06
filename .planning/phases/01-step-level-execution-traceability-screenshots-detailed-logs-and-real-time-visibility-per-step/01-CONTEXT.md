# Phase 1: Step-level execution traceability — Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Enrich each execution step with visual evidence (screenshots), detailed logs (tool calls, LLM reasoning, timing, errors), and real-time per-step visibility in the UI. Add optional video recording per run as a toggle.

</domain>

<decisions>
## Implementation Decisions

### Screenshot Evidence Per Step
- **D-01:** Auto-capture a screenshot after every step completes — maximum traceability, no user toggle needed.
- **D-02:** Display inline thumbnail (~120px) in each step row of LiveStepTimeline. Click opens ScreenshotLightbox for full-size.
- **D-03:** Screenshots persist to storage and appear in both live execution (LiveStepTimeline) and history (RunDetailView). Full audit trail.

### Step Detail Expansion
- **D-04:** Expandable step rows in LiveStepTimeline showing: tool call details (name, args, result/error, latency), LLM reasoning, timing breakdown (LLM thinking vs tool execution), and full error stack traces on failure.
- **D-05:** Expanded detail organized as tabbed sections: Tools | Reasoning | Timing | Errors.

### Real-Time Log Streaming
- **D-06:** Logs appear inline within the LiveStepTimeline — the expanded step detail IS the log. No separate log panel.
- **D-07:** Tool call events stream into the expanded step in real-time while the step is still running. Requires SSE events for individual tool calls, not just step completion.

### Video Recording Mode
- **D-08:** Include Playwright video recording as an optional toggle before run start. Default off.
- **D-09:** Video playback appears in RunDetailView (history) as a player section alongside step results and screenshots.

### Claude's Discretion
- SSE event schema design for granular tool-call streaming
- Thumbnail generation approach (resize on server vs CSS scaling)
- Video storage format and cleanup policy
- Tab component choice for step detail sections
- StepResult type extension strategy

### Folded Todos
- **Mostrar screenshot o video por paso** — Original request for visual evidence per step. Screenshot default + optional video toggle covers this todo's scope entirely.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Orchestrator & Step Types
- `src/server/orchestrator/types.ts` — StepResult, ToolCallTrace, OrchestratorEvent, StepStatus definitions
- `src/server/orchestrator/OrchestratorService.ts` — AsyncGenerator yielding StepResult, execution flow

### Screenshot Storage
- `src/server/storage/screenshots.ts` — saveScreenshot(), resolveScreenshotImagePath(), ScreenshotMetadata interface

### Live Execution UI
- `src/client/components/run/LiveStepTimeline.tsx` — Current step timeline (to be extended with thumbnails + expansion)
- `src/client/components/run/ScreenshotLightbox.tsx` — Existing lightbox dialog (reusable for full-size screenshots)
- `src/client/components/run/McpColumnGrid.tsx` — Grid layout for multi-MCP runs

### History UI
- `src/client/components/history/RunDetailView.tsx` — Post-run detail view (already maps screenshots by stepId)
- `src/client/types/history.ts` — RunDetail type definition

### SSE & Server
- `src/server/index.ts` — SSE endpoint setup
- `src/server/runManager.ts` — Run lifecycle management

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ScreenshotLightbox.tsx`: Dialog for full-size screenshot viewing — reuse directly for click-to-expand from thumbnails
- `saveScreenshot()` in `screenshots.ts`: Already stores screenshots by runId/stepId with metadata JSON
- `RunDetailView.tsx`: Already maps `run.screenshots` by `stepId` — pattern for history screenshot display exists
- shadcn/ui components: Available for tabs, collapsibles, badges

### Established Patterns
- SSE streaming via `src/server/index.ts` for real-time step events
- AsyncGenerator pattern in OrchestratorService for yielding step results
- Lucide icons for status indicators (CheckCircle2, XCircle, Loader, etc.)
- CSS variables for theming (`--app-fg-strong`, `--app-muted`, `--app-panel-strong`)

### Integration Points
- `StepResult` type needs `screenshotId` field (currently only on `ToolCallTrace`)
- `OrchestratorEvent` needs new event types for granular tool-call streaming
- `LiveStepTimeline` needs expansion state and tabbed detail rendering
- SSE endpoint needs to emit tool-call-level events, not just step-level
- Run start flow needs video recording toggle option

</code_context>

<specifics>
## Specific Ideas

- Screenshot as default evidence mode (per the pending todo recommendation)
- Video as optional feature with toggle per run (per the todo's two-alternative suggestion)
- Store visual reference by `stepId` for traceability in debug/export (per todo)

</specifics>

<deferred>
## Deferred Ideas

- Video playback synchronized with step timeline (click step -> jump to video moment) — too complex for Phase 1
- Separate scrollable log panel for raw event stream — decided inline-in-timeline is sufficient

</deferred>

---

*Phase: 01-step-level-execution-traceability-screenshots-detailed-logs-and-real-time-visibility-per-step*
*Context gathered: 2026-04-06*
