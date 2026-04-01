import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const historySource = readFileSync(resolve(process.cwd(), "src/server/api/history.ts"), "utf8");

test("phase10 contract (HIST-02): buildSummaryCsv exporta filas por (runId,mcpId)", () => {
  assert.match(historySource, /function buildSummaryCsv\(runs: Array<NonNullable<ReturnType<typeof getRun>>>\)/);
  assert.match(historySource, /for \(const run of runs\)/);
  assert.match(historySource, /for \(const \[mcpId, mcpSteps\] of Object\.entries\(stepsByMcp\)\)/);
  assert.match(historySource, /"runId",\s*"mcpId",\s*"passRate",\s*"hallucinationCount",\s*"totalTokens",\s*"totalCostUsd"/);
});

test("phase10 contract (HIST-02): endpoint /api/history/export.csv carga RunDetail[] y calcula métricas por MCP", () => {
  assert.match(historySource, /const details = runs\s*\.map\(\(run\) => getRun\(run\.id\)\)/);
  assert.match(historySource, /\.filter\(\(run\): run is NonNullable<ReturnType<typeof getRun>> => Boolean\(run\)\)/);
  assert.match(historySource, /const passRate = totalSteps > 0 \? passedSteps \/ totalSteps : 0/);
  assert.match(historySource, /const hallucinationCount = mcpSteps\.filter\(\(step\) => step\.validation\?\.hallucinated === true\)\.length/);
  assert.match(historySource, /const totalTokens = mcpSteps\.reduce\(\(sum, step\) => sum \+ \(step\.tokens\?\.total \?\? 0\), 0\)/);
  assert.match(historySource, /const totalCostUsd = runTokens > 0 \? \(run\.totalCostUsd \* totalTokens\) \/ runTokens : 0/);
});
