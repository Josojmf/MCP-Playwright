---
phase: 03
slug: orchestrator-engine-single-mcp-run
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-01
---

# Phase 03 — Validation Strategy

> Auditoría Nyquist de fase completada con cobertura automatizada para orquestador, runtime MCP, instrumentación/validación y flujo usable de historial/UI.

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
| 03-01-01 | 03-PLAN-1-orchestrator-core | 1 | ORCH-08 | unit/integration | `npm test` | ✅ `src/server/orchestrator/OrchestratorService.test.ts` | ✅ green |
| 03-01-02 | 03-PLAN-1-orchestrator-core | 1 | EXEC-01 | unit/integration | `npm test` | ✅ `src/server/orchestrator/OrchestratorService.test.ts` | ✅ green |
| 03-02-01 | 03-PLAN-2-mcp-runtime-preflight | 1 | EXEC-03 | unit | `npm test` | ✅ `src/server/mcp/McpProcessManager.test.ts` | ✅ green |
| 03-02-02 | 03-PLAN-2-mcp-runtime-preflight | 1 | EXEC-04 | unit | `npm test` | ✅ `src/server/mcp/preflight.test.ts` | ✅ green |
| 03-02-03 | 03-PLAN-2-mcp-runtime-preflight | 1 | EXEC-05 | unit | `npm test` | ✅ `src/server/mcp/stalenessRecovery.test.ts` | ✅ green |
| 03-03-01 | 03-PLAN-3-instrumentation-validation | 2 | VALID-01 | unit/integration | `npm test` | ✅ `src/server/mcp/InstrumentedMcpClient.test.ts` | ✅ green |
| 03-03-02 | 03-PLAN-3-instrumentation-validation | 2 | VALID-02 | unit | `npm test` | ✅ `src/server/validation/assertionsRunner.test.ts` | ✅ green |
| 03-04-01 | 03-PLAN-4-usable-ui-history-es | 3 | HIST-01 | integration | `npm test` | ✅ `src/server/storage/sqlite.test.ts` | ✅ green |
| 03-04-02 | 03-PLAN-4-usable-ui-history-es | 3 | HIST-03 | integration + contract | `npm test` | ✅ `src/server/api/history.test.ts` | ✅ green |
| 03-04-03 | 03-PLAN-4-usable-ui-history-es | 3 | UI-03 | contract | `npm test` | ✅ `src/client/App.phase1.contract.test.ts` | ✅ green |
| 03-04-04 | 03-PLAN-4-usable-ui-history-es | 3 | UI-04 | contract | `npm test` | ✅ `src/client/App.phase3.contract.test.ts` | ✅ green |

Status legend: ✅ green · ❌ red · ⚠️ partial

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Audit 2026-04-01

| Metric | Count |
| ------ | ----- |
| Gaps found | 1 |
| Resolved (automated) | 1 |
| Escalated (manual-only) | 0 |

**Gap resuelto:** UI-04 (timeline live + wiring SSE/historial en `App.tsx`) quedó reforzado con contrato explícito en `src/client/App.phase3.contract.test.ts`.

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
