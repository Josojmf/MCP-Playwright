import { PRICING_TABLE, PricingRecord } from "./table";

interface OpenRouterModelsResponse {
  data?: Array<{
    id?: string;
    pricing?: {
      prompt?: string | number;
      completion?: string | number;
    };
  }>;
}

export function resolvePricing(provider: string, model: string): PricingRecord | null {
  return PRICING_TABLE[`${provider}:${model}`] ?? null;
}

export function estimateCostUsd(inputTokens: number, outputTokens: number, pricing: PricingRecord): number {
  const inputCost = (Math.max(0, inputTokens) / 1_000_000) * pricing.inputPer1MTokens;
  const outputCost = (Math.max(0, outputTokens) / 1_000_000) * pricing.outputPer1MTokens;
  return Number((inputCost + outputCost).toFixed(6));
}

export async function fetchOpenRouterPricing(
  apiKey: string = process.env.OPENROUTER_API_KEY ?? "",
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 20_000
): Promise<Map<string, PricingRecord>> {
  if (!apiKey) {
    return new Map();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl("https://openrouter.ai/api/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return new Map();
    }

    const payload = (await response.json()) as OpenRouterModelsResponse;
    const output = new Map<string, PricingRecord>();

    for (const model of payload.data ?? []) {
      if (!model.id || !model.pricing) {
        continue;
      }

      const inputPerToken = Number(model.pricing.prompt ?? 0);
      const outputPerToken = Number(model.pricing.completion ?? 0);
      if (!Number.isFinite(inputPerToken) || !Number.isFinite(outputPerToken)) {
        continue;
      }

      output.set(model.id, {
        inputPer1MTokens: Number((inputPerToken * 1_000_000).toFixed(6)),
        outputPer1MTokens: Number((outputPerToken * 1_000_000).toFixed(6)),
      });
    }

    return output;
  } catch {
    return new Map();
  } finally {
    clearTimeout(timeout);
  }
}
