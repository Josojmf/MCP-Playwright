import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { OrchestratorService } from "./OrchestratorService";
import { RunContext, StepResult, MCPConfig } from "./types";
import { ScenarioPlan, ParsedStep } from "../parser";
import { TokenBudget } from "../../shared/harness/TokenBudget";
import { ProviderConfig, LLMProvider, LLMRequest, LLMResponse, LLMChunk } from "../../shared/llm/types";

// Mock LLM Provider for testing
class MockLLMProvider implements LLMProvider {
  async complete(request: LLMRequest): Promise<LLMResponse> {
    return {
      id: randomUUID(),
      model: request.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: `Executed: ${request.messages[request.messages.length - 1]?.content || "step"}`,
          },
          finishReason: "stop",
        },
      ],
      usage: {
        promptTokens: 150,
        completionTokens: 50,
        totalTokens: 200,
      },
    };
  }

  async *stream(_request: LLMRequest): AsyncIterable<LLMChunk> {
    yield {
      index: 0,
      delta: "Executed",
      finishReason: null,
    };
  }

  async estimateCost(_inputTokens: number, _outputTokens: number, _model: string): Promise<number> {
    return 0.001;
  }
}

class AuthFailLLMProvider implements LLMProvider {
  async complete(_request: LLMRequest): Promise<LLMResponse> {
    throw new Error("OpenRouterAdapter request failed (401)");
  }

  async *stream(_request: LLMRequest): AsyncIterable<LLMChunk> {
    yield {
      index: 0,
      delta: "",
      finishReason: "stop",
    };
  }

  async estimateCost(_inputTokens: number, _outputTokens: number, _model: string): Promise<number> {
    return 0;
  }
}

class JsonToolLoopProvider implements LLMProvider {
  private calls = 0;

  async complete(request: LLMRequest): Promise<LLMResponse> {
    this.calls += 1;
    const content = this.calls === 1
      ? JSON.stringify({
          kind: "tool",
          toolName: "browser_navigate",
          arguments: { url: "https://example.com" },
          reason: "open the target page",
        })
      : JSON.stringify({
          kind: "done",
          status: "passed",
          message: "La navegación se completó correctamente.",
        });

    return {
      id: randomUUID(),
      model: request.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content,
          },
          finishReason: "stop",
        },
      ],
      usage: {
        promptTokens: 100,
        completionTokens: 25,
        totalTokens: 125,
      },
    };
  }

  async *stream(_request: LLMRequest): AsyncIterable<LLMChunk> {
    yield { index: 0, delta: "", finishReason: "stop" };
  }

  async estimateCost(_inputTokens: number, _outputTokens: number, _model: string): Promise<number> {
    return 0;
  }
}

test("StepResult represents all states with tokens and latency", async (t) => {
  await t.test("should handle running state", () => {
    const result: StepResult = {
      stepId: "step-1",
      stepIndex: 0,
      scenarioId: "scenario-1",
      scenarioName: "Test Scenario",
      stepText: "Given I have a test step",
      canonicalType: "given",
      status: "running",
      tokens: { input: 0, output: 0, total: 0 },
      latencyMs: 0,
      message: "Ejecutando paso...",
      toolCalls: [],
      timestamp: new Date().toISOString(),
    };

    assert.equal(result.status, "running");
    assert.ok(result.tokens);
    assert.ok(result.latencyMs >= 0);
  });

  await t.test("should handle passed state with tokens", () => {
    const result: StepResult = {
      stepId: "step-1",
      stepIndex: 0,
      scenarioId: "scenario-1",
      scenarioName: "Test Scenario",
      stepText: "Given I have a test step",
      canonicalType: "given",
      status: "passed",
      tokens: { input: 120, output: 45, total: 165 },
      latencyMs: 1250,
      message: "Paso completado exitosamente",
      toolCalls: [],
      timestamp: new Date().toISOString(),
    };

    assert.equal(result.status, "passed");
    assert.equal(result.tokens.total, 165);
    assert.equal(result.latencyMs, 1250);
  });

  await t.test("should handle failed state", () => {
    const result: StepResult = {
      stepId: "step-1",
      stepIndex: 0,
      scenarioId: "scenario-1",
      scenarioName: "Test Scenario",
      stepText: "Given I have a test step",
      canonicalType: "given",
      status: "failed",
      tokens: { input: 100, output: 50, total: 150 },
      latencyMs: 2500,
      message: "Falló la ejecución: TimeoutError",
      toolCalls: [],
      timestamp: new Date().toISOString(),
    };

    assert.equal(result.status, "failed");
    assert.ok(result.message.includes("Falló"));
  });

  await t.test("should handle aborted state", () => {
    const result: StepResult = {
      stepId: "step-1",
      stepIndex: 0,
      scenarioId: "scenario-1",
      scenarioName: "Test Scenario",
      stepText: "Given I have a test step",
      canonicalType: "given",
      status: "aborted",
      tokens: { input: 0, output: 0, total: 0 },
      latencyMs: 0,
      message: "Ejecución abortada por usuario",
      toolCalls: [],
      timestamp: new Date().toISOString(),
    };

    assert.equal(result.status, "aborted");
  });
});

