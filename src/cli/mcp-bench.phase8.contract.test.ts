import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const cliSource = readFileSync(resolve(process.cwd(), "src/cli/mcp-bench.ts"), "utf8");

test("phase8 contract (CLI-01): mcp-bench run usa proveedor real via createProvider", () => {
  assert.match(cliSource, /import\s+\{\s*createProvider,\s*ProviderConfigError\s*\}\s+from\s+"\.\.\/shared\/llm\/factory"/);
  assert.match(cliSource, /provider\s*=\s*await\s+createProvider\(providerConfig\)/);
  assert.match(cliSource, /const\s+orchestrator\s*=\s+new\s+OrchestratorService\(provider\)/);
});

test("phase8 contract (CLI-01): provider es obligatorio y anthropic mapea a claude", () => {
  assert.match(cliSource, /Error:\s*--provider is required/);
  assert.match(cliSource, /providerFlag\s*===\s*'anthropic'\s*\?\s*'claude'/);
  assert.doesNotMatch(cliSource, /function\s+createCliProvider\s*\(/);
  assert.doesNotMatch(cliSource, /CLI mock ejecutado/);
});
