---
phase: 10
slug: cli-debug-trace-csv-scorecard
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-01
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

|Property|Value|
|---|---|
|**Framework**|Node.js test runner via `tsx --test`|
|**Config file**|`package.json` scripts (`test`, `typecheck`)|
|**Quick run command**|`npm test -- src/cli/mcp-bench.phase10.contract.test.ts src/server/api/history.phase10.contract.test.ts`|
|**Full suite command**|`npm test`|
|**Estimated runtime**|~4-8 seconds (quick)|

---

## Sampling Rate

- **After every task commit:** Run `npm test -- src/cli/mcp-bench.phase10.contract.test.ts src/server/api/history.phase10.contract.test.ts`
- **After every plan wave:** Run `npm run typecheck` + `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

|Task ID|Plan|Wave|Requirement|Test Type|Automated Command|File Exists|Status|
|---|---|---|---|---|---|---|---|
|10-01-01|01|1|CLI-03|contract|`node ./node_modules/tsx/dist/cli.mjs --test "src/cli/mcp-bench.phase10.contract.test.ts"`|✅|✅ green|
|10-01-02|01|1|CLI-03|contract + typecheck|`npm test -- src/cli/mcp-bench.phase10.contract.test.ts && npm run typecheck`|✅|✅ green|
|10-02-01|02|1|HIST-02|contract|`node ./node_modules/tsx/dist/cli.mjs --test "src/server/api/history.phase10.contract.test.ts"`|✅|✅ green|
|10-02-02|02|1|HIST-02|contract + integration|`npm test -- src/server/api/history.phase10.contract.test.ts src/server/api/history.test.ts`|✅|✅ green|

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Audit 2026-04-01

|Metric|Count|
|---|---|
|Gaps found|0|
|Resolved|0|
|Escalated|0|

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-01
