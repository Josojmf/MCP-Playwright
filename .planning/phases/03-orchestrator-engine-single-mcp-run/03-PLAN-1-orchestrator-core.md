---
phase: 03-orchestrator-engine-single-mcp-run
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/server/orchestrator/types.ts
  - src/server/orchestrator/OrchestratorService.ts
  - src/server/orchestrator/OrchestratorService.test.ts
  - src/server/runManager.ts
autonomous: true
requirements: [ORCH-08, EXEC-01]
must_haves:
  truths:
    - "Un escenario Gherkin se ejecuta paso a paso para 1 MCP"
    - "El historial conversacional se conserva entre pasos"
    - "Se emiten eventos de progreso por paso para SSE"
  artifacts:
    - path: "src/server/orchestrator/OrchestratorService.ts"
      provides: "runScenario() como AsyncGenerator<StepResult>"
    - path: "src/server/orchestrator/types.ts"
      provides: "Contratos StepResult/RunContext/OrchestratorEvent"
    - path: "src/server/runManager.ts"
      provides: "Integración de eventos del orquestador con stream"
  key_links:
    - from: "src/server/orchestrator/OrchestratorService.ts"
      to: "src/shared/llm/factory.ts"
      via: "createProvider(config)"
      pattern: "createProvider"
    - from: "src/server/runManager.ts"
      to: "src/server/orchestrator/OrchestratorService.ts"
      via: "for await...of runScenario"
      pattern: "runScenario"
---

<objective>
Implementar el núcleo del orquestador de ejecución secuencial para 1 MCP con estado conversacional persistente por run (per D-02) y eventos listos para streaming.

Purpose: Desbloquear un pipeline real y observable antes de paralelismo.
Output: Servicio de orquestación funcional, tipado y probado.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@src/server/runManager.ts
@src/server/parser/index.ts
@src/shared/llm/factory.ts
@src/shared/harness/withTimeout.ts

<interfaces>
From src/server/parser/index.ts:
- export interface ScenarioPlan { id, name, tags, steps }
- ParsedStep incluye canonicalType y assertion (Then traducido)

From src/shared/llm/types.ts:
- interface LLMProvider { complete(); stream(); estimateCost(); }
- interface LLMMessage { role, content }
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Definir contratos de orquestación (per D-03)</name>
  <files>src/server/orchestrator/types.ts</files>
  <behavior>
    - Test 1: StepResult representa estados running/passed/failed/aborted con tokens y latencia
    - Test 2: Eventos de orquestación son serializables para SSE
  </behavior>
  <action>Crear tipos exportados para RunContext, StepResult, StepStatus, OrchestratorEvent, ToolCallTrace y ExecutionSummary. Evitar any; incluir campos mínimos para UI utilizable en español (ej. message).</action>
  <verify>
    <automated>npm run typecheck</automated>
  </verify>
  <done>Los contratos se exportan y son consumibles desde runManager sin type assertions inseguras.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implementar runScenario() como AsyncGenerator (per D-02)</name>
  <files>src/server/orchestrator/OrchestratorService.ts, src/server/orchestrator/OrchestratorService.test.ts</files>
  <behavior>
    - Test 1: Mantiene conversación acumulada entre pasos
    - Test 2: Emite evento por inicio/fin de paso
    - Test 3: En error de paso, marca failed y continúa/aborta según política
  </behavior>
  <action>Implementar OrchestratorService.runScenario(plan, ctx) que itera pasos, consulta LLMProvider, delega llamada de herramienta al cliente MCP abstracto y emite StepResult incremental. Integrar withTimeout para ejecución de paso y contabilizar tokens por paso.</action>
  <verify>
    <automated>npm run test -- src/server/orchestrator/OrchestratorService.test.ts</automated>
  </verify>
  <done>runScenario funciona como flujo incremental con historial conversacional persistente y cobertura de pruebas.</done>
</task>

<task type="auto">
  <name>Task 3: Enlazar orquestador con runManager y SSE</name>
  <files>src/server/runManager.ts</files>
  <action>Consumir runScenario con for-await, mapear eventos a frames SSE existentes (run_started, step_started, step_passed, run_aborted/run_completed) y propagar mensajes en español per D-01. No romper compatibilidad de eventos ya usados por App.tsx.</action>
  <verify>
    <automated>npm run test</automated>
  </verify>
  <done>El runManager transmite progreso real del orquestador y finaliza correctamente el run.</done>
</task>

</tasks>

<verification>
- `npm run test`
- `npm run typecheck`
- Smoke: iniciar run de 1 escenario y comprobar frames incrementales en `/stream/:runId`
</verification>

<success_criteria>
- Un run de 1 MCP ejecuta pasos secuenciales con contexto conversacional acumulado.
- Se observan eventos de paso en vivo y estado final determinista.
- No hay regressions en tests existentes de parser/harness.
</success_criteria>

<output>
After completion, create `.planning/phases/03-orchestrator-engine-single-mcp-run/03-01-SUMMARY.md`
</output>
