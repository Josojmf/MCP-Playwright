import { estimateCostUsd, fetchOpenRouterPricing, resolvePricing } from "../../pricing/resolver";
import type { PricingRecord } from "../../pricing/table";
import { LLMChunk, LLMMessage, LLMProvider, LLMRequest, LLMResponse, LLMUsage } from "../types";

interface OpenRouterChatCompletionResponse {
  id?: string;
  model?: string;
  choices?: Array<{ index?: number; finish_reason?: string | null; message?: { role?: string; content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export class OpenRouterAdapter implements LLMProvider {
  private readonly endpoint = "https://openrouter.ai/api/v1/chat/completions";
  private readonly pricingPromise: Promise<Map<string, PricingRecord>>;

  constructor(private readonly apiKey: string, private readonly fetchImpl: typeof fetch = fetch) {
    this.pricingPromise = fetchOpenRouterPricing(apiKey, fetchImpl);
  }

  public async complete(request: LLMRequest): Promise<LLMResponse> {
    const referer = process.env.OPENROUTER_HTTP_REFERER ?? process.env.OPENROUTER_SITE_URL;
    const title = process.env.OPENROUTER_APP_NAME ?? "MCP-Playwright";
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey.trim()}`,
      "Content-Type": "application/json",
      "X-Title": title,
    };

    if (referer && referer.trim()) {
      headers["HTTP-Referer"] = referer.trim();
    }

    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        top_p: request.topP,
        max_tokens: request.maxTokens,
        ...(request.responseFormat && { response_format: request.responseFormat }),
        stream: false,
      }),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      const details = responseText ? `: ${responseText.slice(0, 500)}` : "";
      throw new Error(`OpenRouterAdapter request failed (${response.status})${details}`);
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
        } as LLMMessage,
      })),
    };
  }

  public async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    const response = await this.complete(request);
    const msgContent = response.choices[0]?.message.content ?? "";
    const content = typeof msgContent === "string" ? msgContent : "";

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

    const fallback = resolvePricing("openrouter", model) ?? resolvePricing("openrouter", "default");
    return estimateCostUsd(inputTokens, outputTokens, fallback ?? { inputPer1MTokens: 8, outputPer1MTokens: 24 });
  }
}
