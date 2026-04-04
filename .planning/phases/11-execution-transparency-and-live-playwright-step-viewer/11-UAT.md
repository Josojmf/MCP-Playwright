---
status: diagnosed
phase: 11-execution-transparency-and-live-playwright-step-viewer
source:
  - 11-01-SUMMARY.md
  - 11-02-SUMMARY.md
started: 2026-04-02T15:57:37.2347257+02:00
updated: 2026-04-02T16:16:00.0000000+02:00
---

## Current Test

[testing complete]

## Tests

### 1. Live MCP column layout
expected: Start a run with 2 MCPs selected. While the run is in `running` state, the old stacked progress cards should be gone. You should see two side-by-side MCP columns, each with MCP name, status chip, progress bar, screenshot area, and a scrolling step feed. The abort button should appear below the live columns.
result: issue
reported: |
  Live Console
  [16:00:20] Run completado. Tokens usados: 2044.
  
  [16:00:20] [@playwright/mcp] paso fallido en 7528ms
  
  [16:00:20] [@modelcontextprotocol/server-puppeteer] paso fallido en 7104ms
  
  [16:00:13] [@modelcontextprotocol/server-puppeteer] paso marcado como NEEDS_REVIEW.
  
  [16:00:13] [@modelcontextprotocol/server-puppeteer] paso completado en 4161ms
  
  [16:00:13] [@playwright/mcp] paso marcado como NEEDS_REVIEW.
  
  [16:00:13] [@playwright/mcp] paso completado en 4322ms
  
  [16:00:08] [@modelcontextprotocol/server-puppeteer] paso marcado como NEEDS_REVIEW.
  
  [16:00:08] [@modelcontextprotocol/server-puppeteer] paso completado en 2446ms
  
  [16:00:07] [@playwright/mcp] paso marcado como NEEDS_REVIEW.
  
  [16:00:07] [@playwright/mcp] paso completado en 1871ms
  
  [16:00:00] Canal SSE conectado.
  
  [16:00:00] MCP listo: @modelcontextprotocol/server-puppeteer
  
  [16:00:00] MCP listo: @playwright/mcp
  
  [16:00:00] Run en ejecución: 9 ejecuciones planeadas.
  
  [16:00:00] Run 22ab21a8-b8de-490b-88dc-98cd4ddb5723 iniciado.
severity: major

### 2. Screenshot lightbox from live view
expected: Once a live screenshot appears inside an MCP column, clicking it should open a lightbox modal with a dark overlay and the full-size screenshot. Closing the modal should return you to the live view without breaking the run.
result: issue
reported: "The screenshot is not shown, only a white screen appears"
severity: major

### 3. Suspicious step flagging in live view
expected: If a step is marked as `hallucinated`, its row should be visually flagged in red with a `[HALLUCINATED]` label. If a step is marked as `needsReview`, its row should be visually flagged in yellow with a `[NEEDS REVIEW]` label.
result: issue
reported: "The run does not even start, only a whit screen is shown"
severity: blocker

### 4. Live-to-scorecard swap on completion or abort
expected: When the run finishes or is aborted, the live column view should disappear and be replaced inline by the scorecard view. The run should stay on the same screen without route/navigation changes.
result: pass

### 5. Scorecard metrics table
expected: The scorecard should show one row per MCP with visible metrics for success rate, hallucination count, total tokens, and average latency. The table should be the first section shown in the scorecard.
result: pass

### 6. Replay accordion and screenshot expansion
expected: In the scorecard, each MCP replay section should start collapsed. Expanding an MCP should reveal its steps, and expanding a step should show the inline screenshot plus a `Ver screenshot` link. Any suspicious steps should keep the same visual warning/error treatment used in the live view.
result: pass

## Summary

total: 6
passed: 3
issues: 3
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "While the run is in `running` state, the old stacked progress cards should be gone and two side-by-side MCP columns should be visible with status, progress, screenshot area, step feed, and abort control."
  status: failed
  reason: "User reported: Live Console [16:00:20] Run completado. Tokens usados: 2044. ... [16:00:00] Run 22ab21a8-b8de-490b-88dc-98cd4ddb5723 iniciado."
  severity: major
  test: 1
  root_cause: "The live-run surface is appended below the always-rendered `new_run` setup/editor/sidebar layout in `App.tsx`, so starting a run does not promote the two-column live UI into the active viewport."
  artifacts:
    - path: "src/client/App.tsx"
      issue: "Keeps the pre-run editor, status cards, and Live Console visible during `running`, then mounts `<McpColumnGrid />` later in the page instead of swapping it into the primary viewport."
    - path: "src/client/components/run/McpColumnGrid.tsx"
      issue: "Contains the intended live surface, but it depends on `App.tsx` revealing it at the right time and position."
  missing:
    - "Swap the main `new_run` content into a dedicated live-run surface when `runState === \"running\"`."
    - "Hide/collapse the setup/editor + old status panels or move focus/scroll to the live surface when a run starts."
  debug_session: ".planning/debug/phase-11-live-run-surface.md"
- truth: "Clicking a live screenshot should open a lightbox modal with the full-size screenshot and a dark overlay, then close back to the live view cleanly."
  status: failed
  reason: "User reported: The screenshot is not shown, only a white screen appears"
  severity: major
  test: 2
  root_cause: "The live screenshot modal bypasses the shared dialog wrapper and manually composes Base UI `Backdrop` + `Popup`, which likely breaks the modal content anatomy so the overlay opens but the intended screenshot card does not render correctly."
  artifacts:
    - path: "src/client/components/run/ScreenshotLightbox.tsx"
      issue: "Manually assembles the modal surface with `DialogPrimitive.Popup` instead of following the app’s shared dialog content pattern."
    - path: "src/client/components/ui/dialog.tsx"
      issue: "Already provides the app-level dialog abstraction that the lightbox should reuse."
  missing:
    - "Rebuild the live screenshot modal using the shared dialog content wrapper or the correct Base UI viewport/content structure."
    - "Verify that the full-size image is rendered inside the actual modal content surface, not just behind the overlay."
  debug_session: ".planning/debug/phase11-screenshot-lightbox-white.md"
- truth: "If a step is marked as `hallucinated`, its row should be visually flagged in red with a `[HALLUCINATED]` label, and if marked as `needsReview`, it should be flagged in yellow with a `[NEEDS REVIEW]` label."
  status: failed
  reason: "User reported: The run does not even start, only a whit screen is shown"
  severity: blocker
  test: 3
  root_cause: "The flagging logic itself is present, but the live-only subtree likely crashes before flagged rows can render because `McpColumnGrid` creates an unguarded `ResizeObserver` on mount without a fallback for environments where that API is unavailable or throws."
  artifacts:
    - path: "src/client/components/run/McpColumnGrid.tsx"
      issue: "Creates `new ResizeObserver(...)` in the live-only mount path with no feature check or fallback."
    - path: "src/client/App.tsx"
      issue: "Mounts the live subtree only during `running`, which matches the timing of the white-screen failure."
    - path: "src/client/components/run/StepFlagStyles.ts"
      issue: "Shared flagging labels/styles already exist, indicating the blocker is the live mount path rather than missing suspicious-step presentation logic."
  missing:
    - "Guard `ResizeObserver` usage and provide a fallback layout path when the observer is unavailable."
    - "Re-run the live surface with browser-console/error capture once the observer path is hardened."
  debug_session: ".planning/debug/phase-11-uat-test-3-white-screen.md"
