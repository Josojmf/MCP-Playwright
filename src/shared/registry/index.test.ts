import assert from "node:assert/strict";
import test from "node:test";
import { getMCPLabel, getRegistryEntry, getToolsForMCP } from "./utils";

test("getRegistryEntry returns playwright registry entry", () => {
  const entry = getRegistryEntry("@playwright/mcp");
  assert.ok(entry);
  assert.equal(entry?.toolNamespacePrefix, "browser_");
});

test("getRegistryEntry returns null for unknown id", () => {
  const entry = getRegistryEntry("unknown");
  assert.equal(entry, null);
});

test("getMCPLabel returns fallback id when not found", () => {
  assert.equal(getMCPLabel("unknown"), "unknown");
});

test("getToolsForMCP filters tools by namespace prefix", () => {
  const tools = [
    { name: "browser_navigate", description: "navigate" },
    { name: "browser_click", description: "click" },
    { name: "puppeteer_click", description: "click" },
  ];

  const playwrightTools = getToolsForMCP("@playwright/mcp", tools);
  const puppeteerTools = getToolsForMCP("@modelcontextprotocol/server-puppeteer", tools);

  assert.equal(playwrightTools.length, 2);
  assert.equal(puppeteerTools.length, 1);
  assert.equal(playwrightTools.every((tool) => tool.name.startsWith("browser_")), true);
  assert.equal(puppeteerTools.every((tool) => tool.name.startsWith("puppeteer_")), true);
});
