# Phase 3: Orchestrator Engine & Single-MCP Run - Context

**Gathered:** 2026-03-30  
**Status:** Ready for planning

<domain>
## Phase Boundary

Probar el pipeline real sobre **1 MCP** de extremo a extremo: parseo Gherkin, orquestación paso a paso con historial conversacional, despacho de herramientas MCP, captura de screenshots, validación independiente de `Then`, streaming SSE, persistencia en SQLite e interfaz de ejecución/historial utilizable.

Fuera de alcance en esta fase: ejecución paralela multi-MCP (Phase 4), validación de visión tiered (Phase 5), CLI/export (Phase 6).

</domain>

<decisions>
## Decisions

- **D-01 (locked):** La UX visible al usuario debe estar en **español** (labels, estados, errores y mensajes de ejecución/historial).
- **D-02 (locked):** Priorizar **funcionalidad realmente usable** antes que cobertura teórica: flujo completo “pegar escenario → confirmar costo → ejecutar → ver progreso → revisar historial” sin pasos manuales ocultos.
- **D-03 (locked):** Mantener compatibilidad estricta con la base de Phase 1/2 (SSE, parser, harness, adapters, registry) sin reescrituras grandes.
- **D-04 (discretion):** Persistencia local en SQLite con esquema mínimo pero extensible para fases 4/5.

## Deferred Ideas

- Multi-MCP concurrente (Phase 4)
- Scorecard final de alucinación por visión (Phase 5)

</decisions>

<success_shape>
## Must-Have UX (usable real)

1. El usuario puede iniciar ejecución de 1 MCP desde UI con confirmación de costo y mensajes claros.
2. Durante la ejecución ve eventos en vivo y estado por paso sin congelamientos.
3. Al finalizar, el resultado queda persistido y recuperable desde historial.
4. Errores de pre-flight y límites (tokens/timeouts) se muestran con copy claro en español.

</success_shape>
