---
phase: 06
slug: cli-export
status: partial
nyquist_compliant: false
wave_0_complete: true
created: 2026-04-01
---

# Phase 06 — Validation Strategy

> Auditoría Nyquist de fase reconstruida (State B) desde SUMMARY + ROADMAP + verificación existente. Se cerró cobertura contractual automatizable y se escalaron gaps de implementación diferidos a Fase 10.

---

## Test Infrastructure

| Property | Value |
| -------- | ----- |
| **Framework** | node:test vía `tsx --test` |
| **Config file** | none (script en `package.json`) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test ; npm run typecheck` |
| **Estimated runtime** | ~4-6 segundos |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test ; npm run typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 300 segundos

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
| ------- | ---- | ---- | ----------- | --------- | ----------------- | ----------- | ------ |
| 06-01-01 | 06-PLAN-1 (reconstruido) | 1 | CLI-01 | contract | `npm test` | ✅ `src/cli/mcp-bench.phase6.contract.test.ts` | ✅ green |
| 06-01-02 | 06-PLAN-1 (reconstruido) | 1 | CLI-02 | contract | `npm test` | ✅ `src/cli/mcp-bench.phase6.contract.test.ts` | ✅ green |
| 06-02-01 | 06-PLAN-2 (reconstruido) | 2 | CLI-03 | verification + contract | `npm test` | ✅ `src/cli/mcp-bench.phase6.contract.test.ts` + `06-VERIFICATION.md` | ⚠️ partial |
| 06-03-01 | 06-PLAN-3 (reconstruido) | 3 | HIST-02 | contract | `npm test` | ✅ `src/server/api/history.phase6.contract.test.ts` | ⚠️ partial |
| 06-00-01 | dependency (Phase 4 complete) | 0 | REGISTRY-04 | unit (Wave 0) | `npm test` | ✅ `src/shared/registry/index.test.ts` | ✅ green |

Status legend: ✅ green · ❌ red · ⚠️ partial

---

## Wave 0 Requirements

`REGISTRY-04` se considera cubierto por dependencia completada de Phase 4 (entrada `mcp-playwright` verificada en `registry/index.test.ts`).

---

## Manual-Only Verifications

### 1) CLI-03 — Traza debug completa por tool call

**Test:** Ejecutar `mcp-bench debug --mcp <name>` sobre un run con tool calls reales.
**Expected:** Mostrar por tool call nombre, argumentos, respuesta y latencia; además flags `HALLUCINATED`/`NEEDS_REVIEW` claros.
**Why human/escalated:** La implementación actual imprime resumen por step pero no recorre `toolCalls` completos; requiere cambio de implementación (diferido a Phase 10).

### 2) HIST-02 — CSV scorecard por MCP

**Test:** Exportar CSV y validar una fila por MCP con columnas `passRate`, `hallucinationCount`, `totalTokens`, `totalCostUsd`.
**Expected:** Formato importable en hoja de cálculo con columnas de scorecard.
**Why human/escalated:** La implementación actual exporta por-step o por-run; requiere refactor de `buildSummaryCsv()` (diferido a Phase 10).

---

## Validation Audit 2026-04-01

| Metric | Count |
| ------ | ----- |
| Gaps found | 2 |
| Resolved (automated) | 0 |
| Escalated (manual/impl) | 2 |

**Gaps escalados:**

1. `CLI-03` — `runDebug()` sin traza de `toolCalls` detallada.
2. `HIST-02` — CSV no cumple contrato de scorecard por MCP.

**Nota de gate (Step 4):** En modo no interactivo se aplicó automáticamente opción **Fix all gaps**; los gaps que requieren cambios de implementación se escalaron y quedan marcados como parciales.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify o escalado justificado
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers dependency requirement (`REGISTRY-04`)
- [x] No watch-mode flags
- [x] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** partial (awaiting Phase 10 gap closure)
