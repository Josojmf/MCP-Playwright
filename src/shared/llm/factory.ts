import { AzureOpenAIAdapter } from "./adapters/azure";
import { ClaudeAdapter } from "./adapters/claude";
import { OpenAIAdapter } from "./adapters/openai";
import { OpenRouterAdapter } from "./adapters/openrouter";
import { LLMProvider, ProviderConfig } from "./types";

export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigError";
  }
}

function requireEnv(keys: string[], hint: string): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }

  throw new ProviderConfigError(`Missing credential for ${hint}. Expected env var: ${keys.join(" or ")}`);
}

export async function createProvider(config: ProviderConfig): Promise<LLMProvider> {
  if (config.provider === "openrouter") {
    const apiKey = requireEnv(["OPENROUTER_API_KEY", "OPEN_ROUTER_API_KEY"], "openrouter");
    return new OpenRouterAdapter(apiKey);
  }

  if (config.provider === "openai") {
    const apiKey = requireEnv(["OPENAI_API_KEY"], "openai");
    return new OpenAIAdapter(apiKey);
  }

  if (config.provider === "claude") {
    const apiKey = requireEnv(["ANTHROPIC_API_KEY"], "claude");
    return new ClaudeAdapter(apiKey);
  }

  if (config.provider === "azure") {
    const apiKey = requireEnv(["AZURE_OPENAI_API_KEY"], "azure");
    const endpoint = config.azureEndpoint ?? process.env.AZURE_OPENAI_ENDPOINT;
    const deploymentName = config.azureDeploymentName ?? process.env.AZURE_OPENAI_DEPLOYMENT;

    if (!endpoint || !endpoint.trim()) {
      throw new ProviderConfigError("Azure provider requires azureEndpoint or AZURE_OPENAI_ENDPOINT");
    }

    if (!deploymentName || !deploymentName.trim()) {
      throw new ProviderConfigError("Azure provider requires azureDeploymentName or AZURE_OPENAI_DEPLOYMENT");
    }

    return new AzureOpenAIAdapter(endpoint.trim(), deploymentName.trim(), apiKey, config.azureApiVersion);
  }

  throw new ProviderConfigError(`Unsupported provider: ${String((config as { provider?: unknown }).provider)}`);
}
