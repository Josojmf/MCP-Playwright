---
phase: 12
slug: mejorar-fiabilidad-seguridad-y-transparencia-del-ejecutor-de-tests-para-qa
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-04
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js test runner via `tsx --test` |
| **Config file** | `package.json` scripts (`test`, `typecheck`, `build`) |
| **Quick run command** | `node ./node_modules/tsx/dist/cli.mjs --test "src/client/App.phase12.contract.test.ts" "src/server/runManager.phase12.contract.test.ts" "src/server/runManager.phase12.evidence.test.ts" "src/server/validation/assertionsRunner.test.ts" "src/server/mcp/InstrumentedMcpClient.test.ts" "src/server/storage/sqlite.test.ts" "src/server/api/history.test.ts" "src/client/components/run/RunScorecard.phase12.contract.test.ts" "src/client/components/history/RunDetailView.phase12.contract.test.ts"` |
| **Full suite command** | `npm run typecheck && npm test && npm run build` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node ./node_modules/tsx/dist/cli.mjs --test "src/client/App.phase12.contract.test.ts" "src/server/runManager.phase12.contract.test.ts" "src/server/runManager.phase12.evidence.test.ts" "src/server/validation/assertionsRunner.test.ts" "src/server/mcp/InstrumentedMcpClient.test.ts" "src/server/storage/sqlite.test.ts" "src/server/api/history.test.ts" "src/client/components/run/RunScorecard.phase12.contract.test.ts" "src/client/components/history/RunDetailView.phase12.contract.test.ts"`
- **After every plan wave:** Run `npm run typecheck && npm test && npm run build`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 12 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | VALID-02 | unit | `node ./node_modules/tsx/dist/cli.mjs --test "src/server/validation/assertionsRunner.test.ts"` | ✅ | ✅ green |
| 12-01-02 | 01 | 1 | VALID-02 | unit + typecheck | `node ./node_modules/tsx/dist/cli.mjs --test "src/server/validation/assertionsRunner.test.ts" && node ./node_modules/typescript/bin/tsc --noEmit` | ✅ | ✅ green |
| 12-02-01 | 02 | 1 | EXEC-04 | contract + behavior | `node ./node_modules/tsx/dist/cli.mjs --test "src/server/runManager.test.ts" "src/server/runManager.phase12.contract.test.ts"` | ✅ | ✅ green |
| 12-02-02 | 02 | 1 | UI-04 | contract + build | `node ./node_modules/tsx/dist/cli.mjs --test "src/client/App.phase12.contract.test.ts" && node ./node_modules/typescript/bin/tsc --noEmit && node ./node_modules/vite/bin/vite.js build` | ✅ | ✅ green |
| 12-03-01 | 03 | 2 | VALID-01 | contract + integration | `node ./node_modules/tsx/dist/cli.mjs --test "src/server/mcp/InstrumentedMcpClient.test.ts" "src/server/runManager.phase12.evidence.test.ts"` | ✅ | ✅ green |
| 12-03-02 | 03 | 2 | HIST-01, HIST-02 | integration + persistence | `node ./node_modules/tsx/dist/cli.mjs --test "src/server/storage/sqlite.test.ts" "src/server/api/history.test.ts" "src/server/runManager.phase12.evidence.test.ts"` | ✅ | ✅ green |
| 12-04-01 | 04 | 3 | UI-04, UI-05 | contract | `node ./node_modules/tsx/dist/cli.mjs --test "src/client/App.phase12.contract.test.ts" "src/client/components/run/RunScorecard.phase12.contract.test.ts"` | ✅ | ✅ green |
| 12-04-02 | 04 | 3 | HIST-03 | contract + integration | `node ./node_modules/tsx/dist/cli.mjs --test "src/client/components/history/RunDetailView.phase12.contract.test.ts" "src/server/api/history.test.ts"` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Audit 2026-04-04

| Metric | Count |
|--------|-------|
| Gaps found | 2 |
| Resolved | 2 |
| Escalated | 0 |

Audit notes:
- Reconstructed validation from plan and summary artifacts because Phase 12 had no pre-existing `12-VALIDATION.md`.
- Added `src/client/App.phase12.contract.test.ts` to cover explicit provider/model persistence, request payload wiring, and live trust/config rendering in `App.tsx`.
- Added `src/server/runManager.phase12.evidence.test.ts` to cover explicit `executionConfig`, trust degradation reasons, real-screenshot-only evidence handling, and persisted trust/config metadata.

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 12s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-04
