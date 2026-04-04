---
status: diagnosed
trigger: "Diagnose the Phase 11 UAT gap only. Find root cause, evidence, files involved, and suggested fix direction. Do not implement fixes."
created: 2026-04-02T00:00:00+02:00
updated: 2026-04-02T00:23:00+02:00
---

## Current Focus

hypothesis: Confirmed. The user remains on the editor/sidebar viewport because `App.tsx` always renders the `new_run` layout and only appends the live columns below it during `running`, with no layout swap or scroll/focus transition.
test: Completed by tracing JSX ordering and searching for any scroll or view-transition logic.
expecting: N/A
next_action: Finalize diagnosis output with root cause, evidence, files involved, and fix direction.

## Symptoms

expected: While the run is in `running` state, the old stacked progress cards should be gone and two side-by-side MCP columns should be visible with status, progress, screenshot area, step feed, and abort control.
actual: User reported a white screen / only console view instead of the live run surface.
errors: No browser error text was captured in the UAT artifact; reporter saw "white screen" and "only console view".
reproduction: Start a run with 2 MCPs selected and observe the UI while `runState` is `running`.
started: Observed during Phase 11 UAT on 2026-04-02.

## Eliminated

- hypothesis: The live view crashes because the Base UI tabs wrapper uses an incompatible runtime API.
  evidence: Local `@base-ui/react/tabs` definitions export `Tabs.Root`, `Tabs.List`, `Tabs.Tab`, and `Tabs.Panel`, which match the wrapper in `src/client/components/ui/tabs.tsx`.
  timestamp: 2026-04-02T00:17:00+02:00

## Evidence

- timestamp: 2026-04-02T00:09:00+02:00
  checked: src/client/App.tsx running-state render branch and SSE handlers
  found: `onConfirmRun()` sets `runState` to `running`, `run_started` populates `progressByMcp`, and UAT logs exactly match listeners like `connected`, `run_started`, `mcp_ready`, `step_passed`, `step_failed`, and `run_completed`.
  implication: The issue is not that the run never starts or that SSE is disconnected; the failure is downstream in rendering the live surface.

- timestamp: 2026-04-02T00:13:00+02:00
  checked: src/client/components/run/McpColumnGrid.tsx, ScreenshotLightbox.tsx, StepFlagStyles.ts
  found: The live surface itself is assembled in `McpColumnGrid`; its only nontrivial UI primitive dependency is the custom tabs wrapper. `StepFlagStyles` is pure style data and `ScreenshotLightbox` remains closed by default until click.
  implication: The highest-probability root cause is now the tabs path rather than screenshot or flagging logic.

- timestamp: 2026-04-02T00:17:00+02:00
  checked: installed `@base-ui/react/tabs` package exports
  found: Local package definitions export `Tabs.Root`, `Tabs.List`, `Tabs.Tab`, and `Tabs.Panel`, matching the wrapper in `src/client/components/ui/tabs.tsx`.
  implication: The tabs wrapper is not the root cause of the reported live-view absence.

- timestamp: 2026-04-02T00:21:00+02:00
  checked: src/client/App.tsx running layout ordering
  found: Inside `activeSection === "new_run"`, the editor/form section and right-sidebar panels including `Estado del run` and `Live Console` render first, and the live view is mounted only afterward under `Object.keys(progressByMcp).length > 0 ? runState === "running" ? <McpColumnGrid ...`.
  implication: While a run is active, the screen still prioritizes the old setup/status surface; the live MCP columns do not replace it inline at the user’s current viewport position.

- timestamp: 2026-04-02T00:21:30+02:00
  checked: src/client/App.tsx and run components for scroll/focus handoff
  found: No `scrollIntoView`, `scrollTo`, or equivalent focus/navigation behavior exists when a run starts.
  implication: Even when `McpColumnGrid` mounts successfully, the UI does nothing to reveal it, so users remain looking at the console/editor area and can reasonably report "only console view".

## Resolution

root_cause: `src/client/App.tsx` does not transition the page into a dedicated live-run surface. During `running`, it leaves the pre-run editor/sidebar layout visible, including the old run-status cards and live console, and only appends `McpColumnGrid` lower in the page. Because there is no hide/swap behavior or automatic scroll/focus to the live section, the user’s viewport stays on the console/setup area instead of the expected two-column live MCP surface.
fix: Diagnosis only; no fix applied.
verification: Root cause established by matching UAT symptoms to the JSX ordering and the absence of any viewport transition logic.
files_changed: []
