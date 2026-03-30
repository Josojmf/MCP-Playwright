import { MCPRegistry } from './types';

export const MCP_REGISTRY: MCPRegistry = {
  '@playwright/mcp': {
    id: '@playwright/mcp',
    label: '@playwright/mcp',
    toolNamespacePrefix: 'browser_',
    transportMode: 'stdio',
    parallelismModel: 'multiple',
    tags: ['aria', 'microsoft', 'stable'],
    description: 'Playwright MCP by Microsoft, uses ARIA snapshot mode',
  },
  '@modelcontextprotocol/server-puppeteer': {
    id: '@modelcontextprotocol/server-puppeteer',
    label: '@modelcontextprotocol/server-puppeteer',
    toolNamespacePrefix: 'puppeteer_',
    transportMode: 'stdio',
    parallelismModel: 'multiple',
    tags: ['css-selectors', 'anthropic', 'stable'],
    description: 'Puppeteer MCP by Anthropic, uses CSS selector mode',
  },
  // Stubs for Phase 4 — registered but not functional until then
  '@browserbasehq/mcp': {
    id: '@browserbasehq/mcp',
    label: '@browserbasehq/mcp',
    toolNamespacePrefix: 'browserbase_',
    transportMode: 'http',
    parallelismModel: 'multiple',
    requiresAuth: { envVar: 'BROWSERBASE_API_KEY', description: 'Browserbase cloud API key' },
    tags: ['cloud', 'browserbase'],
    description: 'Browserbase cloud MCP (Phase 4)',
  },
  'mcp-playwright': {
    id: 'mcp-playwright',
    label: 'mcp-playwright',
    toolNamespacePrefix: 'playwright_',
    transportMode: 'stdio',
    parallelismModel: 'multiple',
    tags: ['community', 'executeautomation'],
    description: 'Community Playwright MCP by ExecuteAutomation (Phase 4)',
  },
};
