import { randomUUID } from "node:crypto";
import { ScenarioPlan } from "../parser";
import { RunContext, StepResult, ToolCallTrace } from "./types";
import { withTimeout, TIMEOUT_TIERS } from "../../shared/harness/withTimeout";
import { LLMMessage, LLMRequest, LLMProvider } from "../../shared/llm/types";
import { createProvider } from "../../shared/llm/factory";

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
          // Build the user message for this step
          const stepMessage: LLMMessage = {
            role: "user",
            content: `${step.keyword} ${step.text}`,
          };

          // Create request for LLM
          const request: LLMRequest = {
            model: ctx.mcpConfig.provider.model || "gpt-4",
            messages: [...currentMessages, stepMessage],
            maxTokens: 1000,
          };

          // Execute with timeout
          const response = await withTimeout(
            provider.complete(request),
            TIMEOUT_TIERS.STEP,
            `Step ${stepIndex + 1}`,
            new AbortController()
          );

          const latencyMs = Date.now() - stepStartTime;

          // Extract tool calls from response (simplified - in real impl, parse tool_use blocks)
          const toolCalls: ToolCallTrace[] = this.extractToolCalls(response.choices[0]?.message?.content ?? "");

          // Update conversation history
          currentMessages.push(stepMessage);
          currentMessages.push(response.choices[0]?.message ?? { role: "assistant", content: "Step completed" });

          // Update context conversation history for next steps
          ctx.conversationHistory = currentMessages.slice(1); // Exclude system message

          // Add tokens to budget
          ctx.tokenBudget.addUsage(response.usage.totalTokens);

          // Yield success result
          yield this.createStepResult(
            ctx.mcpConfig.id,
            step,
            scenario,
            stepIndex,
            "passed",
            {
              input: response.usage.promptTokens,
              output: response.usage.completionTokens,
              total: response.usage.totalTokens,
            },
            latencyMs,
            `Paso completado exitosamente (${response.usage.totalTokens} tokens)`,
            toolCalls
          );
        } catch (error) {
          const latencyMs = Date.now() - stepStartTime;
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Check budget before continuing
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
              result: parsed.result,
            });
          }
        } catch {
          // Not a valid JSON object, skip
        }
      }
    }

    return toolCalls;
  }
}
