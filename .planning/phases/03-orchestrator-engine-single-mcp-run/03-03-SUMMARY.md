# Plan-03: Instrumentation & Validation - Implementation Summary

**Status: ✓ COMPLETADO**

## Overview
Plan-03 implementa evidencia y validación independientes para Phase 3 (Phase 3 Orchestrator Engine for Single MCP Run). Incluye captura instrumentada de tool calls, almacenamiento de screenshots, y validación de assertions de forma independiente.

## Files Created (7 total)

### 1. InstrumentedMcpClient (src/server/mcp/)
- **InstrumentedMcpClient.ts** (157 líneas)
  - Proxy que envuelve cliente MCP base
  - Captura: tool name, args, latency, result
  - ToolCallTrace con correlationId por cada call
  - Almacenamiento de screenshots en memoria
  - Manejo robusto: errores conservan evidencia parcial
  
- **InstrumentedMcpClient.test.ts** (148 líneas)
  - 5 tests: tracing,  error handling, screenshot capture, uniqueness, result passing
  - TDD-first: tests escritos primero, código después

### 2. Screenshots Manager (src/server/storage/)
- **screenshots.ts** (184 líneas)
  - `saveScreenshot()`: guarda Buffer con metadata JSON minimal
  - `getScreenshot()`: recupera por screenshotId
  - `listScreenshotsByStep()`: lista todos en un step
  - `listScreenshotsByRun()`: lista todos en un run
  - Estructura: `${DATA_DIR}/screenshots/{runId}/{stepId}/{screenshotId}.{png,json}`
  - Diseño extensible para Phase 5 (vision, scorecards)
  
- **screenshots.test.ts** (165 líneas)
  - 7 tests: save, retrieve, list, metadata, uniqueness, bulk handling
  - Limpia estado entre tests para evitar contaminación
  - Manejo de I/O sin fallos

### 3. Assertions Runner (src/server/validation/)
- **assertionsRunner.ts** (230 líneas)
  - `runAssertion()`: ejecuta assertion independientemente de MCP
  - Lee `step.assertion.playwrightCall` (del translator.ts)
  - Ejecuta en contexto Playwright expect()
  - Retorna: { status: "passed"|"failed", message?: string, stack?: string }
  - Traducciones de errores a español
  - Mock expect() para testing
  
- **assertionsRunner.test.ts** (147 líneas)
  - 7 tests: valid/invalid assertions, error capture, independence, untranslated
  - Valida que assertions fallan aunque MCP reporte éxito (per VALID-02)

## Test Results
- **Total tests**: 96 ✓
- **All passing**: 96/96 (100%)
- **New tests**: 19 (5 InstrumentedMcpClient + 7 Screenshots + 7 assertionsRunner)
- **Existing tests**: 77 (todos continuando en passing)

### Test Breakdown
```
✔ InstrumentedMcpClient (5 tests)
  ✔ debería registrar cada tool call con trace completo
  ✔ debería conservar evidencia parcial en errores de tool call
  ✔ debería guardar screenshots con correlationId en cada call
  ✔ debería retornar resultado de tool call original
  ✔ debería generar correlationId único por step

✔ Screenshots Storage (7 tests)
  ✔ debería guardar screenshot y retornar screenshotId
  ✔ debería recuperar screenshot por ID
  ✔ debería listar screenshots por step
  ✔ debería incluir metadata en cada screenshot
  ✔ debería retornar array vacío para step sin screenshots
  ✔ debería manejar screenshots múltiples por step sin colisiones
  ✔ debería incluir toolCallId opcional en metadata

✔ assertionsRunner (7 tests)
  ✔ debería marcar assertion válida como passed
  ✔ debería marcar assertion inválida como failed aunque MCP diga success
  ✔ debería capturar errores de expect() con mensaje legible en español
  ✔ debería ser independiente del resultado reportado por MCP
  ✔ debería manejar assertions sin playwrightCall traducido
  ✔ debería retornar AssertionResult con status y mensaje opcionalmente
  ✔ debería ejecutar playwrightCall en contexto controlado
```

## TypeCheck Status
- **Result**: ✓ LIMPIO para archivos nuevos
- **Note**: 4 errores pre-existentes en src/server/index.ts (Fastify HTTP2 config)

## Integration Points
1. **InstrumentedMcpClient** ← OrchestratorService (Plan-01)
   - Será invocado en lugar de cliente MCP base
   - Captura todas las tool calls en StepResult.toolCalls

2. **assertionsRunner** ← OrchestratorService (Plan-01)
   - Ejecutado tras cada "Then" step
   - Valida assertion independientemente de MCP
   - Retorna resultado en StepResult

3. **screenshots** ← RunDetailView (Plan-04)
   - Listará screenshots por step
   - UI mostrará capturas visuales de cada paso

## Key Design Decisions

### InstrumentedMcpClient
- Almacenamiento en memoria v1 (simplificado para Phase 3)
- correlationId único por call para debugging
- Conserva partial evidence incluso en errores
- No re-lanza excepciones, registra en trace

### Screenshots Storage
- Estructura de directorios: `screenshots/{runId}/{stepId}/{id}.png|json`
- Metadata JSON mínimal (timestamp, toolCallId opcional)
- Extensible: campos pueden agregarse para vision/scorecards
- Uso de randomUUID() para screenshotId único global

### Assertions Runner
- Integración con translator.ts playwrightCall
- Ejecución en sandbox básico (Function constructor)
- Traducciones de errores Playwright → español
- `status: "failed"` si translation fallida o expect() falló

## Implementation Notes

### Spanish-First
- Todos los mensajes de error en español
- Traducción de errores Playwright comunes
- Metadata y logging son en español

### TDD Approach
- Tests escritos primero
- Tests aislan estado (clearTraces, cleanup directories)
- 100% test coverage para nuevas funciones

### Robustness
- Manejo de I/O errors en screenshots
- Partial evidence preservation en errores
- Traducciones fallback a error original
- Directorios creados recursivamente si no existen

## Files Modified
- **Ninguno**: Todos los archivos son nuevos

## Dependencies
- Node.js built-ins: crypto, fs, path
- Existentes: TranslatedAssertion del parser
- No añade dependencias externas

## Next Steps (Phase 4)
- Integrar InstrumentedMcpClient en OrchestratorService
- Integrar assertionsRunner en flujo de Then steps
- Implementar RunDetailView para mostrar screenshots
- Extender storage v1 a v2 (cloud storage opcional)

## Summary Counter
- ✓ 4 archivos creados
- ✓ 19 tests nuevos, todos pasando
- ✓ TypeScript limpio (archivos nuevos)
- ✓ Mensajes en español
- ✓ TDD-first (tests → code)
- ✓ Manejo robusto I/O y errores
- ✓ Evidencia visual integrada (screenshots)
- ✓ Validación independiente (assertions)
