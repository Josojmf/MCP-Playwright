import { estimateCostUsd, fetchOpenRouterPricing, resolvePricing } from "../../pricing/resolver";
import { LLMChunk, LLMMessage, LLMProvider, LLMRequest, LLMResponse, LLMUsage } from "../types";

interface OpenRouterChatCompletionResponse {
  id?: string;
  model?: string;
  choices?: Array<{ index?: number; finish_reason?: string | null; message?: { role?: string; content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export class OpenRouterAdapter implements LLMProvider {
  private readonly endpoint = "https://openrouter.io/api/v1/chat/completions";
  private readonly pricingPromise: Promise<Map<string, { inputPer1MTokens: number; outputPer1MTokens: number }>>;

  constructor(private readonly apiKey: string, private readonly fetchImpl: typeof fetch = fetch) {
    this.pricingPromise = fetchOpenRouterPricing(apiKey, fetchImpl);
  }

  public async complete(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "mcp-playwright",
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
      throw new Error(`OpenRouterAdapter request failed (${response.status})`);
    }

    const payload = (await response.json()) as OpenRouterChatCompletionResponse;
    const usage: LLMUsage = {
      promptTokens: payload.usage?.prompt_tokens ?? 0,
      completionTokens: payload.usage?.completion_tokens ?? 0,
      totalTokens: payload.usage?.total_tokens ?? 0,
    };

    const headerCost = Number(response.headers.get("x-total-cost") ?? "NaN");
    const estimatedCostUsd = Number.isFinite(headerCost)
      ? headerCost
      : await this.estimateCost(usage.promptTokens, usage.completionTokens, request.model);

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
    const dynamicPricing = await this.pricingPromise;
    const dynamic = dynamicPricing.get(model);
    if (dynamic) {
      return estimateCostUsd(inputTokens, outputTokens, dynamic);
    }

    const fallback = resolvePricing("openrouter", model);
    if (!fallback) {
      return 0;
    }

    return estimateCostUsd(inputTokens, outputTokens, fallback);
  }
}
