---
phase: 01
slug: core-infrastructure-ui-shell
status: partial
nyquist_compliant: false
wave_0_complete: true
created: 2026-04-01
---

# Phase 01 — Validation Strategy

> Auditoría Nyquist reconstruida desde artefactos de fase y pruebas existentes.

---

## Test Infrastructure

| Property | Value |
| -------- | ----- |
| **Framework** | node:test vía `tsx --test` |
| **Config file** | none (convención por script en `package.json`) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test ; npm run typecheck` |
| **Estimated runtime** | ~2-4 segundos |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test ; npm run typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 240 segundos

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
| ------- | ---- | ---- | ----------- | --------- | ----------------- | ----------- | ------ |
| 01-01-01 | 02-PLAN-1-sse-server | 1 | INFRA-01 | contract | `npm test` | ✅ `src/server/index.phase1.contract.test.ts` | ✅ green |
| 01-01-02 | 02-PLAN-1-sse-server | 1 | INFRA-02 | contract | `npm test` | ✅ `src/server/index.phase1.contract.test.ts` | ✅ green |
| 01-02-01 | 02-PLAN-2-safety-harness | 1 | INFRA-03 | unit | `npm test` | ✅ `src/shared/harness/withTimeout.test.ts` | ✅ green |
| 01-02-02 | 02-PLAN-2-safety-harness | 1 | INFRA-04 | unit | `npm test` | ✅ `src/shared/harness/LoopDetector.test.ts` | ✅ green |
| 01-02-03 | 02-PLAN-2-safety-harness | 1 | INFRA-05 | unit | `npm test` | ✅ `src/shared/harness/TokenBudget.test.ts` | ✅ green |
| 01-02-04 | 02-PLAN-2-safety-harness | 1 | INFRA-06 | contract | `npm test` | ✅ `src/client/App.phase1.contract.test.ts` | ✅ green |
| 01-03-01 | 02-PLAN-3-gherkin-parser | 1 | GHERKIN-01 | unit | `npm test` | ✅ `src/server/parser/index.test.ts` | ✅ green |
| 01-03-02 | 02-PLAN-3-gherkin-parser | 1 | GHERKIN-02 | unit | `npm test` | ✅ `src/server/parser/index.test.ts` | ✅ green |
| 01-03-03 | 02-PLAN-3-gherkin-parser | 1 | GHERKIN-03 | unit | `npm test` | ✅ `src/server/parser/index.test.ts` | ✅ green |
| 01-03-04 | 02-PLAN-3-gherkin-parser | 1 | GHERKIN-04 | unit | `npm test` | ✅ `src/server/parser/index.test.ts` | ✅ green |
| 01-04-01 | 02-PLAN-4-ui-shell | 1 | UI-01 | contract | `npm test` | ✅ `src/client/App.phase1.contract.test.ts` | ✅ green |
| 01-04-02 | 02-PLAN-4-ui-shell | 1 | UI-02 | contract | `npm test` | ✅ `src/client/App.phase1.contract.test.ts` | ✅ green |
| 01-04-03 | 02-PLAN-4-ui-shell | 1 | UI-08 | contract + manual UX | `npm test` | ✅ `src/client/App.phase1.contract.test.ts` | ⚠️ partial |
| 01-04-04 | 02-PLAN-4-ui-shell | 1 | UI-09 | contract + manual UX | `npm test` | ✅ `src/client/App.phase1.contract.test.ts` | ⚠️ partial |

*Status: ✅ green · ❌ red · ⚠️ partial*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
| -------- | ----------- | ---------- | ----------------- |
| Validar look&feel dark/light real (contraste, legibilidad) | UI-08 | El test automatizado valida contrato estructural, no percepción visual | Abrir app en ambos temas y validar contraste AA en header/editor/sidebar |
| Validar layout desktop objetivo 1280px+ con inspección visual | UI-09 | Contrato CSS no sustituye revisión visual de composición final | Abrir viewport 1280x800 y confirmar sidebar fija + grid estable sin overflow |
| Confirmar heartbeat SSE y cierre limpio desde navegador real | INFRA-01 | El test de contrato inspecciona código; no simula socket real de navegador | Abrir stream `/stream/:runId`, cerrar pestaña y verificar log de desconexión sin write-after-end |

---

## Validation Audit 2026-04-01

| Metric | Count |
| ------ | ----- |
| Gaps found | 3 |
| Resolved (automated) | 1 |
| Escalated (manual-only) | 3 |

**Nota de gate (Step 4):** En modo no interactivo se aplicó automáticamente opción **Fix all gaps** para completar cobertura automatizable sin bloquear la ejecución.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or justified manual-only coverage
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all missing references (none)
- [x] No watch-mode flags
- [x] Feedback latency < 240s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
