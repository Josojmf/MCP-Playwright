import assert from "node:assert/strict";
import test from "node:test";
import { createProvider, ProviderConfigError } from "./factory";
import { LLMProvider } from "./types";

function hasProviderShape(value: unknown): value is LLMProvider {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LLMProvider>;
  return typeof candidate.complete === "function" && typeof candidate.stream === "function";
}

test("factory returns openrouter provider", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  const provider = await createProvider({ provider: "openrouter" });
  assert.equal(hasProviderShape(provider), true);
});

test("factory returns azure provider with endpoint/deployment", async () => {
  process.env.AZURE_OPENAI_API_KEY = "test-key";

  const provider = await createProvider({
    provider: "azure",
    azureEndpoint: "https://example.openai.azure.com",
    azureDeploymentName: "gpt-4o-deployment",
  });

  assert.equal(hasProviderShape(provider), true);
});

test("factory returns openai provider", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  const provider = await createProvider({ provider: "openai" });
  assert.equal(hasProviderShape(provider), true);
});

test("factory returns claude provider", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  const provider = await createProvider({ provider: "claude" });
  assert.equal(hasProviderShape(provider), true);
});

test("factory throws ProviderConfigError when missing credential", async () => {
  delete process.env.OPENAI_API_KEY;

  await assert.rejects(
    createProvider({ provider: "openai" }),
    (error: unknown) => error instanceof ProviderConfigError
  );
});