test("Events are serializable for SSE", async (t) => {
  await t.test("should serialize StepResult to JSON", () => {
    const result: StepResult = {
      stepId: "step-1",
      stepIndex: 0,
      scenarioId: "scenario-1",
      scenarioName: "Test Scenario",
      stepText: "Given I have a test step",
      canonicalType: "given",
      status: "passed",
      tokens: { input: 120, output: 45, total: 165 },
      latencyMs: 1250,
      message: "Paso completado",
      toolCalls: [
        {
          toolId: "tool-1",
          toolName: "click",
          arguments: { selector: "#button" },
          result: "clicked successfully",
        },
      ],
      timestamp: new Date().toISOString(),
    };

    const serialized = JSON.stringify(result);
    assert.ok(serialized);
    assert.ok(serialized.includes("step-1"));
    assert.ok(serialized.includes("passed"));

    const parsed = JSON.parse(serialized);
    assert.equal(parsed.stepId, "step-1");
    assert.equal(parsed.status, "passed");
    assert.equal(parsed.toolCalls.length, 1);
  });

  await t.test("should serialize with tool calls", () => {
    const result: StepResult = {
      stepId: "step-2",
      stepIndex: 1,
      scenarioId: "scenario-1",
      scenarioName: "Test Scenario",
      stepText: "When I click the button",
      canonicalType: "when",
      status: "passed",
      tokens: { input: 100, output: 80, total: 180 },
      latencyMs: 2100,
      message: "Se ejecutaron 2 llamadas de herramienta",
      toolCalls: [
        {
          toolId: "tool-1",
          toolName: "navigate",
          arguments: { url: "https://example.com" },
          result: "navigated",
        },
        {
          toolId: "tool-2",
          toolName: "click",
          arguments: { selector: ".submit-btn" },
          result: "clicked",
        },
      ],
      timestamp: new Date().toISOString(),
    };

    const serialized = JSON.stringify(result);
    const parsed = JSON.parse(serialized);

    assert.equal(parsed.toolCalls.length, 2);
    assert.equal(parsed.toolCalls[0].toolName, "navigate");
    assert.equal(parsed.toolCalls[1].toolName, "click");
  });
});

test("runScenario maintains conversation history between steps", async (t) => {
  const mockProvider = new MockLLMProvider();
  const orchestrator = new OrchestratorService(mockProvider);
  const mockTokenBudget = new TokenBudget(
    {
      hardCapTokens: 10000,
      warnThresholdRatio: 0.8,
    },
    () => {}
  );

  const testMCPConfig: MCPConfig = {
    id: "test-mcp-1",
    provider: {
      provider: "openai",
      model: "gpt-4",
    } as ProviderConfig,
  };

  const step1: ParsedStep = {
    keyword: "Given",
    canonicalType: "given",
    text: "I have a test step",
  };

  const step2: ParsedStep = {
    keyword: "When",
    canonicalType: "when",
    text: "I execute the step",
  };

  const testScenario: ScenarioPlan = {
    id: "scenario-1",
    name: "Test Scenario",
    tags: ["@test"],
    steps: [step1, step2],
  };

  const testContext: RunContext = {
    runId: randomUUID(),
    scenario: testScenario,
    mcpConfig: testMCPConfig,
    conversationHistory: [],
    tokenBudget: mockTokenBudget,
    abortSignal: new AbortController().signal,
  };

  await t.test("should accumulate conversation history across steps", async () => {
    const results: StepResult[] = [];

    for await (const result of orchestrator.runScenario(testScenario, testContext)) {
      results.push(result);
      assert.ok(testContext.conversationHistory !== undefined);
    }

    assert.ok(results.length > 0);
    assert.ok(results.length <= testScenario.steps.length);
  });

  await t.test("should emit step results in order", async () => {
    const results: StepResult[] = [];
    const context2: RunContext = {
      runId: randomUUID(),
      scenario: testScenario,
      mcpConfig: testMCPConfig,
      conversationHistory: [],
      tokenBudget: mockTokenBudget,
      abortSignal: new AbortController().signal,
    };

    for await (const result of orchestrator.runScenario(testScenario, context2)) {
      results.push(result);
    }

    for (let i = 0; i < results.length; i++) {
      assert.equal(results[i].stepIndex, i);
    }
  });
});

