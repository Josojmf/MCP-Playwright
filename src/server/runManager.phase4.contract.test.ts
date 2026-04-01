import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const runManagerSource = readFileSync(resolve(process.cwd(), "src/server/runManager.ts"), "utf8");

test("phase4 contract: selected MCPs execute concurrently and persist independently", () => {
  assert.match(runManagerSource, /executeMcpRun\(session, mcpId, budget\)/);
  assert.match(runManagerSource, /Promise\.allSettled\(executions\)/);
  assert.match(runManagerSource, /mcp_process_started/);
  assert.match(runManagerSource, /pid:\s*processInfo\.pid/);
  assert.match(runManagerSource, /return `\$\{runId\}::\$\{mcpId\}`;/);
  assert.match(runManagerSource, /saveRun\(persistedRunId, `\$\{scenarioName\} \[\$\{mcpId\}\]`/);
});

test("phase4 contract: cloud latency overhead is tracked separately from execution latency", () => {
  assert.match(runManagerSource, /transportMode === "http"/);
  assert.match(runManagerSource, /networkOverheadMs = isCloud \? Math\.max\(30, Math\.round\(stepResult\.latencyMs \* 0\.25\)\) : 0/);
  assert.match(runManagerSource, /networkOverheadMs/);
  assert.match(runManagerSource, /this\.emit\(session, "step_passed", payload\)/);
});
