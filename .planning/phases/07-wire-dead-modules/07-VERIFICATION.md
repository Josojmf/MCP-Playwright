---
phase: 07-wire-dead-modules
verified: 2026-04-01T00:00:00Z
status: gaps_found
score: 2/5 must-haves verified
gaps:
  - truth: "Un run para @playwright/mcp usa system prompt con herramientas browser_* y no el prompt genérico estático"
    status: failed
    reason: "El orquestador mantiene string estático y no llama assembleSystemPrompt()."
    artifacts:
      - path: "src/server/orchestrator/OrchestratorService.ts"
        issue: "Mensaje system hardcodeado ('You are a test automation agent...')."
      - path: "src/shared/llm/systemPrompt.ts"
        issue: "Módulo implementado pero no conectado al path de ejecución del orquestador."
    missing:
      - "Importar y llamar assembleSystemPrompt(ctx.mcpConfig.id, tools) antes de provider.complete()."
      - "Pasar lista real de tools del MCP (o al menos cableado desde negociación/capabilities)."
  - truth: "Existe screenshot blob en SQLite por cada tool call MCP de un run completado y no es placeholder 1x1"
    status: failed
    reason: "El pipeline de captura sigue generando PNG 1x1 placeholder y no consume trazas instrumentadas de tool calls."
    artifacts:
      - path: "src/server/runManager.ts"
        issue: "captureStepScreenshot() usa getPlaceholderScreenshot() (1x1) para todos los pasos."
      - path: "src/server/mcp/InstrumentedMcpClient.ts"
        issue: "Existe e instancia, pero no hay llamadas a instrumentedClient.callTool() desde el path principal."
    missing:
      - "Conectar tool calls reales a InstrumentedMcpClient.callTool()."
      - "Persistir screenshotId/screenshot real de trazas instrumentadas en vez de placeholder."
  - truth: "Un stale ARIA ref dispara retry con snapshot nuevo y el resultado refleja el retry (no el error stale-ref)"
    status: failed
    reason: "Se detecta/traza stale-ref, pero no se invoca retryWithNewSnapshot() en ejecución real."
    artifacts:
      - path: "src/server/runManager.ts"
        issue: "Solo usa isStaleRefError() y traceStaleRefRecovery(); no usa retryWithNewSnapshot()."
      - path: "src/server/mcp/stalenessRecovery.ts"
        issue: "retryWithNewSnapshot() está implementado pero desconectado del flujo de ejecución."
    missing:
      - "Envolver operación de tool call con retryWithNewSnapshot()."
      - "Actualizar StepResult para reflejar outcome del retry (pass/fail final) en vez de solo prefijo [STALE-REF]."
---

# Phase 7: Wire Dead Modules into Execution Path Verification Report

**Phase Goal:** All fully-implemented Phase 2/3 modules that exist only as dead code are connected into the live production execution path.
**Verified:** 2026-04-01T00:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Run `@playwright/mcp` usa prompt con `browser_*`, no prompt genérico estático | ✗ FAILED | `src/server/orchestrator/OrchestratorService.ts` mantiene `content: "You are a test automation agent..."`; no referencia a `assembleSystemPrompt`. |
| 2 | Screenshot por tool call MCP en SQLite no-placeholder | ✗ FAILED | `src/server/runManager.ts` usa `getPlaceholderScreenshot()` y comentario `1x1 transparent PNG`; no flujo de screenshot real desde tool calls. |
| 3 | `Then` con assertion fallida queda `failed` independientemente del MCP | ✓ VERIFIED | `OrchestratorService.runScenario()` llama `runAssertion(step.assertion,{})` y fuerza `stepStatus = "failed"` cuando falla; test `Then step with assertion overrides status...` pasa. |
| 4 | Stale-ref dispara retry real y refleja resultado del retry | ✗ FAILED | `runManager.ts` detecta stale-ref y traza, pero no invoca `retryWithNewSnapshot()` en path de ejecución. |
| 5 | `TokenBudget.checkBudget()` se ejecuta antes de cada LLM request y bloquea por cap | ✓ VERIFIED | `OrchestratorService.ts` llama `ctx.tokenBudget.checkBudget()` justo antes de `provider.complete()`; test de budget exceeded pasa con status `aborted`. |

