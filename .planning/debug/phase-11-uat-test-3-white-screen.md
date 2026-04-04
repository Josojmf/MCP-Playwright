---
status: investigating
trigger: "Diagnose the Phase 11 UAT gap only. Find root cause, evidence, files involved, and suggested fix direction. Do not implement fixes."
created: 2026-04-02T16:10:00+02:00
updated: 2026-04-02T16:32:00+02:00
---

## Current Focus

hypothesis: The blocker is in the live-run mount path, not in suspicious-step styling; the strongest candidate is `McpColumnGrid`'s unguarded `ResizeObserver`, which can throw as soon as the live surface mounts.
test: Correlate UAT evidence with the `runState === "running"` render branch and isolate code that exists only in the live view.
expecting: Evidence that the run and SSE stream are healthy, the shared flagging helper is already proven in the scorecard path, and the remaining mount-time live-only code can explain a white-screen failure.
next_action: return diagnosis with uncertainty called out

## Symptoms

expected: If a step is marked as `hallucinated`, its row should be visually flagged in red with a `[HALLUCINATED]` label, and if marked as `needsReview`, it should be flagged in yellow with a `[NEEDS REVIEW]` label.
actual: User reported: "The run does not even start, only a whit screen is shown"
errors:
reproduction: Start a run and wait for the live run view to mount.
started: Reported in Phase 11 UAT test 3 on 2026-04-02.

## Eliminated

## Evidence

- timestamp: 2026-04-02T16:18:00+02:00
  checked: .planning/phases/11-execution-transparency-and-live-playwright-step-viewer/11-UAT.md
  found: UAT test 1 logs show `Canal SSE conectado`, `Run ... iniciado`, MCP ready events, flagged `NEEDS_REVIEW` log lines, and `Run completado`, while tests 2 and 3 report white-screen behavior in the live view.
  implication: The backend run and SSE event flow are working; the failure happens after the live UI branch is entered.

- timestamp: 2026-04-02T16:22:00+02:00
  checked: src/client/App.tsx
  found: The live-only subtree is mounted exclusively at `runState === "running"` and renders `McpColumnGrid`; the scorecard renders only after completion or abort.
  implication: Any white-screen specific to run start must come from the live subtree rather than the shared app shell or run startup path.

- timestamp: 2026-04-02T16:25:00+02:00
  checked: src/client/components/run/StepFlagStyles.ts and src/client/components/run/RunScorecard.tsx
  found: `getStepFlagStyles()` returns the required `[HALLUCINATED]` / `[NEEDS REVIEW]` labels and is reused successfully by `RunScorecard`; UAT test 6 passed for scorecard suspicious-step treatment.
  implication: The blocker is not the flagging utility itself; the failing surface is specific to the live-view container.

- timestamp: 2026-04-02T16:29:00+02:00
  checked: src/client/components/run/McpColumnGrid.tsx
  found: `McpColumnGrid` is the only live-only component with mount-time browser API usage, creating `new ResizeObserver(...)` in `useEffect` with no availability guard or fallback.
  implication: If `ResizeObserver` is unavailable or fails in the reporter's browser/environment, React will throw as soon as the live view mounts, producing exactly the observed "run starts, then white screen" symptom before any row flagging can be seen.

- timestamp: 2026-04-02T16:30:00+02:00
  checked: package.json and src/client build
  found: `npm run build` succeeds, and the installed `@base-ui/react/tabs` package exports `Root`, `List`, `Tab`, and `Panel` as used by the wrapper.
  implication: This is not a compile-time failure and the earlier tabs-export-mismatch hypothesis is not supported.

## Resolution

root_cause: "Strongest evidence-backed diagnosis: the Phase 11 blocker is in the live-run mount path, with the top candidate being `McpColumnGrid`'s unguarded `ResizeObserver` access. The run/SSE pipeline and shared suspicious-step styling are both functioning, but the live surface introduces a mount-time browser API dependency that can white-screen the app before flagged rows render. Uncertainty remains because the UAT artifact did not capture the browser console error."
fix: "Guard `ResizeObserver` usage and fall back to a static grid/tab decision when unavailable; then re-run the live view and capture browser-console output to confirm no other live-only child (such as the lightbox subtree) still throws."
verification: "Diagnosis only; no fix applied."
files_changed: []
