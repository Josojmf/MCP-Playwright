---
phase: 10-cli-debug-trace-csv-scorecard
plan: 01
subsystem: cli
tags: [cli, debug, trace, chalk, tool-calls]
requires:
  - phase: 06-cli-export
    provides: base-cli-debug-command
provides:
  - per-step tool call trace in debug mode
  - hallucination/review highlighting in step headers
affects: [cli-debug, troubleshooting]
tech-stack:
  added: [chalk]
  patterns: [compact-json-truncation, optional-latency-rendering]
key-files:
  created:
    - src/cli/mcp-bench.phase10.contract.test.ts
  modified:
    - src/cli/mcp-bench.ts
    - package.json
key-decisions:
  - "Render de args compacto en una sola línea con truncado de 200 caracteres."
  - "Render de result/error truncado a 150 caracteres y latencia opcional por tool call."
patterns-established:
  - "Header de step con etiqueta textual [HALLUCINATED]/[NEEDS-REVIEW] + color solo en header."
requirements-completed: [CLI-03]
duration: 35min
completed: 2026-04-01
---

# Phase 10 Plan 01: CLI debug trace summary

**`mcp-bench debug` ahora imprime trazas completas por tool call con truncado estable y resaltado de pasos hallucinated/needs-review.**

## Accomplishments

- Se añadieron contratos RED para exigir traza por tool call, truncado y fallback cuando no hay `latencyMs`.
- `runDebug()` ahora imprime líneas `→` con `toolName`, `args`, `result/error` y `lat=` cuando está disponible.
- Se añadió resaltado de header con `chalk` y etiquetas textuales compatibles con logs CI sin ANSI.

## Task Commits

1. **Task 1 (RED contracts)** - `e10276a1` (test)
2. **Task 2 (debug trace + chalk)** - `04a50c16` (fix)
3. **Auto-fix typecheck** - `9a52f581` (fix)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Literal de verdict inválido en chequeo needs-review**

- **Found during:** Verificación final (`npm run typecheck`)
- **Issue:** comparación con `"needsReview"` en `verdict` no era válida para el tipo `VisionVerdict`.
- **Fix:** se dejó únicamente `step.validation?.needsReview === true`.
- **Files modified:** `src/cli/mcp-bench.ts`
- **Verification:** `npm run typecheck` + tests de contrato fase 10 en verde.
- **Committed in:** `9a52f581`

---
**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Sin cambio de alcance; corrección estrictamente tipada para cumplir compilación.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Listo para validación de fase y cierre de roadmap/estado de fase 10.