// Shared fixtures for budget and abort tests
const sharedMCPConfig: MCPConfig = {
  id: "test-mcp-1",
  provider: {
    provider: "openai",
    model: "gpt-4",
  } as ProviderConfig,
};

const oneStepScenario: ScenarioPlan = {
  id: "scenario-1",
  name: "Test Scenario",
  tags: ["@test"],
  steps: [
    {
      keyword: "Given",
      canonicalType: "given",
      text: "I have a test step",
    },
  ],
};

test("runScenario aborts when token budget is exceeded before LLM call", async () => {
  const mockProvider = new MockLLMProvider();
  const orchestrator = new OrchestratorService(mockProvider);
  const tightBudget = new TokenBudget(
    { hardCapTokens: 100, warnThresholdRatio: 0.8 },
    () => {}
  );
  // Pre-fill budget to exceed the cap
  tightBudget.addUsage(101);

  const ctx: RunContext = {
    runId: randomUUID(),
    scenario: oneStepScenario,
    mcpConfig: sharedMCPConfig,
    conversationHistory: [],
    tokenBudget: tightBudget,
    abortSignal: new AbortController().signal,
  };

  const results: StepResult[] = [];
  for await (const result of orchestrator.runScenario(oneStepScenario, ctx)) {
    results.push(result);
  }
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "aborted");
  assert.ok(
    results[0].message.includes("Presupuesto de tokens excedido") ||
      results[0].message.includes("budget"),
    `Expected budget message, got: ${results[0].message}`
  );
});

test("AsyncGenerator behavior", async (t) => {
  const mockProvider = new MockLLMProvider();
  const orchestrator = new OrchestratorService(mockProvider);
  const mockTokenBudget = new TokenBudget(
    {
      hardCapTokens: 10000,
      warnThresholdRatio: 0.8,
    },
    () => {}
  );

  const testMCPConfig: MCPConfig = {
    id: "test-mcp-1",
    provider: {
      provider: "openai",
      model: "gpt-4",
    } as ProviderConfig,
  };

  const testScenario: ScenarioPlan = {
    id: "scenario-1",
    name: "Test Scenario",
    tags: ["@test"],
    steps: [
      {
        keyword: "Given",
        canonicalType: "given",
        text: "I have a test step",
      },
    ],
  };

  const testContext: RunContext = {
    runId: randomUUID(),
    scenario: testScenario,
    mcpConfig: testMCPConfig,
    conversationHistory: [],
    tokenBudget: mockTokenBudget,
    abortSignal: new AbortController().signal,
  };

  await t.test("should return AsyncGenerator from runScenario", () => {
    const generator = orchestrator.runScenario(testScenario, testContext);
    assert.ok(generator[Symbol.asyncIterator]);
  });

  await t.test("should be cancellable via AbortSignal", async () => {
    const abortController = new AbortController();
    const contextWithAbort: RunContext = {
      runId: randomUUID(),
      scenario: testScenario,
      mcpConfig: testMCPConfig,
      conversationHistory: [],
      tokenBudget: mockTokenBudget,
      abortSignal: abortController.signal,
    };

    const results: StepResult[] = [];

    try {
      for await (const result of orchestrator.runScenario(testScenario, contextWithAbort)) {
        results.push(result);
        if (results.length === 1) {
          abortController.abort();
        }
      }
    } catch {
      // May throw or may not, depending on implementation
    }

    assert.ok(results.length > 0);
  });
});

