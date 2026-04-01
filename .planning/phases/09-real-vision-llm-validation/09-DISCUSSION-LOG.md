# Phase 09: Real Vision LLM Validation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `09-CONTEXT.md`.

**Date:** 2026-04-01
**Phase:** 09-real-vision-llm-validation
**Areas discussed (original):** Contrato JSON del validador visual, Política de ejecución del auditor, Origen de imagen y flujo de llamada, Sweep de Browserbase al arranque

---

## Update Session (2026-04-01) — Implementation vs Context Divergence Review

Phase 9 was already executed (3/3 plans, 125/125 tests). This session compared the original CONTEXT.md to the actual implementation and resolved 3 divergences.

### Validation Call Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Bug — should validate PASSED steps | Hallucination detection requires validating passed-claimed steps. Fix runManager condition. | ✓ |
| Intentional cost trade-off | Skip LLM for passed steps, only validate failures. | |
| Intentional — flip the logic | Validate PASSED steps only; failed steps are deterministic. | |

**User's choice:** Bug — should validate PASSED steps

**Notes:** runManager line ~547 has inverted condition (`!== "passed"`). The fix is `=== "passed"`. Hallucination detection must target passed steps to catch MCPs that falsely claim success.

---

### Tiered Model Config

| Option | Description | Selected |
|--------|-------------|----------|
| Expose both in RunConfig | Add lowCostAuditorModel + highAccuracyAuditorModel to RunConfig. | ✓ |
| Keep single auditorModel | Use auditorModel as high-tier; hardcode gpt-4.1-mini as low-tier. | |

**User's choice:** Expose both in RunConfig

**Follow-up — existing auditorModel field:**

| Option | Description | Selected |
|--------|-------------|----------|
| Remove it | Breaking change: replace with two fields. Cleaner API. | ✓ |
| Keep as alias | Backwards compatible alias for highAccuracyAuditorModel. | |

**User's choice:** Remove auditorModel entirely.

---

### StepValidation.tier Field

| Option | Description | Selected |
|--------|-------------|----------|
| Store only | Persist for debugging, not in scorecard UI. | |
| Store + expose in scorecard | Show "HIGH" badge on escalated verdicts in scorecard. | ✓ |

**User's choice:** Store + expose in scorecard

---

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
