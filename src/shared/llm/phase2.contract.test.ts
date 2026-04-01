import assert from "node:assert/strict";
import test from "node:test";

import { createProvider } from "./factory";
import { toClaudePayload } from "./adapters/claude";

test("phase2 contract: factory can swap providers by config key only", async () => {
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  process.env.AZURE_OPENAI_API_KEY = "test-azure-key";
  process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com";
  process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-4o-deploy";

  const openrouter = await createProvider({ provider: "openrouter" });
  const openai = await createProvider({ provider: "openai" });
  const claude = await createProvider({ provider: "claude" });
  const azure = await createProvider({ provider: "azure" });

  for (const provider of [openrouter, openai, claude, azure]) {
    assert.equal(typeof provider.complete, "function");
    assert.equal(typeof provider.stream, "function");
    assert.equal(typeof provider.estimateCost, "function");
  }
});

test("phase2 contract: Claude payload flattens system prompt and keeps conversation roles valid", () => {
  const payload = toClaudePayload({
    model: "claude-3-5-sonnet-latest",
    messages: [
      { role: "system", content: "Global rules" },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
      { role: "system", content: "Use concise output" },
      { role: "user", content: "Continue" },
    ],
    maxTokens: 300,
  });

  assert.equal(payload.system, "Global rules\n\nUse concise output");
  assert.equal(payload.messages.length, 3);
  assert.deepEqual(payload.messages.map((m) => m.role), ["user", "assistant", "user"]);
});

test("phase2 contract: Claude payload translates multimodal image_url data URI to anthropic image source", () => {
  const payload = toClaudePayload({
    model: "claude-3-5-sonnet-latest",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Describe image" },
          {
            type: "image_url",
            image_url: {
              url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
            },
          },
        ],
      },
    ],
  });

  assert.equal(Array.isArray(payload.messages), true);
  assert.equal(typeof payload.messages[0].content, "object");

  const parts = payload.messages[0].content as Array<{ type: string; source?: { type: string; media_type: string } }>;
  assert.ok(parts.some((part) => part.type === "text"));
  const imagePart = parts.find((part) => part.type === "image");
  assert.ok(imagePart);
  assert.equal(imagePart?.source?.type, "base64");
  assert.equal(imagePart?.source?.media_type, "image/png");
});
