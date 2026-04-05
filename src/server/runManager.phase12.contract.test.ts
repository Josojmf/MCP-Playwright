import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PhaseOneRunManager } from "./runManager";

const loggerStub = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  fatal: () => undefined,
} as any;

test("RunEstimateRequest expone provider y los tres modelos explicitos", () => {
  const source = readFileSync(new URL("./runManager.ts", import.meta.url), "utf8");

  assert.match(source, /export interface RunEstimateRequest[\s\S]*provider\?: string;/);
  assert.match(source, /export interface RunEstimateRequest[\s\S]*orchestratorModel\?: string;/);
  assert.match(source, /export interface RunEstimateRequest[\s\S]*lowCostAuditorModel\?: string;/);
  assert.match(source, /export interface RunEstimateRequest[\s\S]*highAccuracyAuditorModel\?: string;/);
  assert.match(source, /run_started/);
  assert.match(source, /executionConfig/);
});

test("createRun conserva provider y modelos del request como fuente de verdad", () => {
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;

  process.env.OPENAI_API_KEY = "env-openai-key";
  delete process.env.ANTHROPIC_API_KEY;

  try {
    const manager = new PhaseOneRunManager(loggerStub);
    const run = manager.createRun({
      baseUrl: "https://google.es",
      featureText: `Feature: Demo\n  Scenario: buscar\n    Given User is on google page`,
      selectedMcpIds: ["@playwright/mcp"],
      tokenCap: 12000,
      provider: "claude",
      orchestratorModel: "claude-3-5-sonnet-latest",
      lowCostAuditorModel: "claude-3-5-haiku-latest",
      highAccuracyAuditorModel: "claude-3-5-sonnet-20241022",
    } as any);

    const session = (manager as any).sessions.get(run.runId);

    assert.equal(session.config.provider, "claude");
    assert.equal(session.config.orchestratorModel, "claude-3-5-sonnet-latest");
    assert.equal(session.config.lowCostAuditorModel, "claude-3-5-haiku-latest");
    assert.equal(session.config.highAccuracyAuditorModel, "claude-3-5-sonnet-20241022");
  } finally {
    if (previousOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousOpenAiKey;
    }

    if (previousAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
    }
  }
});
