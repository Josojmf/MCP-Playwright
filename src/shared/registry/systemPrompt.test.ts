import assert from "node:assert/strict";
import test from "node:test";
import { assembleSystemPrompt } from "../llm/systemPrompt";

test("assembleSystemPrompt only includes tools for selected MCP", () => {
  const prompt = assembleSystemPrompt("@playwright/mcp", [
    { name: "browser_navigate", description: "navigate" },
    { name: "browser_click", description: "click" },
    { name: "puppeteer_click", description: "click" },
  ]);

  assert.ok(prompt.includes("browser_navigate"));
  assert.ok(prompt.includes("browser_click"));
  assert.equal(prompt.includes("puppeteer_click"), false);
});
