import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PhaseOneRunManager } from "./runManager";

const runManagerSource = readFileSync(resolve(process.cwd(), "src/server/runManager.ts"), "utf8");
const loggerStub = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  fatal: () => undefined,
} as any;

test("phase8 contract (INFRA-04): loop detector usa fingerprint de tool call real", () => {
  assert.match(runManagerSource, /name:\s*toolCall\.toolName/);
  assert.match(runManagerSource, /argsString:\s*JSON\.stringify\(toolCall\.arguments\)/);
  assert.match(runManagerSource, /status:\s*'aborted'\s+as\s+const/);
});

test("phase8 contract (EXEC-03): executeMcpRun usa McpProcessManager directo en InstrumentedMcpClient", () => {
  assert.match(runManagerSource, /new\s+InstrumentedMcpClient\(processManager\)/);
  assert.doesNotMatch(runManagerSource, /stubMcpClient/);
  assert.doesNotMatch(runManagerSource, /Stub:\s*\$\{name\}/);
});

test("phase8 contract (ORCH-07): estimateRun usa resolvePricing y falla en provider:model desconocido", () => {
  assert.match(runManagerSource, /const\s+pricing\s*=\s*resolvePricing\(/);
  assert.match(runManagerSource, /Unknown pricing for provider/);

  const manager = new PhaseOneRunManager(loggerStub);
  assert.throws(
    () =>
      manager.estimateRun({
        baseUrl: "https://google.es",
        featureText: `Feature: Demo\n  Scenario: buscar\n    Given User is on google page`,
        selectedMcpIds: ["@playwright/mcp"],
        tokenCap: 12000,
        provider: "definitely-unknown-provider",
        model: "non-existent-model",
      }),
    (error) => error instanceof Error && /Unknown pricing for provider/i.test(error.message)
  );
});

test("phase8 contract (ORCH-07): estimateRun usa defaults cuando provider/model no vienen en request", () => {
  const manager = new PhaseOneRunManager(loggerStub);

  const estimate = manager.estimateRun({
    baseUrl: "https://google.es",
    featureText: `Feature: Demo\n  Scenario: buscar\n    Given User is on google page`,
    selectedMcpIds: ["@playwright/mcp"],
    tokenCap: 12000,
  });

  assert.equal(typeof estimate.estimatedCostUsd, "number");
  assert.ok(Number.isFinite(estimate.estimatedCostUsd));
});
