import { randomUUID } from "node:crypto";

import { TokenBudget } from "../../shared/harness/TokenBudget";
import type {
  LLMChunk,
  LLMMessage,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  ProviderConfig,
  ProviderName,
} from "../../shared/llm/types";
import type { ToolDefinition } from "../../shared/registry/types";
import type { RunEstimateRequest } from "../../server/runManager";
import type {
  MCPConfig,
  MCPToolClient,
  MCPToolResult,
  RunContext,
  StepResult,
  ToolCallTrace,
} from "../../server/orchestrator/types";
import type { ParsedStep, ScenarioPlan } from "../../server/parser";

export const FIXED_TIMESTAMP = "2026-04-04T12:00:00.000Z";

export const loggerStub: {
  info: () => undefined;
  warn: () => undefined;
  error: () => undefined;
  debug: () => undefined;
  trace: () => undefined;
  fatal: () => undefined;
  child: () => typeof loggerStub;
  level: string;
  silent: () => undefined;
} = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  fatal: () => undefined,
  child: () => loggerStub,
  level: "info",
  silent: () => undefined,
};

type ResponseSeed =
  | string
  | Error
  | {
      content: string;
      usage?: Partial<LLMResponse["usage"]>;
    };

export class ScriptedLLMProvider implements LLMProvider {
  public readonly requests: LLMRequest[] = [];
  private readonly queue: ResponseSeed[];

  constructor(responses: ResponseSeed[]) {
    this.queue = [...responses];
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    this.requests.push(request);

    const next = this.queue.shift();
    if (!next) {
      throw new Error("No scripted LLM response available.");
    }

    if (next instanceof Error) {
      throw next;
    }

    const content = typeof next === "string" ? next : next.content;
    const usage = typeof next === "string" ? {} : next.usage;

    return createLlmResponse(content, request.model, usage);
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

export class AuthFailureProvider extends ScriptedLLMProvider {
  constructor(message = "OpenRouterAdapter request failed (401)") {
    super([new Error(message)]);
  }
}

export function createLlmResponse(
  content: string,
  model = "gpt-4o-mini",
  usage?: Partial<LLMResponse["usage"]>
): LLMResponse {
  const promptTokens = usage?.promptTokens ?? 120;
  const completionTokens = usage?.completionTokens ?? 30;
  const totalTokens = usage?.totalTokens ?? promptTokens + completionTokens;

  return {
    id: randomUUID(),
    model,
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
      promptTokens,
      completionTokens,
      totalTokens,
    },
  };
}

export function buildParsedStep(overrides: Partial<ParsedStep> = {}): ParsedStep {
  const keyword = overrides.keyword ?? "Given";
  const canonicalType = overrides.canonicalType ?? "given";
  return {
    keyword,
    canonicalType,
    text: overrides.text ?? "I have a test step",
    assertion: overrides.assertion,
  };
}

export function buildScenario(options: {
  id?: string;
  name?: string;
  tags?: string[];
  steps?: ParsedStep[];
} = {}): ScenarioPlan {
  return {
    id: options.id ?? "scenario-1",
    name: options.name ?? "Test Scenario",
    tags: options.tags ?? ["@test"],
    steps: options.steps ?? [buildParsedStep()],
  };
}

export function createTokenBudget(options: {
  hardCapTokens?: number;
  warnThresholdRatio?: number;
  usedTokens?: number;
} = {}): TokenBudget {
  const budget = new TokenBudget(
    {
      hardCapTokens: options.hardCapTokens ?? 10_000,
      warnThresholdRatio: options.warnThresholdRatio ?? 0.8,
    },
    () => undefined
  );

  if (options.usedTokens) {
    budget.addUsage(options.usedTokens);
  }

  return budget;
}

export function buildMcpConfig(overrides: Partial<MCPConfig> & {
  providerName?: ProviderName;
  model?: string;
} = {}): MCPConfig {
  const provider: ProviderConfig = overrides.provider ?? {
    provider: overrides.providerName ?? "openai",
    model: overrides.model ?? "gpt-4o-mini",
  };

  return {
    id: overrides.id ?? "@playwright/mcp",
    provider,
  };
}

export function buildRunContext(options: {
  runId?: string;
  baseUrl?: string;
  scenario?: ScenarioPlan;
  mcpConfig?: MCPConfig;
  conversationHistory?: LLMMessage[];
  abortSignal?: AbortSignal;
  hardCapTokens?: number;
  usedTokens?: number;
  toolClient?: MCPToolClient;
  availableTools?: ToolDefinition[];
} = {}): RunContext {
  const scenario = options.scenario ?? buildScenario();

  return {
    runId: options.runId ?? randomUUID(),
    baseUrl: options.baseUrl,
    scenario,
    mcpConfig: options.mcpConfig ?? buildMcpConfig(),
    conversationHistory: options.conversationHistory ?? [],
    tokenBudget: createTokenBudget({
      hardCapTokens: options.hardCapTokens,
      usedTokens: options.usedTokens,
    }),
    abortSignal: options.abortSignal ?? new AbortController().signal,
    toolClient: options.toolClient,
    availableTools: options.availableTools,
  };
}

export class FakeToolClient implements MCPToolClient {
  public readonly invocations: Array<{ name: string; args: Record<string, unknown> }> = [];

  constructor(
    private readonly handler: (
      name: string,
      args: Record<string, unknown>
    ) => MCPToolResult | Promise<MCPToolResult> = () => ({
      type: "success",
      content: [{ type: "text", text: "Tool completed" }],
    })
  ) {}

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    this.invocations.push({ name, args });
    return this.handler(name, args);
  }
}

export function createToolDefinition(name: string, description = `Tool ${name}`): ToolDefinition {
  return {
    name,
    description,
  };
}

export async function collectResults(generator: AsyncIterable<StepResult>): Promise<StepResult[]> {
  const results: StepResult[] = [];
  for await (const result of generator) {
    results.push(result);
  }
  return results;
}

export function createToolTrace(overrides: Partial<ToolCallTrace> = {}): ToolCallTrace {
  return {
    toolId: overrides.toolId ?? "tool-1",
    toolName: overrides.toolName ?? "browser_navigate",
    arguments: overrides.arguments ?? {},
    status: overrides.status ?? "success",
    correlationId: overrides.correlationId ?? "corr-1",
    latencyMs: overrides.latencyMs ?? 15,
    captureTimestamp: overrides.captureTimestamp ?? FIXED_TIMESTAMP,
    screenshotId: overrides.screenshotId,
    result: overrides.result,
    error: overrides.error,
    errorMessage: overrides.errorMessage,
  };
}

export function buildEstimateRequest(overrides: Partial<RunEstimateRequest> = {}): RunEstimateRequest {
  return {
    baseUrl: overrides.baseUrl ?? "https://example.com",
    featureText:
      overrides.featureText ??
      `Feature: Demo\n  Scenario: smoke\n    Given I open the page\n    When I click login\n    Then I should see the dashboard`,
    selectedMcpIds: overrides.selectedMcpIds ?? ["@playwright/mcp"],
    tokenCap: overrides.tokenCap ?? 12_000,
    provider: overrides.provider,
    orchestratorModel: overrides.orchestratorModel,
    lowCostAuditorModel: overrides.lowCostAuditorModel,
    highAccuracyAuditorModel: overrides.highAccuracyAuditorModel,
  };
}

export async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  run: () => Promise<T> | T
): Promise<T> {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
