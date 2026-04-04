---
phase: 09
slug: real-vision-llm-validation
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-01
---

# Phase 09 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
| -------- | ----- |
| **Framework** | Node.js test runner (`node:test`) via `tsx` |
| **Config file** | none (script-based in `package.json`) |
| **Quick run command** | `npx tsx --test src/server/validation/visionValidator.phase9.contract.test.ts src/server/runManager.phase9.contract.test.ts src/server/index.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~12 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsx --test src/server/validation/visionValidator.phase9.contract.test.ts src/server/runManager.phase9.contract.test.ts src/server/index.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 12 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
| ------- | ---- | ---- | ----------- | --------- | ----------------- | ----------- | ------ |
| 09-01-01 | 01 | 1 | VALID-07 | unit + contract | `npx tsx --test src/server/validation/visionValidator.test.ts src/server/validation/visionValidator.phase9.contract.test.ts` | ✅ | ✅ green |
| 09-01-02 | 01 | 1 | VALID-03 | unit + contract | `npx tsx --test src/server/validation/visionValidator.test.ts src/server/validation/visionValidator.phase9.contract.test.ts` | ✅ | ✅ green |
| 09-02-01 | 02 | 2 | VALID-06 | unit + contract | `npx tsx --test src/server/runManager.test.ts src/server/runManager.phase9.contract.test.ts` | ✅ | ✅ green |
| 09-02-02 | 02 | 2 | VALID-04 | unit + contract | `npx tsx --test src/server/validation/visionValidator.phase9.contract.test.ts src/server/runManager.phase9.contract.test.ts` | ✅ | ✅ green |
| 09-02-03 | 02 | 2 | VALID-05 | unit + contract | `npx tsx --test src/server/validation/visionValidator.phase9.contract.test.ts src/server/runManager.phase9.contract.test.ts` | ✅ | ✅ green |
| 09-03-01 | 03 | 1 | EXEC-07 | unit | `npx tsx --test src/server/index.test.ts` | ✅ | ✅ green |
| 09-04-01 | 04 | 3 | VALID-03 / VALID-04 / VALID-05 / VALID-06 / VALID-07 | contract regression | `npx tsx --test src/server/validation/visionValidator.phase9.contract.test.ts src/server/runManager.phase9.contract.test.ts` | ✅ | ✅ green |

Status legend: pending / green / red / flaky.

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
- [x] Feedback latency < 12s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-01
