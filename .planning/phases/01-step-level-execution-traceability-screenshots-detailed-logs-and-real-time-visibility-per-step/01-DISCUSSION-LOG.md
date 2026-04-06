# Phase 1: Step-level execution traceability - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 01-step-level-execution-traceability-screenshots-detailed-logs-and-real-time-visibility-per-step
**Areas discussed:** Screenshot evidence per step, Step detail expansion, Real-time log streaming, Video recording mode

---

## Screenshot Evidence Per Step

### When to capture

| Option | Description | Selected |
|--------|-------------|----------|
| Auto every step | Capture after every step completes. Maximum traceability. ~50-200KB per PNG. | ✓ |
| Only on failure | Capture only on failed steps. Lower storage, loses successful step evidence. | |
| User toggle per run | Enable/disable before run start. Flexible but adds config surface. | |

**User's choice:** Auto every step (Recommended)
**Notes:** None

### How to display

| Option | Description | Selected |
|--------|-------------|----------|
| Inline thumbnail | Small ~120px thumbnail in step row, click to open ScreenshotLightbox | ✓ |
| Click-to-reveal only | No thumbnail, icon/button to load screenshot in lightbox | |
| Side panel | Dedicated panel alongside timeline showing latest screenshot | |

**User's choice:** Inline thumbnail (Recommended)
**Notes:** None

### Persistence

| Option | Description | Selected |
|--------|-------------|----------|
| Both live and history | Screenshots persist and appear in RunDetailView too | ✓ |
| Live only | Shown during execution but not persisted to history | |

**User's choice:** Both live and history (Recommended)
**Notes:** RunDetailView already maps screenshots by stepId

---

## Step Detail Expansion

### What to show (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Tool call details | Name, args, result/error, latency from StepResult.toolCalls[] | ✓ |
| LLM reasoning | Model's message/reasoning for the step | ✓ |
| Timing breakdown | LLM thinking time vs tool execution time vs total | ✓ |
| Error stack traces | Full error details on failed steps | ✓ |

**User's choice:** All four selected
**Notes:** Rich step expansion

### Layout organization

| Option | Description | Selected |
|--------|-------------|----------|
| Tabbed sections | Tabs: Tools, Reasoning, Timing, Errors | ✓ |
| Stacked accordion | All sections stacked vertically | |
| You decide | Claude's discretion | |

**User's choice:** Tabbed sections (Recommended)
**Notes:** None

---

## Real-Time Log Streaming

### Presentation approach

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in timeline | Logs within LiveStepTimeline, expanded detail IS the log | ✓ |
| Separate log panel | Dedicated scrollable panel for continuous event stream | |
| Both | Timeline + collapsible log panel | |

**User's choice:** Inline in timeline (Recommended)
**Notes:** No separate panel needed

### Streaming granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Real-time streaming | Tool calls appear as they happen while step is running | ✓ |
| On step completion | Detail only available after step finishes | |

**User's choice:** Real-time streaming (Recommended)
**Notes:** Requires new SSE events for individual tool calls

---

## Video Recording Mode

### Scope decision

| Option | Description | Selected |
|--------|-------------|----------|
| Defer to future phase | Focus Phase 1 on screenshots + logs | |
| Include as optional toggle | Playwright video recording with toggle before run start | ✓ |
| Include with step sync | Video + synchronized step-to-video playback | |

**User's choice:** Include as optional toggle
**Notes:** Completes the pending todo scope

### Playback location

| Option | Description | Selected |
|--------|-------------|----------|
| In RunDetailView | Video player section in history detail view | ✓ |
| Reuse ScreenshotLightbox | Adapt lightbox for video | |
| You decide | Claude's discretion | |

**User's choice:** In RunDetailView (Recommended)
**Notes:** None

---

## Claude's Discretion

- SSE event schema design for granular tool-call streaming
- Thumbnail generation approach
- Video storage format and cleanup policy
- Tab component choice for step detail sections
- StepResult type extension strategy

## Deferred Ideas

- Video playback synchronized with step timeline (click step -> jump to video moment)
- Separate scrollable log panel for raw event stream