**Score:** 2/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/shared/llm/systemPrompt.ts` | Ensamble dinámico de prompt por MCP/tools | ⚠️ ORPHANED | Existe y es sustantivo, pero no está conectado desde `OrchestratorService`. |
| `src/server/orchestrator/OrchestratorService.ts` | Consumir prompt dinámico + assertions + budget guard | ⚠️ PARTIAL | Assertions y budget sí; prompt dinámico no. |
| `src/server/mcp/InstrumentedMcpClient.ts` | Captura de tool-call traces y screenshots reales | ⚠️ HOLLOW — wired but data disconnected | Clase existe y se instancia, pero sin `callTool()` en path principal. |
| `src/server/runManager.ts` | Persistir screenshots reales y recuperación stale-ref con retry | ✗ STUB/PARTIAL | Sigue en placeholder 1x1; stale-ref solo anotado, sin retry. |
| `src/server/mcp/stalenessRecovery.ts` | Retry reusable para stale refs | ⚠️ ORPHANED/PARTIAL | `retryWithNewSnapshot()` existe pero no se usa en ejecución principal. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `OrchestratorService.ts` | `systemPrompt.ts` | `assembleSystemPrompt(...)` | ✗ NOT_WIRED | No import ni llamada; prompt sigue hardcodeado. |
| `runManager.ts` | `InstrumentedMcpClient` | `new InstrumentedMcpClient(...)` + `callTool(...)` | ⚠️ PARTIAL | Se instancia, pero no hay `callTool()`; solo `getTraces()`/logs. |
| `runManager.ts` | almacenamiento screenshots | `captureStepScreenshot()` | ✗ NOT_WIRED (real data) | Captura basada en placeholder 1x1, no evidencia real por tool call. |
| `OrchestratorService.ts` | `assertionsRunner.ts` | `runAssertion(step.assertion,{})` | ✓ WIRED | Link completo y en uso por Then-steps. |
| `OrchestratorService.ts` | `TokenBudget.ts` | `ctx.tokenBudget.checkBudget()` | ✓ WIRED | Guard pre-LLM activo. |
| `runManager.ts` | `stalenessRecovery.ts` | `retryWithNewSnapshot(...)` | ✗ NOT_WIRED | Solo `isStaleRefError` y `traceStaleRefRecovery`; falta retry real. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `runManager.ts` screenshot pipeline | `screenshotBuffer` | `getPlaceholderScreenshot(stepText)` | No (PNG 1x1 fijo) | ⚠️ STATIC |
| `runManager.ts` instrumented traces | `instrumentedTraces` | `instrumentedClient.getTraces()` | No en path actual (sin `callTool`) | ✗ DISCONNECTED |
| `OrchestratorService.ts` assertion override | `assertionOverride` | `runAssertion(step.assertion,{})` | Sí (afecta `stepStatus`) | ✓ FLOWING |
| `OrchestratorService.ts` budget gate | `checkBudget()`/error | `TokenBudget` | Sí (aborta antes de llamar LLM) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Assertions override y budget guard se mantienen estables | `npx tsx --test src/server/orchestrator/OrchestratorService.test.ts` | 17/17 pass, exit 0 | ✓ PASS |
| RunManager regression básica | `npx tsx --test src/server/runManager.test.ts` | 8/8 pass, exit 0 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| ORCH-09 | 07-01-PLAN.md | Prompt dinámico por MCP/tool namespace | ✗ BLOCKED | Prompt aún estático en `OrchestratorService.ts`. |
| VALID-01 | 07-02-PLAN.md | Captura screenshot real por tool call con InstrumentedMcpClient | ✗ BLOCKED | Placeholder 1x1 en `runManager.ts`; sin `callTool()` integrado. |
| VALID-02 | 07-03-PLAN.md | Assertions independientes en Then | ✓ SATISFIED | `runAssertion()` conectado y test de override en verde. |
| EXEC-05 | 07-04-PLAN.md | Retry stale-ref con snapshot nuevo sin penalizar benchmark | ✗ BLOCKED | Falta llamada a `retryWithNewSnapshot()`. |
| INFRA-05 | 07-05-PLAN.md | Budget guard antes de llamadas LLM | ✓ SATISFIED | `checkBudget()` antes de `provider.complete()`, test passing. |
| GHERKIN-05 | REQUIREMENTS.md (Phase 7 mapping) | Traductor Then→expect() | ⚠️ ORPHANED | Aparece mapeado a Phase 7 en requirements, pero no está en `requirements_addressed` de planes 07-01..07-05. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/server/runManager.ts` | 748 | `getPlaceholderScreenshot(...)` | 🛑 Blocker | Evita evidencia real de screenshot por tool call. |
| `src/server/runManager.ts` | 760 | `1x1 transparent PNG` | 🛑 Blocker | Contradice criterio de no-placeholder. |
| `src/server/orchestrator/OrchestratorService.ts` | 48 | Prompt hardcodeado genérico | 🛑 Blocker | No cumple ORCH-09 (prompt dinámico por MCP/tools). |
| `src/server/orchestrator/OrchestratorService.ts` | 253 | Comentario/implementación placeholder para `extractToolCalls` | ⚠️ Warning | Tool-call trace puede ser incompleto/no confiable para detección de loops y métricas. |

### Gaps Summary

La fase 7 no alcanzó su objetivo completo de “wire dead modules into live execution path”. Aunque `runAssertion` (VALID-02) y `checkBudget` (INFRA-05) sí están operativos y verificados por tests, tres resultados contractuales siguen incumplidos: (1) prompt dinámico por MCP no está cableado, (2) la captura de screenshots reales sigue reemplazada por placeholder 1x1, y (3) la recuperación stale-ref no ejecuta retry real con snapshot nuevo.

Estos tres fallos comparten raíz: los módulos existen pero su **enlace de ejecución/data-flow** está incompleto o desconectado.

---

_Verified: 2026-04-01T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
