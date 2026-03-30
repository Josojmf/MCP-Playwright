---
phase: 06-cli-export
verified: 2026-03-30T18:55:39.2122594Z
status: gaps_found
score: 2/5 must-haves verified
gaps:
  - truth: "`mcp-bench debug --mcp <name>` imprime traza completa de tool calls (tool name, args, response, latency) y marca pasos hallucinated"
    status: failed
    reason: "El modo debug solo imprime resumen por paso; no renderiza `toolCalls` ni marca explícita de hallucination en salida de terminal."
    artifacts:
      - path: "src/cli/mcp-bench.ts"
        issue: "`runDebug()` imprime step/meta pero no itera `step.toolCalls` ni muestra argumentos/respuestas."
      - path: "src/server/orchestrator/OrchestratorService.ts"
        issue: "Extracción de tool calls es simplificada/placeholder; en práctica produce trazas vacías con provider CLI mock."
    missing:
      - "Imprimir por paso cada tool call con nombre, argumentos, resultado y latencia en `runDebug()`"
      - "Marcar claramente `HALLUCINATED`/`NEEDS_REVIEW` en salida debug"
      - "Asegurar captura real de tool calls para que debug tenga datos útiles"
  - truth: "`Export CSV` genera una fila por MCP con columnas de scorecard (pass rate, hallucination count, total tokens, total cost)"
    status: failed
    reason: "El CSV actual por run es por paso, y el CSV de lote resume runs sin columnas de scorecard por MCP requeridas."
    artifacts:
      - path: "src/server/api/history.ts"
        issue: "`buildRunCsv()` exporta filas por step; `buildSummaryCsv()` no incluye passRate/hallucinations/tokens/cost."
    missing:
      - "Cambiar export CSV para emitir una fila por MCP"
      - "Incluir columnas: step pass rate, hallucination count, total tokens, total cost"
      - "Mantener compatibilidad con importación en hojas de cálculo"
---

# Phase 6: CLI & Export Verification Report

**Phase Goal:** The platform is CI-ready: `npx mcp-bench run` executes headlessly and outputs JSON with correct exit codes; `mcp-bench debug` replays readable traces; run history exports JSON/CSV.
**Verified:** 2026-03-30T18:55:39.2122594Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `mcp-bench run --url --feature` ejecuta headless y escribe JSON válido a stdout | ✓ VERIFIED | Spot-check con `tmp-smoke.feature` imprimió JSON estructurado y `EXIT:0` (`src/cli/mcp-bench.ts`, `bin/mcp-bench.js`). |
| 2 | Exit codes CI: `0` si todo pasa, `1` si hay fallo/hallucination | ? UNCERTAIN | Se verificó `EXIT:0` en camino exitoso. No se logró reproducir de forma controlada un caso de fallo/hallucination vía CLI en <10s; código contiene lógica `hasFailure ? 1 : 0` en `runHeadless()`. |
| 3 | `mcp-bench debug --mcp` imprime traza completa de tool calls legible y marca hallucinated | ✗ FAILED | Salida real muestra solo resumen por paso; no hay nombre/args/response por tool call, ni marca explícita de hallucination (`src/cli/mcp-bench.ts`). |
| 4 | Botón `Export JSON` descarga detalle completo (steps, validation, token/cost) | ✓ VERIFIED | `RunDetailView` enlaza a `/api/history/:id/export.json`; endpoint retorna `getRun(id)` completo con `steps.validation`, `tokens`, `estimatedCost` (`src/client/components/history/RunDetailView.tsx`, `src/server/api/history.ts`, `src/server/storage/sqlite.ts`). |
| 5 | Botón `Export CSV` descarga resumen por MCP con métricas de scorecard | ✗ FAILED | Endpoint CSV actual no cumple formato requerido: por-step (`buildRunCsv`) o por-run sin métricas de scorecard (`buildSummaryCsv`) (`src/server/api/history.ts`). |

