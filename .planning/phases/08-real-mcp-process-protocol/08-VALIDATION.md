---
phase: 08
slug: real-mcp-process-protocol
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-01
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js test runner (`node:test`) via `tsx` |
| **Config file** | none (script-based in `package.json`) |
| **Quick run command** | `npx tsx --test src/cli/mcp-bench.phase8.contract.test.ts src/server/runManager.phase8.contract.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsx --test src/cli/mcp-bench.phase8.contract.test.ts src/server/runManager.phase8.contract.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | EXEC-03 | unit + contract | `npx tsx --test src/server/mcp/McpProcessManager.test.ts src/server/runManager.phase8.contract.test.ts` | ✅ | ✅ green |
| 08-02-01 | 02 | 2 | CLI-01 | contract | `npx tsx --test src/cli/mcp-bench.phase6.contract.test.ts src/cli/mcp-bench.phase8.contract.test.ts` | ✅ | ✅ green |
| 08-02-02 | 02 | 2 | INFRA-04 | unit + contract | `npx tsx --test src/shared/harness/LoopDetector.test.ts src/server/runManager.phase8.contract.test.ts` | ✅ | ✅ green |
| 08-02-03 | 02 | 2 | ORCH-07 | unit + integration-lite + contract | `npx tsx --test src/shared/pricing/resolver.test.ts src/server/runManager.test.ts src/server/runManager.phase8.contract.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ⌛ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-01
