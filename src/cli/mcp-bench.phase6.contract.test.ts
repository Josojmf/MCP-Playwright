import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const cliSource = readFileSync(resolve(process.cwd(), "src/cli/mcp-bench.ts"), "utf8");
const binSource = readFileSync(resolve(process.cwd(), "bin/mcp-bench.js"), "utf8");

test("phase6 contract: CLI run command supports headless execution and structured JSON output", () => {
  assert.match(cliSource, /if \(command === "run"\)/);
  assert.match(cliSource, /const output = \{[\s\S]*mode: "run"/);
  assert.match(cliSource, /console\.log\(JSON\.stringify\(output, null, 2\)\)/);
  assert.match(cliSource, /return hasFailure \? 1 : 0/);
});

test("phase6 contract: CLI requires provider flag and exposes debug command path", () => {
  assert.match(cliSource, /if \(command === "debug"\)/);
  assert.match(cliSource, /Error: --provider is required/);
  assert.match(cliSource, /mcp-bench debug \[--runId <runId>\] \[--mcp <filter>\]/);
});

test("phase6 contract: local bin wrapper delegates to tsx entrypoint", () => {
  assert.match(binSource, /path\.join\(projectRoot, "node_modules", "tsx", "dist", "cli\.mjs"\)/);
  assert.match(binSource, /path\.join\(projectRoot, "src", "cli", "mcp-bench\.ts"\)/);
  assert.match(binSource, /spawnSync\(/);
});
