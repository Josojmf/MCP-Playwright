# Phase 10: Discussion Log

**Date:** 2026-04-01
**Workflow:** gsd:discuss-phase

---

## Areas Selected

All four gray areas selected by user.

---

## Area 1: Debug trace format

**Q: How should tool call arguments be shown?**
Options: Compact inline JSON / Pretty-printed indented / You decide
**Selected:** Compact inline JSON — single line, truncate at ≤200 chars with `...`

**Q: How much of the tool call result should be shown as a 'snippet'?**
Options: 150 chars / 300 chars / You decide
**Selected:** 150 chars — short enough to scan in CI logs, long enough for meaningful content

---

## Area 2: Hallucination highlighting

**Q: How should hallucinated/needs-review steps be highlighted?**
Options: Add chalk as direct dep / Raw ANSI escape codes / Text-only labels
**Selected:** Add chalk as direct dep — chalk@4 already transitive, red=hallucinated, yellow=needs-review

**Q: What exactly gets highlighted — whole step block or just the status line?**
Options: Status line only / Entire step block
**Selected:** Status line only — color on the `[mcpId] #N TYPE STATUS ...` header line, tool call lines stay default

---

## Area 3: CSV row grain

**Q: What should one row in the MCP scorecard CSV represent?**
Options: Per (runId, mcpId) / Aggregated per mcpId
**Selected:** Per (runId, mcpId) — preserves temporal context, multiple rows per run when multiple MCPs selected

Example confirmed:
```csv
runId,mcpId,passRate,hallucinationCount,totalTokens,totalCostUsd
run-abc,playwright,0.80,1,4200,0.042
run-abc,puppeteer,0.60,3,6100,0.061
```

---

## Area 4: passRate definition

**Q: How should passRate be computed per (run, MCP)?**
Options: Step-level (passed/total) / Scenario-level (all-passed/total)
**Selected:** Step-level — `passed_steps / total_steps` for that (runId, mcpId)

Example confirmed:
```
# 6 passed, 1 failed, 1 aborted out of 8 steps
passRate = 6/8 = 0.75
```

---

## Summary of Decisions

| Area | Decision |
|------|----------|
| Args format | Compact inline JSON, truncate at 200 chars |
| Response snippet | 150 chars max |
| Hallucination color | chalk@4 direct dep; red=hallucinated, yellow=needs-review |
| Highlight scope | Step header line only |
| CSV row grain | Per (runId, mcpId) |
| passRate basis | Step-level: passed / total |
