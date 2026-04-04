---
phase: 11
plan: 11-01
subsystem: ui
tags: [react, live-run, screenshots, tabs, dialog]
dependency_graph:
  requires: []
  provides: [live-mcp-columns, screenshot-lightbox, suspicious-step-flagging]
  affects: [11-02, src/client/App.tsx, run-ui]
tech_stack:
  added: [shadcn dialog/tabs integration already present in repo, live column layout wiring]
  patterns: [per-mcp live columns, always-visible latest screenshot, tab fallback for narrow layouts]
key_files:
  created: []
  modified:
    - src/client/App.tsx
    - src/client/components/run/McpColumn.tsx
    - src/client/components/run/McpColumnGrid.tsx
    - src/client/components/run/ScreenshotLightbox.tsx
decisions:
  - "Replaced the legacy progress cards with a dedicated live-run column grid in App.tsx."
  - "Removed the old mediaPreview modal from App.tsx and centralized screenshot preview inside ScreenshotLightbox."
  - "Kept the layout responsive by switching to tabs when MCP count grows or the container is too narrow."
metrics:
  duration: "~45 minutes"
  completed: "2026-04-02T14:15:00+02:00"
  tasks_completed: 5
  verification:
    - "npm run typecheck"
    - "npm run build"
---

# Phase 11 Plan 11-01: Live MCP Column Grid Summary

**Side-by-side MCP live columns with always-visible screenshots, lightbox preview, and inline suspicious-step flagging.**

## Objective Achieved

- Replaced the stacked `progressByMcp` cards with a dedicated `McpColumnGrid` render path for live runs.
- Kept the latest screenshot visible in each MCP column and moved fullscreen preview into `ScreenshotLightbox`.
- Preserved and surfaced `hallucinated` / `needsReview` evidence directly in the live step feed.

## Implementation Summary

### Task 1: Live MCP Column Layout

- `App.tsx` now routes the running state to `McpColumnGrid` instead of the old card list.
- `McpColumnGrid.tsx` keeps the two-column default for small MCP counts and falls back to tabs when space is constrained.
- The live abort control remains available under the live view.

### Task 2: Screenshot Lightbox

- `ScreenshotLightbox.tsx` now owns the screenshot preview flow for the live run section.
- The lightbox uses the dialog primitives already present in the repo, with the flat black overlay and no blur required by the UI spec.

### Task 3: Suspicious Step Flagging

- `McpColumn.tsx` renders flagged steps with the required warning/error treatments.
- `StepEvidence` already carried `hallucinated` and `needsReview` through the SSE handlers in `App.tsx`, so the live UI could consume those flags directly.

## Decisions Made

- Reused the exported `statusChipClass()` helper from `App.tsx` instead of duplicating status mapping inside the column component.
- Removed the old `mediaPreview` modal path rather than maintaining two screenshot preview systems in parallel.
- Used the existing shadcn/base-ui dialog and tabs primitives already installed in the repo instead of generating new registry code during execution.

## Deviations from Plan

- The plan called for generating the dialog and tabs components during execution, but both files already existed in the repository, so execution reused and tightened them instead of reinstalling them.
- `hallucinated` and `needsReview` wiring was already present in `App.tsx` before execution, so this plan consumed the data rather than introducing the SSE pass-through itself.

## Issues Encountered

- `vite build` fails inside the sandbox on this machine because the Tailwind native binary and Vite config resolution hit Windows sandbox restrictions.
- Re-running the build outside the sandbox succeeded, confirming the frontend integration rather than a code defect.

## Verification

- `npm run typecheck` ✅
- `npm run build` ✅ (outside sandbox)

## Next Phase Readiness

- The live execution view is ready for the completed/aborted scorecard swap.
- Flag styling and screenshot preview behavior are in place for reuse by Plan `11-02`.
