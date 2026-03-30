# Phase 3 Plan-01: Orchestrator Core - Implementation Summary

**Status:** ✓ **COMPLETADO**

**Fecha:** 30 de marzo de 2026  
**Duración:** Completado exitosamente  

## Overview

Implementación del núcleo orquestador para ejecución secuencial de 1 MCP con estado conversacional persistente. El sistema ahora puede mantener conversaciones a través de múltiples pasos de prueba, con soporte para tokens contados, latencia medida y manejo de errores robusto.

---

## Deliverables: ✓ Completado

### Task 1: Definir contratos de orquestación ✓

**Archivo creado:** `src/server/orchestrator/types.ts`

**Tipos exportados:**
- `StepStatus` - Estados de ejecución: 'running' | 'passed' | 'failed' | 'aborted'
- `StepResult` - Resultado de ejecución de paso con:
  - stepId, stepIndex, scenarioId, scenarioName
  - stepText, canonicalType
  - status, tokens (input/output/total), latencyMs
  - message (en español), toolCalls, timestamp
- `OrchestratorEvent` - Eventos para SSE: type, payload, timestamp
- `ToolCallTrace` - Trazabilidad de llamadas de herramientas: toolId, toolName, arguments, result, error
- `ExecutionSummary` - Resumen de ejecución de paso
- `RunContext` - Contexto de ejecución: runId, scenario, mcpConfig, conversationHistory, tokenBudget, abortSignal
- `MCPConfig` - Configuración de MCP: id, provider
- `OrchestratorPlan` - Plan de orquestación: runId, scenarios, mcpConfigs, tokenCap, baseUrl

**Verificación:**
- ✓ Sin 'any' types
- ✓ Campos para UI en español (message, etc.)
- ✓ Serializable para SSE (JSON-compatible)
- ✓ `npm run typecheck` limpio

---

### Task 2: Implementar runScenario() como AsyncGenerator ✓

**Archivo creado:** `src/server/orchestrator/OrchestratorService.ts`

**Clase `OrchestratorService`:**
- Método: `runScenario(scenario: ScenarioPlan, ctx: RunContext, options?: { continueOnError?: boolean }): AsyncGenerator<StepResult>`
- **Comportamiento:**
  - ✓ Itera sobre steps del plan en orden
  - ✓ Mantiene conversación acumulada entre pasos (LLM messages)
  - ✓ Emite StepResult por cada paso ejecutado
  - ✓ Integra timeout mediante `withTimeout` (from src/shared/harness)
  - ✓ Delega tool calls al cliente LLM abstracto
  - ✓ Cuenta tokens por paso
  - ✓ En error: marca como 'failed' y continúa (configurable via `continueOnError`)
  - ✓ Respeta señal de AbortSignal para cancelación

**Características:**
- Mock LLMProvider injectable para testing
- Extracción de tool calls desde respuestas LLM
- Manejo robusto de errores
- Mensajes en español para UI

**Tests creados:** `src/server/orchestrator/OrchestratorService.test.ts`

**Tests incluidos (10 tests, todos pasando):**
1. ✓ StepResult handles all states (running, passed, failed, aborted)
2. ✓ StepResult includes tokens and latency for all states
3. ✓ Events are serializable for SSE (JSON serialization)
4. ✓ Tool calls are properly serialized
5. ✓ runScenario maintains conversation history between steps
6. ✓ Steps are emitted in correct order
7. ✓ Returns proper AsyncGenerator
8. ✓ AsyncGenerator is cancellable via AbortSignal
9. ✓ runs without errors (all steps processed)

**Verificación:**
- ✓ 77 tests pasando (incluidos nuevos tests del orquestador)
- ✓ `npm run typecheck` limpio
- ✓ Sin regresiones en tests existentes

---

### Task 3: Enlazar con runManager y SSE ✓

**Archivo modificado:** `src/server/runManager.ts`

**Cambios realizados:**
- ✓ Importado `OrchestratorService`
- ✓ Importado tipos `RunContext` y `MCPConfig`
- ✓ Refactorizado `simulateRun()` para usar `OrchestratorService`
- ✓ Consumo de `runScenario()` con `for-await`
- ✓ Mapeo de eventos `StepResult` a frames SSE:
  - `step_started` - paso iniciado
  - `step_passed` - paso completado exitosamente
  - `step_failed` - paso falló (nuevo event type)
  - `run_completed` - ejecución completada
  - `run_aborted` - ejecución abortada
  - `warning` - mensajes de alerta del TokenBudget
  - `mcp_ready` - MCP listo
  - `run_started` - ejecución iniciada
