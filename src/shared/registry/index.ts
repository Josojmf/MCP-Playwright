import { MCPRegistry } from "./types";

export const MCP_REGISTRY: MCPRegistry = {
  "@playwright/mcp": {
    id: "@playwright/mcp",
    label: "@playwright/mcp",
    toolNamespacePrefix: "browser_",
    transportMode: "stdio",
    parallelismModel: "multiple",
    tags: ["aria", "microsoft", "stable"],
    description: "Playwright MCP by Microsoft, ARIA snapshot mode",
  },
  "@modelcontextprotocol/server-puppeteer": {
    id: "@modelcontextprotocol/server-puppeteer",
    label: "@modelcontextprotocol/server-puppeteer",
    toolNamespacePrefix: "puppeteer_",
    transportMode: "stdio",
    parallelismModel: "multiple",
    tags: ["css-selectors", "anthropic", "stable"],
    description: "Puppeteer MCP by Anthropic, CSS selector mode",
  },
};

export * from "./types";
