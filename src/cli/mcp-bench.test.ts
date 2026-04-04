import assert from "node:assert/strict";
import test from "node:test";

import { ProviderConfigError } from "../shared/llm/factory";
import { buildParsedStep, buildScenario } from "../test/support/runtimeFixtures";
import { parseArgs, runDebug, runHeadless } from "./mcp-bench";

function createCliDeps(overrides: Record<string, unknown> = {}) {
  const logs: string[] = [];
  const errors: string[] = [];
  const providerConfigs: Array<Record<string, unknown>> = [];
  const scenarios = [
    buildScenario({
      id: "scenario-cli",
      name: "CLI Scenario",
      steps: [buildParsedStep({ keyword: "Given", canonicalType: "given", text: "I open the page" })],
    }),
  ];

  const deps = {
    readFeatureText: (_resolvedPath: string) => "Feature: CLI\n  Scenario: smoke\n    Given I open the page",
    createProvider: async (config: Record<string, unknown>) => {
      providerConfigs.push(config);
      return { provider: config.provider };
    },
    parseFeature: (_featureText: string) => scenarios,
    createOrchestrator: () => ({
      async *runScenario() {
        yield {
          stepId: "step-1",
          stepIndex: 0,
          scenarioId: "scenario-cli",
          scenarioName: "CLI Scenario",
          stepText: "Given I open the page",
          canonicalType: "given",
          status: "passed",
          tokens: { input: 10, output: 5, total: 15 },
          latencyMs: 20,
          message: "Paso completado",
          toolCalls: [],
          timestamp: "2026-04-04T12:00:00.000Z",
        };
      },
    }),
    now: () => 1234567890,
    log: (message: string) => {
      logs.push(message);
    },
    error: (message: string) => {
      errors.push(message);
    },
    getLatestRunId: () => "run-latest",
    getRun: (_runId: string) => undefined,
    ...overrides,
  };

  return { deps, logs, errors, providerConfigs, scenarios };
}

test("parseArgs convierte flags y booleanos en un mapa simple", () => {
  assert.deepEqual(parseArgs(["--url", "https://example.com", "--feature", "demo.feature", "--json"]), {
    url: "https://example.com",
    feature: "demo.feature",
    json: "true",
  });
});

test("runHeadless valida provider requerido antes de crear el proveedor", async () => {
  const { deps, errors, providerConfigs } = createCliDeps();

  const exitCode = await runHeadless(
    {
      url: "https://example.com",
      feature: "scenario.feature",
    },
    deps as never
  );

  assert.equal(exitCode, 1);
  assert.equal(providerConfigs.length, 0);
  assert.match(errors[0], /--provider is required/);
});

test("runHeadless traduce anthropic a claude y emite JSON estructurado", async () => {
  const { deps, logs, providerConfigs } = createCliDeps();

  const exitCode = await runHeadless(
    {
      url: "https://example.com",
      feature: "scenario.feature",
      provider: "anthropic",
      model: "claude-3-7-sonnet",
      mcp: "@playwright/mcp,@browserbasehq/mcp",
      tokenCap: "9000",
    },
    deps as never
  );

  assert.equal(exitCode, 0);
  assert.equal(providerConfigs.length, 1);
  assert.equal(providerConfigs[0].provider, "claude");
  assert.equal(providerConfigs[0].model, "claude-3-7-sonnet");

  const payload = JSON.parse(logs[0]);
  assert.equal(payload.mode, "run");
  assert.deepEqual(payload.selectedMcpIds, ["@playwright/mcp", "@browserbasehq/mcp"]);
  assert.equal(payload.results.length, 2);
  assert.equal(payload.results[0].scenarios[0].steps[0].hallucinated, false);
  assert.equal(payload.results[0].scenarios[0].steps[0].needsReview, false);
});

