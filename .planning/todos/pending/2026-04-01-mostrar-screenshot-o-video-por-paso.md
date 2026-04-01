---
created: 2026-04-01T15:33:03.736Z
title: Mostrar screenshot o video por paso
area: general
files:
  - src/client/components/run/*
  - src/server/storage/screenshots.ts
  - src/server/orchestrator/OrchestratorService.ts
---

## Problem

Actualmente la ejecución no muestra, en cada paso, una evidencia visual inmediata de verificación. Esto dificulta validar rápidamente si la acción del MCP realmente ocurrió, especialmente cuando hay discrepancias entre el resultado textual y el estado real de la UI.

## Solution

Agregar un modo de evidencia visual por paso con dos alternativas:

1. Mostrar screenshot de verificación en cada step del timeline.
2. Opcionalmente abrir una ventana/panel pequeño con reproducción de video de ejecución.

Sugerencias de implementación:

- Mantener screenshot como default por costo/rendimiento.
- Tratar video como feature opcional con toggle por run.
- Guardar referencia visual por `stepId` para trazabilidad en debug/export.
