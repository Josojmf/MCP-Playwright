import { randomUUID } from "node:crypto";
import { ScenarioPlan } from "../parser";
import { RunContext, StepResult, ToolCallTrace } from "./types";
import { withTimeout, TIMEOUT_TIERS } from "../../shared/harness/withTimeout";
import { LLMMessage, LLMRequest, LLMProvider } from "../../shared/llm/types";
import { createProvider } from "../../shared/llm/factory";
import { assembleSystemPrompt } from "../../shared/llm/systemPrompt";
import { BudgetExceededError } from "../../shared/harness/TokenBudget";
import { runAssertion, AssertionResult } from "../validation/assertionsRunner";

/**
 * Completion cap per orchestrator call. Tool decisions are small JSON; a high max_tokens
 * can trigger OpenRouter 402 when remaining credits cover slightly less than requested.
 */
const ORCHESTRATOR_LLM_MAX_TOKENS = 512;

const MCP_AGENT_TEMPLATE = `You are a browser automation assistant. You must decide the next single MCP action for the current Gherkin step.

Available tools:
{TOOL_LIST}

Rules:
- Reply with JSON only.
- Use one of these shapes:
  {"kind":"tool","toolName":"exact_tool_name","arguments":{"key":"value"},"reason":"short reason"}
  {"kind":"done","status":"passed","message":"short summary"}
  {"kind":"done","status":"failed","message":"short failure summary"}
- Use only tool names listed above.
- For Playwright snapshot tools, take a fresh snapshot before clicking or filling by ref.
- If a tool fails, inspect the error and choose the next best tool call or finish as failed.
- Finish as soon as the step objective is satisfied.`;

interface ToolDecision {
  kind: "tool" | "done";
  toolName?: string;
  arguments?: Record<string, unknown>;
  status?: "passed" | "failed";
  message?: string;
  reason?: string;
}

/**
 * OrchestratorService orchestrates sequential execution of a scenario
 * against a single MCP with persistent conversational state.
 *
 * For each step:
 * - Maintains accumulated conversation history
 * - Delegates tool calls to MCP
 * - Counts tokens per step
 * - Emits StepResult via AsyncGenerator
 * - Marks failed steps but continues (configurable)
 */
export class OrchestratorService {
  constructor(private mockProvider?: LLMProvider) {}

