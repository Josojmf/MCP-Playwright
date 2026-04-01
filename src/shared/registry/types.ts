export interface MCPServerEntry {
  id: string;
  label: string;
  toolNamespacePrefix: string;
  transportMode: 'stdio' | 'sse' | 'http';
  requiresAuth?: {
    envVar: string;
    description?: string;
  };
  parallelismModel: 'single' | 'multiple';
  tags?: string[];
  description?: string;
  spawnCommand?: string[];  // e.g. ["npx", "-y", "@playwright/mcp@latest"]
}

export interface MCPRegistry {
  [serverId: string]: MCPServerEntry;
}

// Minimal ToolDefinition shape (MCP SDK compatible — full type imported in Phase 3)
export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}
