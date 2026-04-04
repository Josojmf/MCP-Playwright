# Phase 10: CLI Debug Trace & CSV Scorecard — Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Two rendering/formatting fixes to close gaps from Phase 06 VERIFICATION.md (score 2/5):

1. `runDebug()` in `src/cli/mcp-bench.ts` — iterate `step.toolCalls[]` and print per-call trace (tool name, args, response snippet, latency). Hallucinated/needs-review step headers highlighted with terminal color.
2. `buildSummaryCsv()` in `src/server/api/history.ts` — change from per-run rows to per-(runId, mcpId) rows with scorecard columns.

All required data already exists in the data model. No new data capture, no UI changes, no new MCP servers, no API contract changes.

**Requirements closed:** CLI-03, HIST-02

</domain>

<decisions>
## Implementation Decisions

### runDebug() — Tool Call Trace Format

- **D-01:** Arguments are printed as **compact inline JSON** (single line). Truncate at **200 characters** with `...` suffix if the serialized args exceed that length.

  ```
  [playwright] #3 WHEN passed lat=412ms tok=180
    fill form on #login
    (step message here)
    → browser_fill_form  args: {"selector":"#email","value":"user@example.com"}  result: "Filled successfully"  lat=38ms
    → browser_click      args: {"selector":"#submit"}  result: "Clicked"  lat=22ms
  ```

- **D-02:** Response/result is shown as a **snippet of at most 150 characters** with `...` suffix if truncated. If `result` is absent and `error` is present, print `error:` instead.

- **D-03:** Latency per tool call is printed as `lat=Nms` (from `ToolCallTrace.latencyMs`). The `InstrumentedMcpClient.ToolCallTrace` has `latencyMs`; the orchestrator's `ToolCallTrace` in `types.ts` does not. The planner must verify which shape is actually persisted in `PersistedStep.toolCalls` (stored as `unknown[]`). If latency is unavailable in stored data, omit the `lat=` field gracefully rather than throwing.

- **D-04:** Each tool call is indented with `    → ` prefix (4 spaces + arrow) under the step line. This distinguishes tool call lines from step-level lines visually without requiring a table format.

### runDebug() — Hallucination Highlighting

- **D-05:** Add **`chalk`** as a direct production dependency (`dependencies`, not `devDependencies`). Chalk 4.x is already present transitively — this makes it explicit and stable.

- **D-06:** Color applied to the **step header line only** (the `[mcpId] #N TYPE STATUS ...` line). Tool call lines remain default terminal color.
  - `hallucinated: true` (from `step.validation?.hallucinated`) → **red** (`chalk.red`)
  - `validation.verdict === 'needsReview'` or `needsReview: true` → **yellow** (`chalk.yellow`)
  - Normal steps → no color

- **D-07:** The plain-text `[HALLUCINATED]` or `[NEEDS-REVIEW]` label is also appended to the step header line regardless of color support, so CI logs without ANSI rendering still show the flag.

### buildSummaryCsv() — Row Grain

- **D-08:** Change `buildSummaryCsv()` signature to accept `runs: RunDetail[]` (full run detail with steps) instead of `PersistedRun[]` (summary only). This requires calling `getRun(id)` for each run in the endpoint handler.

- **D-09:** One row per **(runId, mcpId)** pair. For a run that benchmarked 3 MCPs, the export produces 3 rows for that run. The `runId` column preserves temporal context so the CSV can be sorted/filtered by run or by MCP in a spreadsheet.

- **D-10:** CSV column order: `runId`, `mcpId`, `passRate`, `hallucinationCount`, `totalTokens`, `totalCostUsd`

  ```csv
  runId,mcpId,passRate,hallucinationCount,totalTokens,totalCostUsd
  run-abc,playwright,0.80,1,4200,0.042
  run-abc,puppeteer,0.60,3,6100,0.061
  run-def,playwright,0.90,0,3800,0.038
  ```

- **D-11:** `passRate` is **step-level**: `passed_steps / total_steps` for that mcpId within that runId. Steps with status `aborted` count in the denominator. Format as float rounded to 2 decimal places (e.g., `0.75`).

- **D-12:** `hallucinationCount` = count of steps where `step.validation?.hallucinated === true` for that (runId, mcpId).

- **D-13:** `totalTokens` = sum of `step.tokens.total` for all steps belonging to that (runId, mcpId).

- **D-14:** `totalCostUsd` = sum of per-step cost, or use run-level `totalCostUsd` pro-rated by token share if per-step cost is not stored. **Claude's Discretion:** whether to prorate or store 0.00 if per-step cost is unavailable.

- **D-15:** The existing `/api/history/export.csv` endpoint is updated in place — no new route added.

### Claude's Discretion

- Float precision for `totalCostUsd` (3 or 4 decimal places)
- Whether to add a `--no-color` flag to `mcp-bench debug` or rely on chalk's automatic TTY detection
- Whether `aborted` steps count in the passRate denominator (D-11 says yes — Claude may reconsider if aborted steps are not meaningful for pass rate)
- Exact proration strategy for `totalCostUsd` if per-step cost is unavailable

</decisions>

<specifics>
## Specific Ideas

- "Compact inline JSON for args" — user confirmed this is the right format for CI-friendly debug output
- "Per (runId, mcpId) rows" — user confirmed this is the right grain to preserve temporal context in the scorecard CSV
- "chalk@4 direct dep" — user explicitly chose chalk over raw ANSI or text-only; this is intentional despite being a new dep

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### CLI debug
- `src/cli/mcp-bench.ts:178–216` — Current `runDebug()` implementation; Phase 10 rewrites the step render loop to add tool call trace
- `src/server/orchestrator/types.ts:13–19` — `ToolCallTrace` interface (no `latencyMs`); compare with `InstrumentedMcpClient.ToolCallTrace`
- `src/server/mcp/InstrumentedMcpClient.ts:15–28` — `ToolCallTrace` with `latencyMs`; verify which shape is stored in `PersistedStep.toolCalls`
- `src/server/storage/sqlite.ts:26–44` — `PersistedStep` interface; `toolCalls: unknown[]` is the stored field

### CSV export
- `src/server/api/history.ts:251–275` — Current `buildSummaryCsv()` (per-run rows); Phase 10 rewrites to per-(runId, mcpId)
- `src/server/api/history.ts:120–135` — `/api/history/export.csv` route handler; must be updated to pass `RunDetail[]`
- `src/server/storage/sqlite.ts` — `listRuns()` and `getRun()` signatures; planner must determine if a batch getRun is needed or if per-run calls are acceptable

### Phase 6 verification (gap evidence)
- `.planning/phases/06-cli-export/06-VERIFICATION.md` — Original gap documentation (score 2/5); planner should verify Phase 10 plan closes all listed `missing:` items

</canonical_refs>

<deferred>
## Deferred Ideas

None surfaced during discussion — scope was tight and focused.
</deferred>
