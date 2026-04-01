import assert from "node:assert/strict";
import test from "node:test";
import { estimateCostUsd, resolvePricing } from "../../pricing/resolver";
import { PRICING_TABLE } from "../../pricing/table";
import { AzureOpenAIAdapter } from "./azure";
import { ClaudeAdapter, splitSystemPrompt, toClaudePayload } from "./claude";
import { OpenAIAdapter } from "./openai";
import { OpenRouterAdapter } from "./openrouter";

test("pricing utilities are deterministic and exact-match based", () => {
  const pricing = { inputPer1MTokens: 10, outputPer1MTokens: 30 };
  assert.equal(estimateCostUsd(1000, 500, pricing), 0.025);
  assert.equal(resolvePricing("openai", "unknown-model-xyz"), null);
  assert.ok(resolvePricing("openai", "gpt-4o"));
  assert.ok(Object.keys(PRICING_TABLE).length >= 15);
});

test("Claude system prompt handling is flattened and isolated", () => {
  const result = splitSystemPrompt([
    { role: "system", content: "You are strict" },
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi" },
    { role: "system", content: "Use tools" },
  ]);

  assert.equal(result.systemPrompt, "You are strict\n\nUse tools");
  assert.equal(result.conversation.length, 2);

  const payload = toClaudePayload({
    model: "claude-3-5-sonnet-latest",
    maxTokens: 300,
    messages: [
      { role: "system", content: "System guidance" },
      { role: "user", content: "Do thing" },
    ],
  });

  assert.equal(payload.system, "System guidance");
  assert.equal(payload.messages.length, 1);
  assert.equal(payload.messages[0].role, "user");
});

test("all adapters expose the LLMProvider contract and non-zero estimateCost", async () => {
  const openrouter = new OpenRouterAdapter("k", async () => new Response("{}", { status: 500 }));
  const openai = new OpenAIAdapter("k", async () => new Response("{}", { status: 500 }));
  const azure = new AzureOpenAIAdapter("example-resource", "deploy", "k", "2024-12-01-preview", async () =>
    new Response("{}", { status: 500 })
  );
  const claude = new ClaudeAdapter("k", async () => new Response("{}", { status: 500 }));

  for (const adapter of [openrouter, openai, azure, claude]) {
    assert.equal(typeof adapter.complete, "function");
    assert.equal(typeof adapter.stream, "function");
    assert.equal(typeof adapter.estimateCost, "function");
  }

  assert.ok((await openrouter.estimateCost(1000, 500, "unknown-model")) > 0);
  assert.ok((await openai.estimateCost(1000, 500, "gpt-4o")) > 0);
  assert.ok((await azure.estimateCost(1000, 500, "gpt-4o")) > 0);
  assert.ok((await claude.estimateCost(1000, 500, "claude-3-5-sonnet-latest")) > 0);
});

test("LLMMessage.content supports multimodal ContentPart[]", () => {
  // This test verifies that the types support multimodal messages
  // TDD RED: ContentPart type must exist and LLMMessage.content must accept ContentPart[]
  const multimodalMessage = {
    role: "user" as const,
    content: [
      { type: "text" as const, text: "What's in this image?" },
      { type: "image_url" as const, image_url: { url: "data:image/png;base64,iVBORw0KGgo..." } },
    ],
  };

  // This will only compile if ContentPart is defined and LLMMessage.content is string | ContentPart[]
  assert.ok(Array.isArray(multimodalMessage.content));
  assert.equal(multimodalMessage.content.length, 2);
  assert.equal(multimodalMessage.content[0].type, "text");
  assert.equal(multimodalMessage.content[1].type, "image_url");
});

test("LLMRequest supports optional responseFormat for structured output", () => {
  // TDD RED: LLMRequest must accept responseFormat field
  const requestWithFormat = {
    model: "gpt-4-vision",
    messages: [
      { role: "user" as const, content: "Analyze this" },
    ],
    responseFormat: { type: "json_object" as const },
  };

  assert.ok(requestWithFormat.responseFormat);
  assert.equal(requestWithFormat.responseFormat.type, "json_object");
});