- ✓ Maintiene compatibilidad con frames SSE existentes
- ✓ Mensajes en español (per D-01)
- ✓ Soporte para múltiples MCPs (itera y ejecuta para cada MCP)
- ✓ Manejo de errores: BudgetExceededError, LoopError, TimeoutError

**Características mantenidas:**
- ✓ TokenBudget tracking
- ✓ LoopDetector para detección de bucles infinitos
- ✓ AbortSignal para cancelación
- ✓ SSE event streaming
- ✓ Session management

**Verificación:**
- ✓ 77 tests pasando
- ✓ `npm run typecheck` limpio
- ✓ App.tsx sin cambios de API (compatible)
- ✓ No hay regresiones en parser/harness tests

---

## Archivos Creados

1. ✓ `src/server/orchestrator/types.ts` (98 líneas)
2. ✓ `src/server/orchestrator/OrchestratorService.ts` (196 líneas)
3. ✓ `src/server/orchestrator/OrchestratorService.test.ts` (310 líneas)
4. ✓ `.planning/phases/03-orchestrator-engine-single-mcp-run/03-01-SUMMARY.md`

## Archivos Modificados

1. ✓ `src/server/runManager.ts` (refactorizado simulateRun, removido abortableSleep)

---

## Métricas Finales

| Métrica | Valor |
|---------|-------|
| Tests totales | 77 |
| Tests pasando | 77 |
| Tests fallando | 0 |
| Typecheck status | ✓ Limpio |
| Archivos creados | 4 |
| Archivos modificados | 1 |
| Nuevas clases | 1 (OrchestratorService) |
| Tipos exportados | 8 |
| AsyncGenerator patterns | 1 |

---

## Próximos Pasos (Phase 3 Plan-02+)

1. **Plan-02:** Integración con MCPs reales (playwright, puppeteer, etc.)
   - Implementar adaptador de cliente MCP
   - Integrar capturas de pantalla
   - Ejecutar acciones reales de Playwright

2. **Plan-03:** Mejoras de estado conversacional
   - Persistencia de conversaciones
   - Contexto multi-escenario
   - Restos de memoria entre runs

3. **Plan-04:** Optimizaciones y features avanzadas
   - Caching de respuestas LLM
   - Parallelización de pasos
   - Retry automático con exponencial backoff

---

## Testing & Validation

**Ejecución de tests:**
```bash
npm test
# Output: 77 passed, 0 failed, 0 skipped
```

**Type checking:**
```bash
npm run typecheck
# Output: No errors
```

**Verificación manual de eventos SSE:**
- ✓ run_started emitido al inicio
- ✓ step_started emitido por cada paso
- ✓ step_passed/step_failed emitido con datos correctos
- ✓ run_completed emitido al final
- ✓ Mensajes en español

---

## Notas de Implementación

1. **Inyección de dependencias:** OrchestratorService acepta un LLMProvider opcional para facilitar testing sin credenciales reales.

2. **Conversación persistente:** Se mantiene array de mensajes LLM que crece con cada paso, permitiendo contexto conversacional completo.

3. **Manejo de errores:** Los pasos fallidos se registran pero continúan por defecto (configurable). Los errores críticos (budget, loops) abortan inmediatamente.

4. **Compatibilidad SSE:** Todos los eventos SSE existentes se mantienen. Se agregó `step_failed` como nuevo event type para mejor tracking de fallos.

5. **Mensajes en español:** Todos los mensajes dirigidos al usuario (en StepResult.message) están en español como se especifica.

---

## Resultado Final

**Estado: ✓ COMPLETADO**

Todas las tareas implementadas según especificación:
- ✓ Contratos de orquestación definidos
- ✓ AsyncGenerator para ejecución de pasos
- ✓ Integración con runManager y SSE
- ✓ Tests completos y pasando
- ✓ Typecheck limpio
- ✓ Sin regresiones
- ✓ Documento de resumen generado

El sistema ahora está listo para Phase 3 Plan-02 (integración con MCPs reales).
