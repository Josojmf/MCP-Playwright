import { randomUUID } from "node:crypto";
import type { ToolCallTrace } from "../orchestrator/types";

export interface ToolResult {
  type: "success" | "error";
  content?: Array<{ type: string; text: string }>;
  error?: string;
}

export interface CaptureContext {
  runId: string;
  stepId: string;
  screenshot?: Buffer;
}

export interface BaseMcpClient {
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
}

export class InstrumentedMcpClient {
  private traces: ToolCallTrace[] = [];
  private screenshotStore = new Map<string, Buffer>();

  constructor(private readonly baseClient: BaseMcpClient) {}

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    context?: CaptureContext
  ): Promise<ToolResult> {
    const startedAt = Date.now();
    const correlationId = randomUUID();
    const captureTimestamp = new Date().toISOString();
    let screenshotId: string | undefined;
    let toolResult: ToolResult | undefined;
    let errorMessage: string | undefined;

    try {
      toolResult = await this.baseClient.callTool(toolName, args);

      if (context?.screenshot) {
        screenshotId = this.saveScreenshot(context.screenshot, context.runId, context.stepId, correlationId);
      }

      this.traces.push({
        toolId: context ? `${context.runId}-${correlationId}` : correlationId,
        toolName,
        arguments: args,
        status: toolResult.type,
        correlationId,
        latencyMs: Date.now() - startedAt,
        captureTimestamp,
        screenshotId,
        result: toolResult.type === "success" ? summarizeToolResult(toolResult) : undefined,
        error: toolResult.type === "error" ? toolResult.error : undefined,
        errorMessage: toolResult.type === "error" ? toolResult.error : undefined,
      });

      return toolResult;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);

      if (context?.screenshot) {
        screenshotId = this.saveScreenshot(context.screenshot, context.runId, context.stepId, correlationId);
      }

      this.traces.push({
        toolId: context ? `${context.runId}-${correlationId}` : correlationId,
        toolName,
        arguments: args,
        status: "error",
        correlationId,
        latencyMs: Date.now() - startedAt,
        captureTimestamp,
        screenshotId,
        error: errorMessage,
        errorMessage,
      });

      throw new Error(errorMessage);
    }
  }

  getTraces(): ToolCallTrace[] {
    return [...this.traces];
  }

  consumeTraces(): ToolCallTrace[] {
    const traces = [...this.traces];
    this.traces = [];
    return traces;
  }

  getScreenshot(screenshotId: string): Buffer | undefined {
    return this.screenshotStore.get(screenshotId);
  }

  clearTraces(): void {
    this.traces = [];
  }

  private saveScreenshot(buffer: Buffer, runId: string, stepId: string, correlationId: string): string {
    const screenshotId = `${runId}-${stepId}-${correlationId}`;
    this.screenshotStore.set(screenshotId, buffer);
    return screenshotId;
  }
}

function summarizeToolResult(result: ToolResult): string {
  const text = (result.content ?? [])
    .map((part) => part.text?.trim())
    .filter((part): part is string => Boolean(part))
    .join("\n")
    .trim();

  if (text) {
    return text;
  }

  return result.type === "error" ? result.error ?? "tool error" : "Tool completed";
}
