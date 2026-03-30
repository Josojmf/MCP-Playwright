import { MCP_REGISTRY } from "./index";
import { MCPServerEntry } from "./types";

export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export function getRegistryEntry(mcpId: string): MCPServerEntry | null {
  return MCP_REGISTRY[mcpId] ?? null;
}

export function getToolsForMCP(mcpId: string, allTools: ToolDefinition[]): ToolDefinition[] {
  const entry = getRegistryEntry(mcpId);
  if (!entry) {
    return [];
  }

  return allTools.filter((tool) => tool.name.startsWith(entry.toolNamespacePrefix));
}

export function getMCPLabel(mcpId: string): string {
  const entry = getRegistryEntry(mcpId);
  return entry?.label ?? mcpId;
}
