---
phase: 03-orchestrator-engine-single-mcp-run
plan: 04
type: execute
wave: 3
depends_on: [01, 03]
files_modified:
  - src/server/storage/sqlite.ts
  - src/server/api/history.ts
  - src/server/index.ts
  - src/client/App.tsx
  - src/client/components/history/RunHistoryList.tsx
  - src/client/components/history/RunDetailView.tsx
  - src/client/components/run/PreRunEstimateModal.tsx
  - src/client/components/run/LiveStepTimeline.tsx
  - src/client/components/common/EmptyState.tsx
autonomous: false
requirements: [UI-03, UI-04, HIST-01, HIST-03]
user_setup:
  - service: sqlite
    why: "Persistencia local de runs e historial"
    env_vars: []
    dashboard_config: []
must_haves:
  truths:
    - "Antes de ejecutar aparece modal de costo y confirmación"
    - "El usuario ve progreso live por paso con copy en español"
    - "El run queda persistido y aparece en historial con detalle"
  artifacts:
    - path: "src/server/storage/sqlite.ts"
      provides: "Esquema y repositorio de runs/steps/screenshots"
    - path: "src/server/api/history.ts"
      provides: "Endpoints de lista y detalle de historial"
    - path: "src/client/components/run/PreRunEstimateModal.tsx"
      provides: "Gate de confirmación de costo"
    - path: "src/client/components/history/RunHistoryList.tsx"
      provides: "Vista de runs previos"
    - path: "src/client/components/history/RunDetailView.tsx"
      provides: "Detalle con métricas y pasos"
  key_links:
    - from: "src/client/App.tsx"
      to: "src/server/api/history.ts"
      via: "fetch list/detail endpoints"
      pattern: "/api/history"
    - from: "src/server/index.ts"
      to: "src/server/storage/sqlite.ts"
      via: "guardar resultado al completar run"
      pattern: "saveRun"
---

<objective>
Convertir el pipeline técnico en una experiencia realmente utilizable: flujo completo, copy en español y persistencia consultable (per D-01 y D-02).

Purpose: Que QA pueda usarlo día a día sin fricción.
Output: Historial funcional, live timeline usable y modal de confirmación de costo.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/client/App.tsx
@src/server/index.ts
@src/server/runManager.ts
@.planning/phases/01-core-infrastructure-ui-shell/01-SUMMARY.md
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Persistencia SQLite y API de historial</name>
  <files>src/server/storage/sqlite.ts, src/server/api/history.ts, src/server/index.ts</files>
  <behavior>
    - Test 1: run completado se guarda con summary y pasos
    - Test 2: endpoint lista devuelve runs recientes ordenados
    - Test 3: endpoint detalle devuelve pasos + métricas
  </behavior>
  <action>Crear capa SQLite con esquema mínimo (`runs`, `steps`, `screenshots`) y endpoints REST para listar historial y ver detalle. Guardar al finalizar run (success/fail/aborted).</action>
  <verify>
    <automated>npm run test</automated>
  </verify>
  <done>El historial persiste entre reinicios y puede consultarse vía API.</done>
</task>

<task type="auto">
  <name>Task 2: UI live + modal de costo + historial/detalle en español</name>
  <files>src/client/App.tsx, src/client/components/run/PreRunEstimateModal.tsx, src/client/components/run/LiveStepTimeline.tsx, src/client/components/history/RunHistoryList.tsx, src/client/components/history/RunDetailView.tsx, src/client/components/common/EmptyState.tsx</files>
  <action>Refactorizar la UI para flujo usable: (1) modal de costo antes de ejecutar, (2) timeline live de pasos con estados claros, (3) historial navegable y detalle completo, (4) textos/errores en español consistentes per D-01, (5) estados vacíos y errores accionables.</action>
  <verify>
    <automated>npm run test</automated>
  </verify>
  <done>Flujo UX completo operativo: confirmar -> ejecutar -> seguir en vivo -> revisar historial.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Flujo Phase 3 usable end-to-end en español (modal costo + live timeline + historial + detalle)</what-built>
  <how-to-verify>
    1. Inicia app y carga escenario de 3 pasos.
    2. Verifica que aparece modal de costo y requiere confirmación.
    3. Ejecuta run con 1 MCP y confirma que timeline live actualiza estado por paso.
    4. Finaliza run y abre historial; valida métricas resumen.
    5. Abre detalle del run y confirma pasos, estados y evidencias.
    6. Fuerza un error (cap bajo o then incorrecto) y valida copy de error en español.
  </how-to-verify>
  <resume-signal>Escribe "approved" si todo está OK o lista hallazgos concretos.</resume-signal>
</task>

</tasks>

<verification>
- `npm run test`
- `npm run typecheck`
- Verificación humana de UX end-to-end
</verification>

<success_criteria>
- Costo pre-run es un gate real de ejecución.
- Vista live y historial son utilizables sin pasos ocultos.
- Mensajería y errores en español en todo el flujo principal.
</success_criteria>

<output>
After completion, create `.planning/phases/03-orchestrator-engine-single-mcp-run/03-04-SUMMARY.md`
</output>
