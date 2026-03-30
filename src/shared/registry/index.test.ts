import assert from 'node:assert/strict';
import test from 'node:test';
import { getRegistryEntry, getToolsForMCP, getMCPLabel, listRegisteredMCPs } from './utils';
import { ToolDefinition } from './types';

const MOCK_TOOLS: ToolDefinition[] = [
  { name: 'browser_navigate', description: 'Navigate to URL' },
  { name: 'browser_click', description: 'Click element' },
  { name: 'browser_screenshot', description: 'Take screenshot' },
  { name: 'puppeteer_goto', description: 'Go to URL' },
  { name: 'puppeteer_click', description: 'Click element' },
  { name: 'unrelated_tool', description: 'Not an MCP tool' },
];

test('getRegistryEntry returns playwright entry with browser_ prefix', () => {
  const entry = getRegistryEntry('@playwright/mcp');
  assert.ok(entry);
  assert.equal(entry.toolNamespacePrefix, 'browser_');
  assert.equal(entry.transportMode, 'stdio');
});

test('getRegistryEntry returns puppeteer entry with puppeteer_ prefix', () => {
  const entry = getRegistryEntry('@modelcontextprotocol/server-puppeteer');
  assert.ok(entry);
  assert.equal(entry.toolNamespacePrefix, 'puppeteer_');
});

test('getRegistryEntry returns null for unknown MCP', () => {
  assert.equal(getRegistryEntry('unknown-mcp'), null);
});

test('getMCPLabel returns non-empty string for known MCP', () => {
  const label = getMCPLabel('@playwright/mcp');
  assert.ok(label);
  assert.ok(label.length > 0);
});

test('getMCPLabel returns mcpId for unknown entry', () => {
  assert.equal(getMCPLabel('custom-mcp'), 'custom-mcp');
});

test('getToolsForMCP filters to browser_ tools only for playwright', () => {
  const tools = getToolsForMCP('@playwright/mcp', MOCK_TOOLS);
  assert.equal(tools.length, 3);
  assert.ok(tools.every(t => t.name.startsWith('browser_')));
});

test('getToolsForMCP filters to puppeteer_ tools only for server-puppeteer', () => {
  const tools = getToolsForMCP('@modelcontextprotocol/server-puppeteer', MOCK_TOOLS);
  assert.equal(tools.length, 2);
  assert.ok(tools.every(t => t.name.startsWith('puppeteer_')));
});

test('getToolsForMCP returns empty array for unknown MCP', () => {
  const tools = getToolsForMCP('unknown', MOCK_TOOLS);
  assert.equal(tools.length, 0);
});

test('listRegisteredMCPs returns at least 4 entries', () => {
  const mcps = listRegisteredMCPs();
  assert.ok(mcps.length >= 4);
});

test('registry includes phase 4 stubs with auth and transport metadata', () => {
  const browserbase = getRegistryEntry('@browserbasehq/mcp');
  const playwright = getRegistryEntry('mcp-playwright');

  assert.ok(browserbase);
  assert.equal(browserbase.transportMode, 'http');
  assert.equal(browserbase.requiresAuth?.envVar, 'BROWSERBASE_API_KEY');
  assert.ok(playwright);
  assert.equal(playwright.toolNamespacePrefix, 'playwright_');
  assert.equal(playwright.transportMode, 'stdio');
});