**Score:** 2/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `bin/mcp-bench.js` | Entrypoint ejecutable CLI | ✓ VERIFIED | Existe, ejecuta `tsx` contra `src/cli/mcp-bench.ts`. |
| `src/cli/mcp-bench.ts` | Comandos `run`/`debug`, JSON + exit code | ⚠️ PARTIAL | `run` funciona y emite JSON; `debug` no expone traza completa requerida. |
| `src/server/api/history.ts` | Export JSON/CSV de historial/run | ⚠️ PARTIAL | JSON correcto; CSV no cumple contrato de scorecard por MCP. |
| `src/client/components/history/RunDetailView.tsx` | UI con acciones `Export JSON`/`Export CSV` | ✓ VERIFIED | Botones y rutas de descarga cableadas. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `bin/mcp-bench.js` | `src/cli/mcp-bench.ts` | `spawnSync(node, [tsxCli, entrypoint,...])` | ✓ WIRED | Entrypoint CLI operativo (`--help` probado). |
| `src/cli/mcp-bench.ts` | `OrchestratorService.runScenario()` | `for await ... runScenario(...)` | ✓ WIRED | Producción de resultados JSON por step. |
| `src/cli/mcp-bench.ts` (`runDebug`) | Traza de tool calls en terminal | Render de `step.toolCalls` | ✗ NOT_WIRED | `runDebug` no itera ni imprime `toolCalls`. |
| `RunDetailView.tsx` | `/api/history/:id/export.json` | `href` directo | ✓ WIRED | Descarga JSON cableada. |
| `RunDetailView.tsx` | `/api/history/:id/export.csv` | `href` directo | ✓ WIRED | Descarga CSV cableada. |
| `/api/history/:id/export.csv` | CSV scorecard por MCP | `buildRunCsv/buildSummaryCsv` | ✗ NOT_WIRED | Formato exportado no coincide con criterio de scorecard requerido. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `RunDetailView.tsx` | `run` (props) | `App.fetchRunDetail()` → `/api/history/:id` → `getRun()` (SQLite) | Yes (query real a DB local) | ✓ FLOWING |
| `src/server/api/history.ts` (JSON export) | `run` | `getRun(id)` | Yes | ✓ FLOWING |
| `src/server/api/history.ts` (CSV export) | `rows` | `run.steps` / `listRuns()` | Yes, pero esquema incorrecto para scorecard | ⚠️ STATIC CONTRACT MISMATCH |
| `src/cli/mcp-bench.ts` debug trace | `step.toolCalls` | `getRun(runId).steps[].toolCalls` | Data disponible, no se imprime | ✗ DISCONNECTED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| CLI help visible | `node .\bin\mcp-bench.js --help` | Muestra comandos `run` y `debug` | ✓ PASS |
| `run` con feature válido produce JSON | `node .\bin\mcp-bench.js run --url https://example.com --feature .\tmp-smoke.feature` | JSON estructurado con `results[].scenarios[].steps[]` | ✓ PASS |
| Exit code éxito (`0`) | `...run ...tmp-smoke.feature; Write-Output EXIT:$LASTEXITCODE` | `EXIT:0` | ✓ PASS |
| Debug imprime traza completa de tools | `node .\bin\mcp-bench.js debug --runId <id>` | Solo resumen por step; sin args/response por tool | ✗ FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `CLI-01` | ROADMAP Phase 6 | Headless runner emite JSON estructurado | ✓ SATISFIED | Spot-check `run` con JSON válido en stdout. |
| `CLI-02` | ROADMAP Phase 6 | Exit codes CI (0 éxito, 1 fallo/hallucination) | ? NEEDS HUMAN | `0` verificado; rama `1` por fallo/hallucination no reproducida en prueba corta aunque existe lógica en código. |
| `CLI-03` | ROADMAP Phase 6 | `debug` muestra traza de tool calls | ✗ BLOCKED | `runDebug()` no imprime `toolCalls` (args/response). |
| `HIST-02` | ROADMAP Phase 6 | Export JSON + CSV scorecard summary | ✗ BLOCKED | JSON correcto; CSV no cumple columnas/forma por MCP requeridas. |

**Orphaned requirements (Phase 6):** none detected in `.planning/REQUIREMENTS.md` traceability map.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/server/orchestrator/OrchestratorService.ts` | 105, 211-215 | Comentarios `simplified` / `Placeholder` en extracción de tool calls | ⚠️ Warning | Reduce trazabilidad real para `debug` y deja salida incompleta para diagnóstico. |

### Human Verification Required

### 1. Exit code en fallo/hallucination real

**Test:** Ejecutar un escenario que falle realmente (o marque hallucination) y comprobar código de salida en CI.
**Expected:** `EXIT:1` en fallo/hallucination; `EXIT:0` cuando todo pasa.
**Why human:** Requiere configurar caso de fallo semántico real en pipeline/end-to-end, no garantizable solo con spot-check corto local.

### 2. UX de descarga desde UI

**Test:** Clic en `Export JSON`/`Export CSV` desde historial en navegador.
**Expected:** Descarga directa sin errores; contenido acorde a contrato de producto.
**Why human:** Flujo visual/UX de navegador no verificable completamente por inspección estática.

### Gaps Summary

La fase 6 está **parcialmente lograda**: el CLI existe, el comando `run` emite JSON válido y los exports están cableados en UI/API. Sin embargo, hay dos brechas de contrato que bloquean el objetivo completo:

1. `debug` no muestra la traza detallada de tool calls (nombre, argumentos, respuesta, latencia), por lo que no cumple `CLI-03`.
2. El CSV exportado no es scorecard por MCP con métricas requeridas (pass rate, hallucinations, tokens, cost), por lo que no cumple `HIST-02`.

---

_Verified: 2026-03-30T18:55:39.2122594Z_
_Verifier: Claude (gsd-verifier)_
