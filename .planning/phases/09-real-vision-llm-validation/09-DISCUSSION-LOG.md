# Phase 09: Real Vision LLM Validation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `09-CONTEXT.md`.

**Date:** 2026-04-01
**Phase:** 09-real-vision-llm-validation
**Areas discussed:** Contrato JSON del validador visual, Política de ejecución del auditor, Origen de imagen y flujo de llamada, Sweep de Browserbase al arranque

---

## Contrato JSON del validador visual

| Option | Description | Selected |
|--------|-------------|----------|
| Estricto mínimo | Campos obligatorios: `verdict`, `confidence`, `rationale`; rechazar fuera de schema | |
| Estricto extendido | Además exigir `needsReview` y `hallucinated` desde el modelo | ✓ |
| Flexible | Aceptar JSON parcial y completar defaults localmente | |

**User's choice:** Estricto extendido
**Notes:** Mantener parseo estricto y fallback controlado cuando la respuesta no sea JSON válido.

---

## Política de ejecución del auditor

| Option | Description | Selected |
|--------|-------------|----------|
| Determinista donde aplique | Forzar configuración determinista + JSON estructurado en OpenAI/OpenRouter/Azure; equivalente estricto en Claude | ✓ |
| Uniforme blando | `temperature=0` para todos sin forzar JSON estricto | |
| Flexible por proveedor | Cada adapter decide y se valida al final | |

**User's choice:** Determinista donde aplique
**Notes:** Se prioriza consistencia de salida entre proveedores.

---

## Origen de imagen y flujo de llamada

| Option | Description | Selected |
|--------|-------------|----------|
| Fallback seguro + run continúa | Si falla lectura de screenshot, devolver `uncertain` + `needsReview=true` y seguir | ✓ |
| Fallar el step | Marcar step failed por falta de evidencia visual | |
| Reintentar y abortar MCP | Retry de lectura y abortar en segundo fallo | |

**User's choice:** Fallback seguro + run continúa
**Notes:** No castigar el resultado técnico del step por fallo de evidencia visual.

---

## Sweep de Browserbase al arranque

| Option | Description | Selected |
|--------|-------------|----------|
| Best-effort resiliente | Nunca bloquear arranque; warning por fallo parcial + resumen final | ✓ |
| Fail-fast | Bloquear arranque ante error de listado/delete | |
| Silencioso | Ignorar fallos individuales con log mínimo | |

**User's choice:** Best-effort resiliente
**Notes:** Política operativa no disruptiva para entornos mixtos con/sin Browserbase.

---

## the agent's Discretion

- Definir `maxTokens` por llamado de auditor.
- Decidir si persistir simultáneamente flags del modelo y flags recalculados por regla local.

## Deferred Ideas

- None.
