import { estimateCostUsd, resolvePricing } from "../../pricing/resolver";
import { LLMChunk, LLMMessage, LLMProvider, LLMRequest, LLMResponse, LLMUsage } from "../types";

interface OpenAIChatCompletionResponse {
  id?: string;
  model?: string;
  choices?: Array<{ index?: number; finish_reason?: string | null; message?: { role?: string; content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export class OpenAIAdapter implements LLMProvider {
  private readonly endpoint = "https://api.openai.com/v1/chat/completions";

  constructor(private readonly apiKey: string, private readonly fetchImpl: typeof fetch = fetch) {}

  public async complete(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        top_p: request.topP,
        max_tokens: request.maxTokens,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAIAdapter request failed (${response.status})`);
    }

    const payload = (await response.json()) as OpenAIChatCompletionResponse;
    const usage: LLMUsage = {
      promptTokens: payload.usage?.prompt_tokens ?? 0,
      completionTokens: payload.usage?.completion_tokens ?? 0,
      totalTokens: payload.usage?.total_tokens ?? 0,
    };

    const estimatedCostUsd = await this.estimateCost(usage.promptTokens, usage.completionTokens, request.model);

    return {
      id: payload.id ?? crypto.randomUUID(),
      model: payload.model ?? request.model,
      usage: {
        ...usage,
        estimatedCostUsd,
      },
      choices: (payload.choices ?? []).map((choice, index) => ({
        index: choice.index ?? index,
        finishReason: choice.finish_reason ?? null,
        message: {
          role: (choice.message?.role as LLMMessage["role"]) ?? "assistant",
          content: choice.message?.content ?? "",
        },
      })),
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
    const pricing = resolvePricing("openai", model) ?? resolvePricing("openai", "default");
    return estimateCostUsd(inputTokens, outputTokens, pricing ?? { inputPer1MTokens: 5, outputPer1MTokens: 15 });
  }
}
