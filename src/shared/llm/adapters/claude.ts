import { estimateCostUsd, resolvePricing } from "../../pricing/resolver";
import { LLMChunk, LLMMessage, LLMProvider, LLMRequest, LLMResponse, LLMUsage } from "../types";

interface ClaudeMessageResponse {
  id?: string;
  model?: string;
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string | null;
}

interface ClaudePayload {
  model: string;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export function splitSystemPrompt(messages: LLMMessage[]): { systemPrompt: string; conversation: LLMMessage[] } {
  const systemParts: string[] = [];
  const conversation: LLMMessage[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      if (message.content.trim()) {
        systemParts.push(message.content.trim());
      }
      continue;
    }

    conversation.push(message);
  }

  return {
    systemPrompt: systemParts.join("\n\n"),
    conversation,
  };
}

export function toClaudePayload(request: LLMRequest): ClaudePayload {
  const { systemPrompt, conversation } = splitSystemPrompt(request.messages);

  const normalizedMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const message of conversation) {
    if (message.role === "user" || message.role === "assistant") {
      normalizedMessages.push({
        role: message.role,
        content: message.content,
      });
    }
  }

  const payload: ClaudePayload = {
    model: request.model,
    max_tokens: request.maxTokens ?? 1024,
    temperature: request.temperature,
    top_p: request.topP,
    messages: normalizedMessages,
  };

  if (systemPrompt) {
    payload.system = systemPrompt;
  }

  return payload;
}

export class ClaudeAdapter implements LLMProvider {
  private readonly endpoint = "https://api.anthropic.com/v1/messages";

  constructor(private readonly apiKey: string, private readonly fetchImpl: typeof fetch = fetch) {}

  public async complete(request: LLMRequest): Promise<LLMResponse> {
    const payload = toClaudePayload(request);

    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`ClaudeAdapter request failed (${response.status})`);
    }

    const body = (await response.json()) as ClaudeMessageResponse;

    const content = (body.content ?? [])
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("");

    const usage: LLMUsage = {
      promptTokens: body.usage?.input_tokens ?? 0,
      completionTokens: body.usage?.output_tokens ?? 0,
      totalTokens: (body.usage?.input_tokens ?? 0) + (body.usage?.output_tokens ?? 0),
    };

    const estimatedCostUsd = await this.estimateCost(usage.promptTokens, usage.completionTokens, request.model);

    return {
      id: body.id ?? crypto.randomUUID(),
      model: body.model ?? request.model,
      usage: {
        ...usage,
        estimatedCostUsd,
      },
      choices: [
        {
          index: 0,
          finishReason: body.stop_reason ?? null,
          message: {
            role: "assistant",
            content,
          },
        },
      ],
    };
  }

  public async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    const response = await this.complete(request);
    const content = response.choices[0]?.message.content ?? "";

    yield {
      id: response.id,
      model: response.model,
      index: 0,
      delta: content,
      finishReason: response.choices[0]?.finishReason ?? "stop",
      usage: response.usage,
    };
  }

  public async estimateCost(inputTokens: number, outputTokens: number, model: string): Promise<number> {
    const pricing = resolvePricing("claude", model) ?? resolvePricing("claude", "default");
    return estimateCostUsd(inputTokens, outputTokens, pricing ?? { inputPer1MTokens: 3, outputPer1MTokens: 15 });
  }
}