test("runHeadless devuelve exit code 1 cuando algun paso falla o queda hallucinated", async () => {
  const { deps, logs } = createCliDeps({
    createOrchestrator: () => ({
      async *runScenario() {
        yield {
          stepId: "step-failed",
          stepIndex: 0,
          scenarioId: "scenario-cli",
          scenarioName: "CLI Scenario",
          stepText: "Then I should see the dashboard",
          canonicalType: "then",
          status: "failed",
          tokens: { input: 10, output: 5, total: 15 },
          latencyMs: 20,
          message: "Assertion failed",
          toolCalls: [],
          timestamp: "2026-04-04T12:00:00.000Z",
        };
      },
    }),
  });

  const exitCode = await runHeadless(
    {
      url: "https://example.com",
      feature: "scenario.feature",
      provider: "openai",
    },
    deps as never
  );

  assert.equal(exitCode, 1);
  const payload = JSON.parse(logs[0]);
  assert.equal(payload.results[0].scenarios[0].steps[0].status, "failed");
});

test("runHeadless convierte ProviderConfigError en error legible para CLI", async () => {
  const { deps, errors } = createCliDeps({
    createProvider: async () => {
      throw new ProviderConfigError("missing OPENAI_API_KEY");
    },
  });

  const exitCode = await runHeadless(
    {
      url: "https://example.com",
      feature: "scenario.feature",
      provider: "openai",
    },
    deps as never
  );

  assert.equal(exitCode, 1);
  assert.match(errors[0], /Provider configuration error: missing OPENAI_API_KEY/);
});

test("runDebug devuelve 1 cuando no hay runs persistidos", () => {
  const { deps, errors } = createCliDeps({
    getLatestRunId: () => undefined,
  });

  const exitCode = runDebug({}, deps as never);

  assert.equal(exitCode, 1);
  assert.match(errors[0], /No hay runs persistidos/);
});

test("runDebug filtra por MCP y renderiza flags y tool traces truncados", () => {
  const { deps, logs } = createCliDeps({
    getRun: () => ({
      id: "run-123",
      name: "CLI Debug",
      status: "completed",
      steps: [
        {
          mcpId: "@playwright/mcp",
          index: 0,
          canonicalType: "given",
          status: "passed",
          latencyMs: 25,
          networkOverheadMs: 3,
          tokens: { total: 42 },
          validation: { verdict: "supports", confidence: 0.91, hallucinated: true, needsReview: false },
          text: "Given I open the page",
          message: "Paso completado",
          toolCalls: [
            {
              toolName: "browser_navigate",
              args: { url: "https://example.com" },
              result: "Navigation complete",
              latencyMs: 12,
            },
          ],
        },
        {
          mcpId: "@playwright/mcp",
          index: 1,
          canonicalType: "then",
          status: "failed",
          latencyMs: 31,
          networkOverheadMs: 5,
          tokens: { total: 51 },
          validation: { verdict: "uncertain", confidence: 0.44, hallucinated: false, needsReview: true },
          text: "Then I should see the dashboard",
          message: "Validation mismatch",
          toolCalls: [
            {
              toolName: "browser_snapshot",
              args: { ref: "dialog-root" },
              error: "Snapshot mismatch".repeat(20),
            },
          ],
        },
        {
          mcpId: "@browserbasehq/mcp",
          index: 0,
          canonicalType: "given",
          status: "passed",
          latencyMs: 10,
          networkOverheadMs: 1,
          tokens: { total: 10 },
          validation: { verdict: "supports", confidence: 0.99, hallucinated: false, needsReview: false },
          text: "Given filtered out",
          message: "Should not be printed",
          toolCalls: [],
        },
      ],
    }),
  });

  const exitCode = runDebug({ mcp: "@playwright" }, deps as never);

  assert.equal(exitCode, 0);
  assert.equal(logs.some((line) => line.includes("filtered out")), false);
  assert.equal(logs.some((line) => line.includes("[HALLUCINATED]")), true);
  assert.equal(logs.some((line) => line.includes("[NEEDS-REVIEW]")), true);
  assert.equal(logs.some((line) => line.includes("→ browser_navigate")), true);
  assert.equal(logs.some((line) => line.includes("lat=12ms")), true);
  assert.equal(logs.some((line) => line.includes("Snapshot mismatch")), true);
});
