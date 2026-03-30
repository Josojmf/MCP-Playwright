---
phase: 03-orchestrator-engine-single-mcp-run
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/server/mcp/McpProcessManager.ts
  - src/server/mcp/preflight.ts
  - src/server/mcp/stalenessRecovery.ts
  - src/server/mcp/McpProcessManager.test.ts
autonomous: true
requirements: [EXEC-03, EXEC-04, EXEC-05]
must_haves:
  truths:
    - "El proceso MCP se crea y limpia sin fugas"
    - "Pre-flight bloquea ejecución si versión Playwright es incompatible"
    - "Errores de ARIA stale-ref reintentan con snapshot fresco"
  artifacts:
    - path: "src/server/mcp/McpProcessManager.ts"
      provides: "spawn/health-check/cleanup lifecycle"
    - path: "src/server/mcp/preflight.ts"
      provides: "validación de versiones y capacidades"
    - path: "src/server/mcp/stalenessRecovery.ts"
      provides: "clasificación y retry para stale refs"
  key_links:
    - from: "src/server/mcp/preflight.ts"
      to: "src/shared/registry/index.ts"
      via: "entry/tool namespace/capabilities"
      pattern: "MCP_REGISTRY"
    - from: "src/server/mcp/McpProcessManager.ts"
      to: "src/server/orchestrator/OrchestratorService.ts"
      via: "client lifecycle before/after run"
      pattern: "createClient|dispose"
---

<objective>
Construir runtime robusto del MCP para un uso real en desarrollo local: pre-flight duro, gestión de procesos y recuperación de stale refs (per D-02).

Purpose: Evitar ejecuciones frágiles o colgadas antes de pasar a paralelo.
Output: Runtime MCP confiable con cobertura automatizada.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@src/shared/registry/index.ts
@src/shared/harness/withTimeout.ts
@src/server/index.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Lifecycle manager de proceso MCP</name>
  <files>src/server/mcp/McpProcessManager.ts, src/server/mcp/McpProcessManager.test.ts</files>
  <behavior>
    - Test 1: spawn devuelve PID único y estado healthy
    - Test 2: dispose limpia proceso en success/error
    - Test 3: crash del proceso marca run como abortado con motivo legible
  </behavior>
  <action>Implementar gestor de proceso con spawn, health-check, stop y finally cleanup. Exponer métricas mínimas (pid, startedAt, crashed). Mensajes de error claros en español per D-01.</action>
  <verify>
    <automated>npm run test -- src/server/mcp/McpProcessManager.test.ts</automated>
  </verify>
  <done>El lifecycle se prueba en escenarios happy-path y crash-path sin procesos colgados.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Pre-flight de compatibilidad y capacidades</name>
  <files>src/server/mcp/preflight.ts</files>
  <behavior>
    - Test 1: bloquea run ante mismatch de versión Playwright
    - Test 2: retorna diagnóstico con causa exacta y acción sugerida
  </behavior>
  <action>Crear preflight que valida versión Playwright local vs MCP target, negociación mínima de capacidades y disponibilidad de comandos. Si falla, bloquear run antes de ejecutar pasos (per EXEC-04).</action>
  <verify>
    <automated>npm run test</automated>
  </verify>
  <done>Los fallos de compatibilidad se detectan upfront con error legible.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Recovery de ARIA stale refs</name>
  <files>src/server/mcp/stalenessRecovery.ts</files>
  <behavior>
    - Test 1: clasifica error stale-ref correctamente
    - Test 2: hace retry con snapshot nuevo una vez
  </behavior>
  <action>Implementar helper para detectar stale-ref (`@playwright/mcp`) y reintentar el paso con snapshot fresco sin contabilizarlo como fallo benchmark (per EXEC-05).</action>
  <verify>
    <automated>npm run test</automated>
  </verify>
  <done>Errores stale-ref no degradan resultados injustamente y quedan trazados.</done>
</task>

</tasks>

<verification>
- `npm run test`
- `npm run typecheck`
- Smoke de crash-control: proceso MCP muerto no deja recursos huérfanos
</verification>

<success_criteria>
- Cualquier mismatch de pre-flight bloquea ejecución con mensaje claro.
- Lifecycle MCP no deja procesos zombies.
- stale-ref queda cubierto con retry controlado.
</success_criteria>

<output>
After completion, create `.planning/phases/03-orchestrator-engine-single-mcp-run/03-02-SUMMARY.md`
</output>