  /**
   * Execute a scenario step-by-step with persistent conversation.
   * Yields StepResult for each step execution.
   *
   * Behavior:
   * - Iterates over steps in scenario
   * - Maintains accumulated conversation between steps
   * - Emits StepResult per step
   * - Integrates timeout via withTimeout
   * - Delegates tool calls to MCP
   * - Counts tokens by step
   * - On error: marks failed and continues (configurable via continueOnError)
   */
  public async *runScenario(
    scenario: ScenarioPlan,
    ctx: RunContext,
    options?: { continueOnError?: boolean }
  ): AsyncGenerator<StepResult> {
    const continueOnError = options?.continueOnError ?? true;

    // Request initialization - we build messages as we process steps
    const initialMessages: LLMMessage[] = [
      {
        role: "system",
        content: `You are a test automation agent. Execute the following Gherkin scenario steps and report results.
Scenario: ${scenario.name}`,
      },
      ...ctx.conversationHistory,
    ];

    let currentMessages: LLMMessage[] = [...initialMessages];

    try {
      // Create or use provided LLM provider
      const provider = this.mockProvider || (await createProvider(ctx.mcpConfig.provider));

      for (let stepIndex = 0; stepIndex < scenario.steps.length; stepIndex++) {
        if (ctx.abortSignal.aborted) {
          yield this.createStepResult(
            ctx.mcpConfig.id,
            scenario.steps[stepIndex],
            scenario,
            stepIndex,
            "aborted",
            {
              input: 0,
              output: 0,
              total: 0,
            },
            0,
            "Ejecución abortada por usuario",
            []
          );
          break;
        }

        const step = scenario.steps[stepIndex];
        const stepStartTime = Date.now();

        try {
          const hasLiveMcpTools = Boolean(ctx.toolClient && ctx.availableTools && ctx.availableTools.length > 0);

          if (hasLiveMcpTools) {
            const liveResult = await this.executeStepWithLiveMcp(
              provider,
              currentMessages,
              scenario,
              stepIndex,
              ctx
            );

            currentMessages = liveResult.nextConversation;
            ctx.conversationHistory = currentMessages.slice(1);

            yield this.createStepResult(
              ctx.mcpConfig.id,
              step,
              scenario,
              stepIndex,
              liveResult.status,
              liveResult.tokens,
              Date.now() - stepStartTime,
              liveResult.message,
              liveResult.toolCalls
            );
            continue;
          }

          const legacyResult = await this.executeStepWithTextOnlyProvider(
            provider,
            currentMessages,
            scenario,
            stepIndex,
            ctx
          );

          currentMessages = legacyResult.nextConversation;
          ctx.conversationHistory = currentMessages.slice(1);

          yield this.createStepResult(
            ctx.mcpConfig.id,
            step,
            scenario,
            stepIndex,
            legacyResult.status,
            legacyResult.tokens,
            Date.now() - stepStartTime,
            legacyResult.message,
            legacyResult.toolCalls
          );
        } catch (error) {
          const latencyMs = Date.now() - stepStartTime;
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Budget exceeded is fatal -- abort the entire run
          if (error instanceof BudgetExceededError) {
            yield this.createStepResult(
              ctx.mcpConfig.id,
              step,
              scenario,
              stepIndex,
              "aborted",
              { input: 0, output: 0, total: 0 },
              latencyMs,
              `Presupuesto de tokens excedido: ${error.message}`,
              []
            );
            return; // Exit the generator entirely
          }

          // Check abort signal before continuing
          if (ctx.abortSignal.aborted) {
            yield this.createStepResult(
              ctx.mcpConfig.id,
              step,
              scenario,
              stepIndex,
              "aborted",
              { input: 0, output: 0, total: 0 },
              latencyMs,
              "Ejecución abortada por usuario",
              []
            );
            break;
          }

          // Yield failed result
          yield this.createStepResult(
            ctx.mcpConfig.id,
            step,
            scenario,
            stepIndex,
            "failed",
            { input: 0, output: 0, total: 0 },
            latencyMs,
            `Falló la ejecución: ${errorMessage}`,
            []
          );

          if (this.isFatalStepError(errorMessage)) {
            throw new Error(errorMessage);
          }

          if (!continueOnError) {
            throw error;
          }
        }
      }
    } catch (error) {
      // Fatal error during orchestration
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Orchestration error: ${errorMessage}`);
    }
  }

  /**
   * Create a StepResult object
   */
  private createStepResult(
    mcpId: string,
    step: typeof scenario.steps[0],
    scenario: ScenarioPlan,
    stepIndex: number,
    status: "running" | "passed" | "failed" | "aborted",
    tokens: { input: number; output: number; total: number },
    latencyMs: number,
    message: string,
    toolCalls: ToolCallTrace[]
  ): StepResult {
    return {
      stepId: randomUUID(),
      mcpId,
      stepIndex,
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      stepText: `${step.keyword} ${step.text}`,
      canonicalType: step.canonicalType,
      status,
      tokens,
      latencyMs,
      message,
      toolCalls,
      timestamp: new Date().toISOString(),
    };
  }

  private async executeStepWithTextOnlyProvider(
    provider: LLMProvider,
    currentMessages: LLMMessage[],
    scenario: ScenarioPlan,
    stepIndex: number,
    ctx: RunContext
  ): Promise<{
    status: "passed" | "failed";
    tokens: { input: number; output: number; total: number };
    message: string;
    toolCalls: ToolCallTrace[];
    nextConversation: LLMMessage[];
  }> {
    const step = scenario.steps[stepIndex];
    const stepMessage: LLMMessage = {
      role: "user",
      content: `${step.keyword} ${step.text}`,
    };

    const request: LLMRequest = {
      model: ctx.mcpConfig.provider.model || "gpt-4",
      messages: [...currentMessages, stepMessage],
      maxTokens: ORCHESTRATOR_LLM_MAX_TOKENS,
    };

    ctx.tokenBudget.checkBudget();

    const response = await withTimeout(
      provider.complete(request),
      TIMEOUT_TIERS.STEP,
      `Step ${stepIndex + 1}`,
      new AbortController()
    );

    const msgContent = response.choices[0]?.message?.content ?? "";
    const contentStr = typeof msgContent === "string" ? msgContent : "";
    const toolCalls: ToolCallTrace[] = this.extractToolCalls(contentStr);

    const nextConversation = [
      ...currentMessages,
      stepMessage,
      response.choices[0]?.message ?? { role: "assistant", content: "Step completed" },
    ];

    ctx.tokenBudget.addUsage(response.usage.totalTokens);

    let assertionOverride: AssertionResult | null = null;
    if (step.canonicalType === "then" && step.assertion) {
      assertionOverride = await runAssertion(step.assertion, {});
    }

    const stepStatus = assertionOverride?.status === "failed" ? "failed" : "passed";
    const stepResultMessage = assertionOverride?.status === "failed"
      ? `Assertion independiente falló: ${assertionOverride.message}`
      : `Paso completado exitosamente (${response.usage.totalTokens} tokens)`;

    return {
      status: stepStatus,
      tokens: {
        input: response.usage.promptTokens,
        output: response.usage.completionTokens,
        total: response.usage.totalTokens,
      },
      message: stepResultMessage,
      toolCalls,
      nextConversation,
    };
  }

  private async executeStepWithLiveMcp(
    provider: LLMProvider,
    currentMessages: LLMMessage[],
    scenario: ScenarioPlan,
    stepIndex: number,
    ctx: RunContext
  ): Promise<{
    status: "passed" | "failed";
    tokens: { input: number; output: number; total: number };
    message: string;
    toolCalls: ToolCallTrace[];
    nextConversation: LLMMessage[];
  }> {
    const step = scenario.steps[stepIndex];
    const availableTools = ctx.availableTools ?? [];
    const availableToolNames = new Set(availableTools.map((tool) => tool.name));
    const stepPrompt = this.buildLiveStepPrompt(ctx.baseUrl, scenario.name, `${step.keyword} ${step.text}`);
    const stepConversation: LLMMessage[] = [
      ...currentMessages.filter((message) => message.role !== "system"),
      { role: "user", content: stepPrompt },
    ];
    const toolCalls: ToolCallTrace[] = [];
    const tokenUsage = { input: 0, output: 0, total: 0 };
    const maxTurns = 8;

    for (let turn = 0; turn < maxTurns; turn += 1) {
      ctx.tokenBudget.checkBudget();

      const response = await withTimeout(
        provider.complete({
          model: ctx.mcpConfig.provider.model || "gpt-4",
          messages: [
            {
              role: "system",
              content: assembleSystemPrompt(ctx.mcpConfig.id, availableTools, MCP_AGENT_TEMPLATE),
            },
            ...stepConversation,
          ],
          maxTokens: ORCHESTRATOR_LLM_MAX_TOKENS,
          responseFormat: { type: "json_object" },
        }),
        TIMEOUT_TIERS.STEP,
        `Step ${stepIndex + 1} live MCP turn ${turn + 1}`,
        new AbortController()
      );

      tokenUsage.input += response.usage.promptTokens;
      tokenUsage.output += response.usage.completionTokens;
      tokenUsage.total += response.usage.totalTokens;
      ctx.tokenBudget.addUsage(response.usage.totalTokens);

      const assistantText = this.asString(response.choices[0]?.message?.content);
      const decision = this.parseToolDecision(assistantText);
      stepConversation.push({
        role: "assistant",
        content: assistantText || '{"kind":"done","status":"failed","message":"Empty model response"}',
      });

      if (!decision) {
        stepConversation.push({
          role: "user",
          content: 'Respuesta inválida. Devuelve solo JSON con {"kind":"tool",...} o {"kind":"done",...}.',
        });
        continue;
      }

      if (decision.kind === "done") {
        const message = decision.message?.trim() || `Paso ${decision.status === "failed" ? "fallido" : "completado"} con MCP real`;
        const nextConversation = [
          ...currentMessages,
          { role: "user" as const, content: `${step.keyword} ${step.text}` },
          { role: "assistant" as const, content: message },
        ];

        return {
          status: decision.status === "failed" ? "failed" : "passed",
          tokens: tokenUsage,
          message,
          toolCalls,
          nextConversation,
        };
      }

      const toolName = decision.toolName?.trim() ?? "";
      const toolArgs = decision.arguments ?? {};

      if (!toolName || !availableToolNames.has(toolName)) {
        stepConversation.push({
          role: "user",
          content: `Herramienta no soportada: ${toolName || "(vacía)"}. Usa solo una de esta lista: ${[...availableToolNames].join(", ")}.`,
        });
        continue;
      }

      const toolCallStartedAt = Date.now();
      const toolResult = await ctx.toolClient!.callTool(toolName, toolArgs);
      const toolSummary = this.summarizeToolResult(toolResult);
      const captureTimestamp = new Date().toISOString();

      toolCalls.push({
        toolId: `${toolName}-${toolCalls.length + 1}`,
        toolName,
        arguments: toolArgs,
        status: toolResult.type,
        correlationId: `${toolName}-${toolCalls.length + 1}`,
        latencyMs: Date.now() - toolCallStartedAt,
        captureTimestamp,
        result: toolResult.type === "success" ? toolSummary : undefined,
        error: toolResult.type === "error" ? toolSummary : undefined,
        errorMessage: toolResult.type === "error" ? toolSummary : undefined,
      });

      stepConversation.push({
        role: "user",
        content: [
          `Resultado de ${toolName}:`,
          toolSummary,
          "Decide la siguiente acción o finaliza el paso.",
        ].join("\n"),
      });
    }

    const nextConversation = [
      ...currentMessages,
      { role: "user" as const, content: `${step.keyword} ${step.text}` },
      { role: "assistant" as const, content: "El agente agotó el límite de decisiones para este paso." },
    ];

    return {
      status: "failed",
      tokens: tokenUsage,
      message: "Se agotó el límite de decisiones del agente antes de completar el paso.",
      toolCalls,
      nextConversation,
    };
  }

  /**
   * Extract tool calls from LLM response (simplified)
   * In a real implementation, this would parse tool_use blocks, function calls, etc.
   */
  private extractToolCalls(content: string): ToolCallTrace[] {
    // Placeholder: look for JSON blocks that might represent tool calls
    const toolCalls: ToolCallTrace[] = [];

    // Simple regex to find JSON-like structures (tool call hints)
    const jsonMatches = content.match(/\{[^{}]*\}/g);
    if (jsonMatches) {
      for (const match of jsonMatches) {
        try {
          const parsed = JSON.parse(match);
          if (parsed.tool || parsed.function || parsed.action) {
            toolCalls.push({
              toolId: parsed.tool_id || parsed.function?.name || parsed.action || "unknown",
              toolName: parsed.tool || parsed.function?.name || parsed.action || "unknown",
              arguments: parsed.arguments || parsed.function?.arguments || parsed.params || {},
              status: parsed.error ? "error" : "success",
              correlationId: parsed.tool_id || parsed.function?.name || parsed.action || "unknown",
              latencyMs: 0,
              captureTimestamp: new Date().toISOString(),
              screenshotId: parsed.screenshotId,
              result: parsed.result,
              error: parsed.error,
              errorMessage: parsed.errorMessage || parsed.error,
            });
          }
        } catch {
          // Not a valid JSON object, skip
        }
      }
    }

    return toolCalls;
  }

  private buildLiveStepPrompt(baseUrl: string | undefined, scenarioName: string, stepText: string): string {
    const parts = [
      `Scenario: ${scenarioName}`,
      baseUrl ? `Base URL: ${baseUrl}` : null,
      `Current step: ${stepText}`,
      "Choose the next single MCP action needed to execute this step.",
    ];
    return parts.filter(Boolean).join("\n");
  }

  private summarizeToolResult(result: { type: "success" | "error"; content?: Array<{ type: string; text?: string }>; error?: string }): string {
    const textParts = (result.content ?? [])
      .map((part) => part.text?.trim())
      .filter((part): part is string => Boolean(part));

    const base = textParts.join("\n").trim() || result.error?.trim() || (result.type === "success" ? "Tool completed" : "Tool failed");
    return base.length > 2000 ? `${base.slice(0, 2000)}...` : base;
  }

  private parseToolDecision(raw: string): ToolDecision | null {
    const normalized = raw.trim();
    if (!normalized) {
      return null;
    }

    const cleaned = normalized
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const candidates = [cleaned];
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch && objectMatch[0] !== cleaned) {
      candidates.push(objectMatch[0]);
    }

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate) as ToolDecision;
        if (parsed && (parsed.kind === "tool" || parsed.kind === "done")) {
          return parsed;
        }
      } catch {
        // ignore invalid candidate
      }
    }

    return null;
  }

  private asString(content: LLMMessage["content"] | undefined): string {
    if (typeof content === "string") {
      return content;
    }

    if (!Array.isArray(content)) {
      return "";
    }

    return content
      .map((part) => ("text" in part ? part.text : ""))
      .join("")
      .trim();
  }

  private isFatalStepError(errorMessage: string): boolean {
    const normalized = errorMessage.toLowerCase();
    return (
      normalized.includes("missing credential") ||
      normalized.includes("request failed (401)") ||
      normalized.includes("request failed (402)") ||
      normalized.includes("request failed (403)") ||
      normalized.includes("unsupported provider") ||
      normalized.includes("requires azureendpoint") ||
      normalized.includes("requires azuredeploymentname")
    );
  }
}
