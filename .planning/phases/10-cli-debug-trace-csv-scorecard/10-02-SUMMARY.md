---
phase: 10-cli-debug-trace-csv-scorecard
plan: 02
subsystem: api
tags: [history, csv, scorecard, export]
requires:
  - phase: 06-cli-export
    provides: history-export-endpoints
provides:
  - summary CSV by (runId,mcpId)
  - scorecard metrics per MCP in export
affects: [history-export, analytics]
tech-stack:
  added: []
  patterns: [run-detail-aggregation, token-share-cost-proration]
key-files:
  created:
    - src/server/api/history.phase10.contract.test.ts
  modified:
    - src/server/api/history.ts
key-decisions:
  - "`/api/history/export.csv` se mantiene y ahora materializa `RunDetail[]` antes de exportar."
  - "`totalCostUsd` se prorratea por participación de tokens del MCP en cada run."
patterns-established:
  - "CSV de scorecard con columnas estables: runId,mcpId,passRate,hallucinationCount,totalTokens,totalCostUsd"
requirements-completed: [HIST-02]
duration: 25min
completed: 2026-04-01
---

# Phase 10 Plan 02: CSV scorecard summary

**El export de historial CSV ahora sale por `(runId,mcpId)` con métricas de scorecard consistentes para hojas de cálculo.**

## Accomplishments

- Se añadieron contratos RED para forzar grano por MCP y columnas requeridas.
- `buildSummaryCsv()` dejó el formato per-run y ahora agrega por MCP dentro de cada run.
- El endpoint `/api/history/export.csv` carga `RunDetail[]` con `getRun(run.id)` antes de construir el CSV.

## Task Commits

1. **Task 1 (RED contracts)** - `c2576fe5` (test)
2. **Task 2 (CSV aggregation)** - `3a57f1d1` (fix)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Listo para verificación global y marcado de fase 10 como completada.
