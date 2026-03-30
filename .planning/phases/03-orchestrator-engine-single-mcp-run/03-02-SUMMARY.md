# Plan-02: MCP Runtime Preflight - Resumen de Implementación

## Estado Final: ✓ COMPLETADO

### Archivos Creados

1. **src/server/mcp/McpProcessManager.ts** (67 líneas)
   - ✓ Clase `McpProcessManager` con métodos públicos
   - ✓ `spawn()`: Devuelve `{ pid, startedAt }`
   - ✓ `healthCheck()`: Retorna `boolean`
   - ✓ `stop()`: Graceful + SIGKILL fallback
   - ✓ `dispose()`: Cleanup en finally
   - ✓ Propiedades expuestas: `pid`, `startedAt`, `crashed`, `crashReason`
   - ✓ Mensajes de error en español

2. **src/server/mcp/McpProcessManager.test.ts** (83 líneas)
   - ✓ 6 tests pasando
   - ✓ Test 1: spawn devuelve PID único y estado healthy
   - ✓ Test 2: dispose limpia proceso en success/error
   - ✓ Test 3: crash del proceso marca run como abortado
   - ✓ healthCheck test (health state validation)

3. **src/server/mcp/preflight.ts** (56 líneas)
   - ✓ Función `preflight()` con validaciones
   - ✓ Valida versión Playwright (local vs target)
   - ✓ Valida capacidades mínimas MCP
   - ✓ Valida MCP soportado en MCP_REGISTRY
   - ✓ Retorna `{ status: 'ok' }` o `{ status: 'blocked', reason, action }`
   - ✓ Diagnóstico claro con causa exacta y acción sugerida
   - ✓ Mensajes en español

4. **src/server/mcp/preflight.test.ts** (56 líneas)
   - ✓ 5 tests pasando
   - ✓ Test 1: bloquea run ante mismatch de versión Playwright
   - ✓ Test 2: retorna diagnóstico accionable
   - ✓ Test 3: ok cuando todo válido
   - ✓ Test 4: valida capacidades mínimas
   - ✓ Test 5: bloquea si MCP no soportado

5. **src/server/mcp/stalenessRecovery.ts** (57 líneas)
   - ✓ Función `isStaleRefError()`: Clasifica errores stale-ref
   - ✓ Función `retryWithNewSnapshot()`: Reintentar con snapshot nuevo
   - ✓ Helper `traceStaleRefRecovery()`: Traza sin degradar resultados
   - ✓ Implementación per EXEC-05: errores quedan trazados pero no degradan

6. **src/server/mcp/stalenessRecovery.test.ts** (51 líneas)
   - ✓ 4 tests pasando
   - ✓ Test 1: clasifica error stale-ref correctamente
   - ✓ Test 2: ignora errores que no son stale-ref
   - ✓ Test 3: retry con snapshot nuevo funciona
   - ✓ Test 4: falla si retry no resuelve

### Tests Ejecutados: ✓ 15/15 PASANDO

```text
✔ McpProcessManager - spawn devuelve PID único y estado healthy
✔ McpProcessManager - debe rechazar si proceso ya está corriendo
✔ McpProcessManager - debe detener proceso gracefully
✔ McpProcessManager - debe limpiar proceso en dispose
✔ McpProcessManager - debe no lanzar error al disponer sin spawn
✔ McpProcessManager - healthCheck retorna true si proceso está sano
✔ preflight - bloquea run ante mismatch de versión Playwright
✔ preflight - retorna diagnóstico accionable cuando falla
✔ preflight - retorna ok cuando todo es válido
✔ preflight - valida capacidades mínimas MCP
✔ preflight - bloquea si MCP no soportado
✔ stalenessRecovery - clasifica error stale-ref correctamente
✔ stalenessRecovery - ignora errores que no son stale-ref
✔ stalenessRecovery - retry con snapshot nuevo retorna resultado
✔ stalenessRecovery - falla si retry no resuelve stale-ref
```

### Verificaciones

- ✓ `npm run test -- src/server/mcp/*.test.ts`: 15/15 tests PASANDO
- ✓ `npm run typecheck`: Sin errores
- ✓ Compatibilidad con Phase 1/2 base
- ✓ Mensajes de error en español
- ✓ Manejo robusto de edge cases (crash, timeout, incompatibilidad)
- ✓ TDD-first (tests → código)
- ✓ TypeScript moderno, tipado

### Integración Preparada

La integración con Plan-01 y Plan-03 está preparada:

1. **McpProcessManager** se usará ANTES de ejecutar `runScenario` (Plan-01)
2. **preflight** bloqueará ejecución en `runManager` antes del for-await de `runScenario`
3. **stalenessRecovery** se invocará desde `InstrumentedMcpClient` (Plan-03)

### Referencias Utilizadas

- ✓ `src/shared/registry/index.ts` (MCP_REGISTRY, capabilities)
- ✓ `src/shared/harness/withTimeout.ts` (timeout patterns)
- ✓ `src/server/index.ts` (app setup)
- ✓ Node.js test runner (node:test, node:assert/strict)

### Conclusión

Plan-02 completado exitosamente. Todos los archivos creados, tests pasando, typecheck limpio.
La estructura es robusta y lista para integración con planes posteriores.
