import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const cliSource = readFileSync(resolve(process.cwd(), "src/cli/mcp-bench.ts"), "utf8");

test("phase10 contract (CLI-03): runDebug renderiza tool call trace con prefijo, args/result/error truncados y latencia opcional", () => {
  assert.match(cliSource, /for \(const toolCall of step\.toolCalls\)/);
  assert.match(cliSource, /\s{4}→\s/);
  assert.match(cliSource, /truncateText\(stringifyCompact\(args\),\s*200\)/);
  assert.match(cliSource, /truncateText\(String\(result\),\s*150\)/);
  assert.match(cliSource, /truncateText\(String\(error\),\s*150\)/);
  assert.match(cliSource, /typeof latencyMs === "number"/);
  assert.match(cliSource, /lat=\$\{latencyMs\}ms/);
});

test("phase10 contract (CLI-03): header incluye fallback textual y color para hallucinated/needs-review", () => {
  assert.match(cliSource, /import chalk from "chalk"/);
  assert.match(cliSource, /\[HALLUCINATED\]/);
  assert.match(cliSource, /\[NEEDS-REVIEW\]/);
  assert.match(cliSource, /chalk\.red\(/);
  assert.match(cliSource, /chalk\.yellow\(/);
});
