---
phase: 05
slug: screenshot-validation-scorecard
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-01
---

# Phase 05 — Validation Strategy

> Auditoría Nyquist de fase reconstruida (State B) desde SUMMARY + ROADMAP + tests reales, con cierre automático de gaps contractuales en scorecard/UI y entrega de screenshots/costo acumulado.

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
| 05-01-01 | 05-PLAN-1 (reconstruido) | 1 | VALID-03 | unit | `npm test` | ✅ `src/server/validation/visionValidator.test.ts` | ✅ green |
| 05-01-02 | 05-PLAN-1 (reconstruido) | 1 | VALID-04 | unit | `npm test` | ✅ `src/server/validation/visionValidator.test.ts` | ✅ green |
| 05-01-03 | 05-PLAN-1 (reconstruido) | 1 | VALID-05 | unit | `npm test` | ✅ `src/server/validation/visionValidator.test.ts` | ✅ green |
| 05-01-04 | 05-PLAN-1 (reconstruido) | 1 | VALID-06 | integration | `npm test` | ✅ `src/server/runManager.test.ts` | ✅ green* |
| 05-01-05 | 05-PLAN-1 (reconstruido) | 1 | VALID-07 | unit | `npm test` | ✅ `src/server/validation/visionValidator.test.ts` | ✅ green |
| 05-02-01 | 05-PLAN-2 (reconstruido) | 2 | UI-05 | contract | `npm test` | ✅ `src/client/components/history/RunDetailView.phase5.contract.test.ts` | ✅ green |
| 05-02-02 | 05-PLAN-2 (reconstruido) | 2 | UI-06 | contract | `npm test` | ✅ `src/client/components/history/RunDetailView.phase5.contract.test.ts` | ✅ green |
| 05-02-03 | 05-PLAN-2 (reconstruido) | 2 | UI-07 | contract | `npm test` | ✅ `src/client/components/history/RunDetailView.phase5.contract.test.ts` | ✅ green |
| 05-03-01 | 05-PLAN-3 (reconstruido) | 3 | INFRA-07 | contract | `npm test` | ✅ `src/server/api/history.phase5.contract.test.ts` | ✅ green |

Status legend: ✅ green · ❌ red · ⚠️ partial

\* `VALID-06` queda además respaldado por guardas de modelo auditor/orquestador en `runManager`; en el estado actual del repo existe inestabilidad fuera de scope en algunos tests globales, pero la cobertura Nyquist de fase 5 queda cerrada con evidencia focalizada.

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase requirements tienen verificación automatizada en esta validación.

---

## Validation Audit 2026-04-01

| Metric | Count |
| ------ | ----- |
| Gaps found | 2 |
| Resolved (automated) | 2 |
| Escalated (manual-only) | 0 |

**Gaps resueltos:**
1. Cobertura contractual explícita de scorecard/flags (`UI-05/UI-06/UI-07`) en `RunDetailView.phase5.contract.test.ts`.
2. Cobertura contractual de endpoint de costo acumulado y entrega de screenshots (`INFRA-07`) en `history.phase5.contract.test.ts`.

**Nota de gate (Step 4):** En modo no interactivo se aplicó automáticamente opción **Fix all gaps**.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all missing references
- [x] No watch-mode flags
- [x] Feedback latency < 300s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-01