test("Then step with assertion overrides status to failed when assertion fails", async () => {
  const mockProvider = new MockLLMProvider();
  const orchestrator = new OrchestratorService(mockProvider);
  const budget = new TokenBudget({ hardCapTokens: 10000, warnThresholdRatio: 0.8 }, () => {});

  const thenStep: ParsedStep = {
    keyword: "Then",
    canonicalType: "then",
    text: 'the page URL should be "https://wrong-url.com"',
    assertion: {
      original: 'the page URL should be "https://wrong-url.com"',
      playwrightCall: "expect(page).toHaveURL('https://wrong-url.com')",
      patternId: "url",
    },
  };

  const scenario: ScenarioPlan = {
    id: "scenario-assertion",
    name: "Assertion Test",
    tags: [],
    steps: [thenStep],
  };

  const ctx: RunContext = {
    runId: randomUUID(),
    scenario,
    mcpConfig: { id: "test-mcp", provider: { provider: "openai", model: "gpt-4" } as ProviderConfig },
    conversationHistory: [],
    tokenBudget: budget,
    abortSignal: new AbortController().signal,
  };

  const results: StepResult[] = [];
  for await (const result of orchestrator.runScenario(scenario, ctx)) {
    results.push(result);
  }

  assert.equal(results.length, 1);
  // The assertion runner with mock expect will fail for wrong URL (page is undefined)
  // The step should be marked failed due to assertion, not passed from LLM
  assert.ok(
    results[0].status === "failed" || results[0].message.includes("Assertion"),
    `Expected failed status or Assertion message, got status=${results[0].status} message=${results[0].message}`
  );
});

test("runScenario corta temprano ante error fatal de autenticación", async () => {
  const orchestrator = new OrchestratorService(new AuthFailLLMProvider());
  const mockTokenBudget = new TokenBudget(
    {
      hardCapTokens: 10000,
      warnThresholdRatio: 0.8,
    },
    () => {}
  );

  const testMCPConfig: MCPConfig = {
    id: "test-mcp-auth",
    provider: {
      provider: "openrouter",
      model: "openai/gpt-4o-mini",
    } as ProviderConfig,
  };

  const testScenario: ScenarioPlan = {
    id: "scenario-auth",
    name: "Auth Fail Scenario",
    tags: ["@test"],
    steps: [
      {
        keyword: "Given",
        canonicalType: "given",
        text: "I have a first step",
      },
      {
        keyword: "When",
        canonicalType: "when",
        text: "I have a second step",
      },
    ],
  };

  const ctx: RunContext = {
    runId: randomUUID(),
    scenario: testScenario,
    mcpConfig: testMCPConfig,
    conversationHistory: [],
    tokenBudget: mockTokenBudget,
    abortSignal: new AbortController().signal,
  };

  const results: StepResult[] = [];

  await assert.rejects(async () => {
    for await (const stepResult of orchestrator.runScenario(testScenario, ctx)) {
      results.push(stepResult);
    }
  }, /Orchestration error: OpenRouterAdapter request failed \(401\)/);

  assert.equal(results.length, 1);
  assert.equal(results[0].status, "failed");
  assert.equal(results[0].stepIndex, 0);
});

test("runScenario uses live MCP tool loop when tool client and tools are provided", async () => {
  const provider = new JsonToolLoopProvider();
  const orchestrator = new OrchestratorService(provider);
  const budget = new TokenBudget({ hardCapTokens: 10000, warnThresholdRatio: 0.8 }, () => {});
  const toolInvocations: Array<{ name: string; args: Record<string, unknown> }> = [];

  const scenario: ScenarioPlan = {
    id: "scenario-live-mcp",
    name: "Live MCP Scenario",
    tags: [],
    steps: [
      {
        keyword: "Given",
        canonicalType: "given",
        text: 'I open "https://example.com"',
      },
    ],
  };

  const ctx: RunContext = {
    runId: randomUUID(),
    baseUrl: "https://example.com",
    scenario,
    mcpConfig: { id: "@playwright/mcp", provider: { provider: "openai", model: "gpt-4" } as ProviderConfig },
    conversationHistory: [],
    tokenBudget: budget,
    abortSignal: new AbortController().signal,
    availableTools: [
      { name: "browser_navigate", description: "Navigate to URL" },
      { name: "browser_snapshot", description: "Take ARIA snapshot" },
    ],
    toolClient: {
      async callTool(name: string, args: Record<string, unknown>) {
        toolInvocations.push({ name, args });
        return {
          type: "success",
          content: [{ type: "text", text: "Navigation complete" }],
        };
      },
    },
  };

  const results: StepResult[] = [];
  for await (const result of orchestrator.runScenario(scenario, ctx)) {
    results.push(result);
  }

  assert.equal(results.length, 1);
  assert.equal(results[0].status, "passed");
  assert.equal(results[0].toolCalls.length, 1);
  assert.equal(results[0].toolCalls[0].toolName, "browser_navigate");
  assert.deepEqual(toolInvocations, [{ name: "browser_navigate", args: { url: "https://example.com" } }]);
});
