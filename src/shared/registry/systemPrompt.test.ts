import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleSystemPrompt } from '../llm/systemPrompt';
import { ToolDefinition } from './types';

const MOCK_TOOLS: ToolDefinition[] = [
  { name: 'browser_navigate', description: 'Navigate to a URL' },
  { name: 'browser_click', description: 'Click on an element' },
  { name: 'puppeteer_goto', description: 'Go to a URL' },
  { name: 'puppeteer_click', description: 'Click an element' },
];

test('assembleSystemPrompt includes browser_ tool names for playwright MCP', () => {
  const prompt = assembleSystemPrompt('@playwright/mcp', MOCK_TOOLS);
  assert.ok(prompt.includes('browser_navigate'));
  assert.ok(prompt.includes('browser_click'));
});

test('assembleSystemPrompt excludes puppeteer_ tool names for playwright MCP', () => {
  const prompt = assembleSystemPrompt('@playwright/mcp', MOCK_TOOLS);
  assert.equal(prompt.includes('puppeteer_'), false);
});

test('assembleSystemPrompt includes puppeteer_ tool names for server-puppeteer MCP', () => {
  const prompt = assembleSystemPrompt('@modelcontextprotocol/server-puppeteer', MOCK_TOOLS);
  assert.ok(prompt.includes('puppeteer_goto'));
  assert.ok(prompt.includes('puppeteer_click'));
});

test('assembleSystemPrompt excludes browser_ tool names for server-puppeteer MCP', () => {
  const prompt = assembleSystemPrompt('@modelcontextprotocol/server-puppeteer', MOCK_TOOLS);
  assert.equal(prompt.includes('browser_'), false);
});

test('assembleSystemPrompt includes base instruction text', () => {
  const prompt = assembleSystemPrompt('@playwright/mcp', MOCK_TOOLS);
  assert.ok(prompt.includes('browser automation assistant'));
});

test('assembleSystemPrompt accepts custom base template', () => {
  const custom = 'Custom template with {TOOL_LIST} here';
  const prompt = assembleSystemPrompt('@playwright/mcp', MOCK_TOOLS, custom);
  assert.ok(prompt.includes('Custom template'));
  assert.ok(prompt.includes('browser_navigate'));
});

test('assembleSystemPrompt returns no-tools marker for unknown MCP ids', () => {
  const prompt = assembleSystemPrompt('unknown-mcp', MOCK_TOOLS);
  assert.ok(prompt.includes('(no tools available for this MCP)'));
});
