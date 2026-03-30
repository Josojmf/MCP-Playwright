export type MCPTransportMode = "stdio" | "sse" | "http";
export type MCPParallelismModel = "single" | "multiple";

export interface MCPAuthRequirement {
  envVar: string;
  description?: string;
}

export interface MCPServerEntry {
  id: string;
  label: string;
  toolNamespacePrefix: string;
  transportMode: MCPTransportMode;
  requiresAuth?: MCPAuthRequirement;
  parallelismModel: MCPParallelismModel;
  tags?: string[];
  description?: string;
}

export type MCPRegistry = Record<string, MCPServerEntry>;
