---
phase: 03-orchestrator-engine-single-mcp-run
plan: 03
type: execute
wave: 2
depends_on: [01, 02]
files_modified:
  - src/server/mcp/InstrumentedMcpClient.ts
  - src/server/validation/assertionsRunner.ts
  - src/server/storage/screenshots.ts
  - src/server/mcp/InstrumentedMcpClient.test.ts
autonomous: true
requirements: [VALID-01, VALID-02]
must_haves:
  truths:
    - "Cada tool call del MCP genera evidencia de screenshot"
    - "Los Then traducidos se validan con expect() independiente"
    - "Un fallo de expect marca el paso failed aunque MCP diga success"
  artifacts:
    - path: "src/server/mcp/InstrumentedMcpClient.ts"
      provides: "Proxy de tool calls con hooks de captura"
    - path: "src/server/validation/assertionsRunner.ts"
      provides: "Ejecución independiente de Playwright expect()"
    - path: "src/server/storage/screenshots.ts"
      provides: "Persistencia y correlación screenshot<->step"
  key_links:
    - from: "src/server/mcp/InstrumentedMcpClient.ts"
      to: "src/server/storage/screenshots.ts"
      via: "saveScreenshot(stepCorrelationId)"
      pattern: "saveScreenshot"
    - from: "src/server/validation/assertionsRunner.ts"
      to: "src/server/parser/index.ts"
      via: "step.assertion.playwrightCall"
      pattern: "assertion"
---

<objective>
Agregar evidencia y validación independientes para que el resultado sea confiable y realmente utilizable por QA (per D-02).

Purpose: Separar “lo que reporta MCP” de “lo que valida la plataforma”.
Output: Proxy instrumentado + runner de assertions + screenshots persistidos.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/server/parser/index.ts
@src/server/parser/translator.ts
@src/server/orchestrator/OrchestratorService.ts
@src/server/mcp/McpProcessManager.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Proxy InstrumentedMcpClient con captura por tool call</name>
  <files>src/server/mcp/InstrumentedMcpClient.ts, src/server/mcp/InstrumentedMcpClient.test.ts</files>
  <behavior>
    - Test 1: cada call produce trace + screenshotId
    - Test 2: errores de tool call conservan evidencia parcial
  </behavior>
  <action>Crear proxy que envuelve llamadas MCP, registra tool name/args/latency y dispara captura de screenshot con correlationId por paso. Asegurar que la captura ocurre tras cada tool call (per VALID-01).</action>
  <verify>
    <automated>npm run test -- src/server/mcp/InstrumentedMcpClient.test.ts</automated>
  </verify>
  <done>Existe trazabilidad completa por tool call y evidencia visual asociada.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Runner independiente de assertions Then</name>
  <files>src/server/validation/assertionsRunner.ts</files>
  <behavior>
    - Test 1: assertion esperada válida marca passed
    - Test 2: assertion inválida marca failed aunque MCP haya respondido success
  </behavior>
  <action>Ejecutar `step.assertion.playwrightCall` en un contexto controlado de Playwright expect(). Si falla, devolver resultado failed con mensaje claro en español per D-01. No depender del resultado reportado por MCP (per VALID-02).</action>
  <verify>
    <automated>npm run test</automated>
  </verify>
  <done>La plataforma determina pass/fail real para Then de forma independiente.</done>
</task>

<task type="auto">
  <name>Task 3: Persistencia de screenshots por paso</name>
  <files>src/server/storage/screenshots.ts</files>
  <action>Implementar persistencia de screenshots (path/blob + metadata) vinculada a runId/stepId/toolCallId para consumo posterior en historial/detalle. Diseñar API mínima para lectura posterior sin acoplar a Phase 5.</action>
  <verify>
    <automated>npm run test</automated>
  </verify>
  <done>Cada paso dispone de referencia de screenshot consultable tras finalizar el run.</done>
</task>

</tasks>

<verification>
- `npm run test`
- `npm run typecheck`
- Verificar que un Then mal esperado termina en failed por assertion runner
</verification>

<success_criteria>
- Se guarda screenshot por tool call.
- Then assertions impactan estado final de paso de forma independiente.
- Evidencia y trazas quedan listas para UI/historial.
</success_criteria>

<output>
After completion, create `.planning/phases/03-orchestrator-engine-single-mcp-run/03-03-SUMMARY.md`
</output>
