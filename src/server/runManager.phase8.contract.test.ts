import test from "node:test";
import assert from "node:assert/strict";
import { PhaseOneRunManager } from "./runManager";
import {
  assertCallArgumentObjectProperties,
  assertNormalizedFragments,
  assertObjectProperties,
  getVariableInitializerObject,
  loadSourceContract,
} from "../test/support/sourceContracts";

const runManagerSource = loadSourceContract(new URL("./runManager.ts", import.meta.url));
const loggerStub = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  fatal: () => undefined,
} as any;

test("phase8 contract (INFRA-04): loop detector usa fingerprint de tool call real", () => {
  assertCallArgumentObjectProperties(runManagerSource, {
    callee: "loopDetector.recordAndCheck",
    withinFunction: "executeMcpRun",
    argumentIndex: 0,
    expectations: {
      name: "toolCall.toolName",
      argsString: "JSON.stringify(toolCall.arguments)",
    },
  });

  const abortedResult = getVariableInitializerObject(runManagerSource, "abortedResult", {
    withinFunction: "executeMcpRun",
  });
  assertObjectProperties(runManagerSource, abortedResult, {
    status: "'aborted'",
    message: /`\[LOOP\] \$\{loopErr\.message\}`/,
  });
});

test("phase8 contract (EXEC-03): executeMcpRun usa McpProcessManager directo en InstrumentedMcpClient", () => {
  assertNormalizedFragments(
    runManagerSource,
    ["const instrumentedClient = new InstrumentedMcpClient(processManager)"],
    "real MCP client wiring"
  );
  assert.doesNotMatch(runManagerSource.text, /stubMcpClient/);
  assert.doesNotMatch(runManagerSource.text, /Stub:\s*\$\{name\}/);
});

test("phase8 contract (ORCH-07): estimateRun usa resolvePricing y falla en provider:model desconocido", () => {
  assertNormalizedFragments(
    runManagerSource,
    ["const pricing = resolvePricing(normalizedInput.provider, normalizedInput.orchestratorModel)"],
    "estimateRun pricing lookup"
  );

  const manager = new PhaseOneRunManager(loggerStub);
  assert.throws(
    () =>
      manager.estimateRun({
        baseUrl: "https://google.es",
        featureText: `Feature: Demo\n  Scenario: buscar\n    Given User is on google page`,
        selectedMcpIds: ["@playwright/mcp"],
        tokenCap: 12000,
        provider: "definitely-unknown-provider",
        orchestratorModel: "non-existent-model",
      }),
    (error) => error instanceof Error && /Provider no soportado/i.test(error.message)
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
