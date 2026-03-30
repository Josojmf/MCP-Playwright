# MCP Playwright Test Playground

> Plataforma local para ejecutar escenarios Gherkin contra múltiples servidores MCP, comparar resultados de automatización E2E, detectar señales de alucinación y analizar costo/tokens por ejecución.

---

## Tabla de contenido

- [1. Resumen ejecutivo](#1-resumen-ejecutivo)
- [2. Objetivo del proyecto](#2-objetivo-del-proyecto)
- [3. Arquitectura de alto nivel](#3-arquitectura-de-alto-nivel)
- [4. Stack tecnológico](#4-stack-tecnológico)
- [5. Estructura del repositorio](#5-estructura-del-repositorio)
- [6. Flujo funcional end-to-end](#6-flujo-funcional-end-to-end)
- [7. Backend API (Fastify)](#7-backend-api-fastify)
- [8. CLI `mcp-bench`](#8-cli-mcp-bench)
- [9. Frontend (React)](#9-frontend-react)
- [10. Persistencia y datos](#10-persistencia-y-datos)
- [11. Instalación y puesta en marcha](#11-instalación-y-puesta-en-marcha)
- [12. Variables de entorno](#12-variables-de-entorno)
- [13. Scripts de desarrollo](#13-scripts-de-desarrollo)
- [14. Uso guiado (UI)](#14-uso-guiado-ui)
- [15. Uso guiado (CLI)](#15-uso-guiado-cli)
- [16. Exportaciones e historial](#16-exportaciones-e-historial)
- [17. Calidad y pruebas](#17-calidad-y-pruebas)
- [18. Requisitos funcionales (trazabilidad)](#18-requisitos-funcionales-trazabilidad)
- [19. Estado actual y limitaciones conocidas](#19-estado-actual-y-limitaciones-conocidas)
- [20. Troubleshooting](#20-troubleshooting)
- [21. Roadmap y planificación](#21-roadmap-y-planificación)
- [22. Convenciones de contribución](#22-convenciones-de-contribución)
- [23. Licencia](#23-licencia)

---

## 1. Resumen ejecutivo

`mcp-playwright` es una herramienta **local-first** para evaluar la calidad de ejecución E2E de distintos proveedores MCP sobre el mismo escenario Gherkin.

El sistema permite:

- Definir un escenario (`.feature`) y base URL.
- Seleccionar uno o varios MCP targets.
- Estimar costo/tokens antes de ejecutar.
- Ejecutar y visualizar progreso en tiempo real vía **SSE**.
- Persistir resultados en **SQLite**.
- Consultar historial y exportar en JSON/CSV.
- Ejecutar en modo headless desde CLI para integración CI.

---

## 2. Objetivo del proyecto

El objetivo central es ofrecer una comparación **honesta, reproducible y trazable** de la automatización E2E basada en MCP, detectando diferencias de:

- estabilidad de ejecución,
- latencia,
- costo,
- tokens,
- y señales de posible alucinación.

Este repositorio prioriza iteración rápida en entorno local, observabilidad del flujo y trazabilidad por fases en `.planning/`.

---

## 3. Arquitectura de alto nivel

Arquitectura lógica:

1. **Frontend React**
   - Editor de escenario
   - Selector MCP
   - Panel live de ejecución
   - Historial y detalle de run

2. **Backend Fastify**
   - Endpoints REST para estimación, inicio de run, historial, export, screenshots
   - Endpoint SSE `/stream/:runId`
   - Coordinación de ejecución mediante `PhaseOneRunManager`

3. **Orquestador y parsing**
   - Parseo de Gherkin
   - Ejecución de pasos
   - Integración con proveedor LLM
   - Validación visual básica

4. **Persistencia local**
   - SQLite (`.data/runs.db`)
   - Metadatos de runs, pasos y screenshots

5. **CLI**
   - `mcp-bench run` para ejecución headless
   - `mcp-bench debug` para inspección de runs persistidos

---

## 4. Stack tecnológico

### Runtime y lenguaje

- Node.js + TypeScript

### Backend

- Fastify
- pino / pino-pretty
- better-sqlite3

### Frontend

- React 19
- Vite
- Tailwind CSS
- Radix / Base UI / Lucide

### Parsing / dominio

- `@cucumber/gherkin`
- `@cucumber/messages`

### Tooling

- `tsx` para ejecución TS en desarrollo y tests
- TypeScript (`tsc`) para chequeo estático
- `concurrently` para levantar frontend + backend

---

## 5. Estructura del repositorio

Estructura relevante (resumen):

- `src/client/`
  - UI principal (`App.tsx`)
  - componentes de historial y detalle
- `src/server/`
  - `index.ts` (servidor Fastify)
  - `api/history.ts` (historial/export/screenshots)
  - `runManager.ts` (coordinación de runs)
  - `orchestrator/` (ejecución de escenarios)
  - `storage/` (SQLite + screenshots)
- `src/cli/mcp-bench.ts`
  - comandos CLI `run` y `debug`
- `bin/mcp-bench.js`
  - bootstrap del binario npm
- `.planning/`
  - requisitos, roadmap, fases, resúmenes y verificaciones
- `.data/`
  - base de datos local de ejecuciones

---

## 6. Flujo funcional end-to-end

1. Usuario define `baseUrl`, escenario Gherkin y MCPs.
2. Frontend solicita estimación (`POST /api/runs/estimate`).
3. Usuario confirma y dispara ejecución (`POST /api/runs/start`).
4. Frontend se suscribe por SSE (`/stream/:runId`).
5. Backend emite eventos de progreso por paso/MCP.
6. Resultados se persisten en SQLite.
7. Frontend consulta historial y detalle (`/api/history*`).
8. Usuario exporta resultados (JSON/CSV).

---

## 7. Backend API (Fastify)

Servidor en `src/server/index.ts`.

### Endpoints principales

- `GET /`
  - health y metadata de HTTP/2.

- `POST /api/runs/estimate`
  - calcula estimación de tokens/costo.

- `POST /api/runs/start`
  - inicia run y devuelve streamPath.

- `GET /stream/:runId`
  - SSE de eventos de ejecución.

- `GET /api/history`
  - lista paginada de runs.

- `GET /api/history/:id`
  - detalle completo de un run.

- `GET /api/history/:id/export.json`
  - export JSON detallado.

- `GET /api/history/:id/export.csv`
  - export CSV del run.

- `GET /api/history/export.csv`
  - export CSV de múltiples runs (resumen).

- `GET /api/history/cost/total`
  - costo acumulado total.

- `GET /api/screenshots/:id`
  - contenido de screenshot por id.

### SSE

Características implementadas:

- cabeceras de streaming (`text/event-stream`, `X-Accel-Buffering: no`),
- heartbeats periódicos,
- cierre limpio al desconectar cliente.

---

## 8. CLI `mcp-bench`

Binario declarado en `package.json`:

- `mcp-bench` → `bin/mcp-bench.js` → `src/cli/mcp-bench.ts`

### Comandos

- `mcp-bench run --url <url> --feature <file.feature> [--mcp a,b] [--tokenCap 12000]`
- `mcp-bench debug [--runId <runId>] [--mcp <filter>]`

### Comportamiento

- `run` produce JSON estructurado por stdout.
- `run` retorna exit code `0` o `1` según resultados.
- `debug` imprime resumen legible de pasos para runs persistidos.

---

## 9. Frontend (React)

UI principal en `src/client/App.tsx`.

### Capacidades visibles

- Editor de escenario con carga de archivo `.feature`.
- Selector de MCP targets.
- Estimación previa con confirmación.
- Consola live de eventos.
- Progreso por MCP (pasos/tokens/latencia red).
- Historial de runs y detalle.
- Dashboard de costo acumulado.
- Tema dark/light.

---

## 10. Persistencia y datos

Se usa SQLite local (`.data/runs.db`) con tablas de:

- `runs`
- `steps`
- `screenshots`

Persistencia orientada a auditoría operativa:

- estado, tokens, costo, timestamps,
- validación por paso,
- relación run-step-screenshot.

---

## 11. Instalación y puesta en marcha

### Requisitos

- Node.js 20+ (recomendado 22+)
- npm

### Instalación

1. Clonar repositorio.
2. Instalar dependencias.
3. Levantar entorno de desarrollo.

---

## 12. Variables de entorno

El backend soporta variables opcionales:

- `ENABLE_HTTP2`
  - `true` para habilitar modo HTTP/2 en Fastify.
- `HTTP2_TLS_KEY`
  - contenido/ruta de llave TLS (si aplica).
- `HTTP2_TLS_CERT`
  - contenido/ruta de certificado TLS (si aplica).
- `DATA_DIR`
  - directorio de datos/snapshots para storage de screenshots.

> Nota: en entorno local típico, puede ejecutarse sin configuración TLS especial.

---

## 13. Scripts de desarrollo

Definidos en `package.json`:

- `npm run dev`
  - levanta frontend y backend en paralelo.
- `npm run build`
  - build frontend.
- `npm run typecheck`
  - chequeo estricto TypeScript sin emisión.
- `npm test`
  - suite de pruebas TS.
- `npm run cli`
  - invoca wrapper de CLI.

---

## 14. Uso guiado (UI)

1. Ejecuta `npm run dev`.
2. Abre la app en navegador.
3. Define `Base URL`.
4. Pega o sube un `.feature` válido.
5. Selecciona MCPs a comparar.
6. Ajusta `Token Cap`.
7. Clic en **Estimar y ejecutar**.
8. Confirma ejecución.
9. Observa progreso y consola live.
10. Revisa historial y detalle al finalizar.

---

## 15. Uso guiado (CLI)

### Run headless

Ejemplo conceptual:

- ejecutar `mcp-bench run` con URL y archivo `.feature` válido.
- consumir JSON en pipeline CI.

### Debug de run persistido

Ejemplo conceptual:

- ejecutar `mcp-bench debug` para inspeccionar un run.
- filtrar por MCP si es necesario.

---

## 16. Exportaciones e historial

### Desde UI

En detalle de run:

- **Export JSON**
- **Export CSV**

### Desde API

- JSON detallado por run
- CSV por run
- CSV resumen de runs (rango opcional por fecha)

---

## 17. Calidad y pruebas

Comandos base de calidad:

- typecheck: validación de tipos
- test: pruebas unitarias/integración del dominio

El repositorio incluye pruebas en módulos críticos:

- parser Gherkin,
- orquestación,
- almacenamiento SQLite,
- validación visual,
- API de historial,
- harness de seguridad (timeout/loop/tokens),
- adapters/provider factory.

---

## 18. Requisitos funcionales (trazabilidad)

La especificación principal está en:

- `.planning/REQUIREMENTS.md`

Incluye cobertura de requisitos v1/v2 por áreas:

- infraestructura,
- parser,
- orquestación LLM,
- registry MCP,
- ejecución,
- validación anti-alucinación,
- UI,
- CLI,
- historial/export.

---

## 19. Estado actual y limitaciones conocidas

Estado funcional general: **alto**, con trazabilidad de fases en `.planning/phases`.

Limitaciones observables en estado actual del repositorio:

1. Existe desalineación entre “completado” declarado en planning y estructura de algunos planes legacy.
2. La calidad del modo `debug` de CLI puede requerir mayor detalle de trazas por tool-call para auditoría profunda.
3. El formato CSV puede requerir evolución adicional para scorecards por MCP según criterios estrictos de reporting.

Estas limitaciones no bloquean uso local base, pero sí son relevantes para endurecimiento de CI/auditoría.

---

## 20. Troubleshooting

### Error de parseo Gherkin en CLI

Si ves errores tipo:

- `expected ... got 'Given ...'`

revisa que el archivo `.feature` tenga estructura válida, por ejemplo:

- cabecera `Feature:`
- al menos un `Scenario:`
- pasos `Given/When/Then` indentados dentro del escenario

### SSE se corta o no emite

- verificar backend activo,
- comprobar `runId` existente,
- revisar logs de servidor,
- validar que no haya proxy intermedio cortando streams.

### Historial vacío

- confirmar que hubo runs finalizados,
- revisar `.data/runs.db`,
- inspeccionar errores backend en consola.

---

## 21. Roadmap y planificación

Artefactos de planificación:

- `.planning/REQUIREMENTS.md`
- `.planning/phases/**`
- resúmenes por plan/fase y verificaciones puntuales

Se recomienda mantener trazabilidad consistente entre:

- roadmap,
- planes estructurados,
- summaries,
- verification reports.

---

## 22. Convenciones de contribución

Sugerencias operativas:

1. Cambios pequeños y atómicos.
2. Ejecutar `npm run typecheck` y `npm test` antes de merge.
3. Mantener sincronía entre código y `.planning/`.
4. Documentar decisiones técnicas relevantes en el historial de fase.

---

## 23. Licencia

Actualmente `package.json` declara licencia `ISC`.

---

## Anexo A — Ejemplo mínimo de `.feature` válido

```gherkin
Feature: Búsqueda
  Scenario: Buscar un término
    Given User is on google page
    When User search for "Cucumber BDD"
    Then User should see results related to "Cucumber BDD"
```

> Importante: aunque los pasos estén en inglés natural, el parser requiere cabeceras Gherkin (`Feature`, `Scenario`) para que el archivo sea válido.

---

## Anexo B — Referencias internas útiles

- `src/server/index.ts`
- `src/server/api/history.ts`
- `src/server/runManager.ts`
- `src/server/orchestrator/OrchestratorService.ts`
- `src/cli/mcp-bench.ts`
- `src/client/App.tsx`
- `.planning/REQUIREMENTS.md`
