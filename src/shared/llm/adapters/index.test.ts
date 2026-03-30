import assert from "node:assert/strict";
import test from "node:test";
import { AzureOpenAIAdapter } from "./azure";
import { ClaudeAdapter, splitSystemPrompt, toClaudePayload } from "./claude";
import { OpenAIAdapter } from "./openai";
import { OpenRouterAdapter } from "./openrouter";

test("estimateCost is non-zero for known model pricing", async () => {
  const openai = new OpenAIAdapter("k", async () => new Response("{}", { status: 500 }));
  const azure = new AzureOpenAIAdapter("https://example.azure.com", "deploy", "k", "2024-12-01-preview", async () =>
    new Response("{}", { status: 500 })
  );
  const claude = new ClaudeAdapter("k", async () => new Response("{}", { status: 500 }));
  const openrouter = new OpenRouterAdapter("k", async () => new Response("{}", { status: 500 }));

  assert.ok((await openai.estimateCost(1000, 500, "gpt-4o")) > 0);
  assert.ok((await azure.estimateCost(1000, 500, "gpt-4o")) > 0);
  assert.ok((await claude.estimateCost(1000, 500, "claude-3-5-sonnet-latest")) > 0);
  assert.ok((await openrouter.estimateCost(1000, 500, "unknown-model")) > 0);
});

test("splitSystemPrompt extracts system messages and keeps conversation", () => {
  const result = splitSystemPrompt([
    { role: "system", content: "You are strict" },
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi" },
    { role: "system", content: "Use tools" },
  ]);

  assert.equal(result.systemPrompt, "You are strict\n\nUse tools");
  assert.equal(result.conversation.length, 2);
  assert.equal(result.conversation[0].role, "user");
  assert.equal(result.conversation[1].role, "assistant");
});

test("toClaudePayload maps system prompt as flat string", () => {
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
