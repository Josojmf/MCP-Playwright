import { MCPServerEntry, ToolDefinition } from './types';
import { MCP_REGISTRY } from './index';

export function getRegistryEntry(mcpId: string): MCPServerEntry | null {
  return MCP_REGISTRY[mcpId] ?? null;
}

export function getToolsForMCP(mcpId: string, allTools: ToolDefinition[]): ToolDefinition[] {
  const entry = getRegistryEntry(mcpId);
  if (!entry) return [];
  return allTools.filter(tool => tool.name.startsWith(entry.toolNamespacePrefix));
}

export function getMCPLabel(mcpId: string): string {
  return getRegistryEntry(mcpId)?.label ?? mcpId;
}

export function listRegisteredMCPs(): MCPServerEntry[] {
  return Object.values(MCP_REGISTRY);
}
