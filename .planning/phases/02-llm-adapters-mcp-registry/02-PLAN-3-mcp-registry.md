# Phase 2, Plan 3: MCP Registry & System Prompt Assembly

**Phase:** 2 (LLM Provider Adapters & MCP Registry)  
**Focus:** Define the MCP registry schema, register the first two servers, and implement dynamic system-prompt assembly.  
**Requirements Covered:** REGISTRY-01, REGISTRY-02, REGISTRY-03, REGISTRY-06, ORCH-09

---

## Task 1: MCP Registry Schema

**Files:** `src/shared/registry/types.ts`

Define the registry schema as TypeScript interfaces:

```typescript
interface MCPRegistry {
  [serverId: string]: MCPServerEntry;
}

interface MCPServerEntry {
  id: string;               // e.g., "@playwright/mcp"
  label: string;            // Human-readable name
  toolNamespacePrefix: string; // e.g., "browser_" or "puppeteer_"
  transportMode: "stdio" | "sse" | "http";
  requiresAuth?: {
    envVar: string;         // e.g., "BROWSERBASE_API_KEY"
    description?: string;
  };
  parallelismModel: "single" | "multiple"; // Can this MCP run multiple scenarios in parallel?
  tags?: string[];          // Metadata: ["aria", "css-selectors", "cloud", etc.]
  description?: string;
}
```

**Design notes:**
- Simple flat structure, no inheritance or complex validation
- Each entry is self-contained — registry lookup returns everything needed to configure that MCP
- `toolNamespacePrefix` is critical for system-prompt assembly (filters tools by prefix)
- `parallelismModel` informs the Phase 4 executor (some cloud MCPs may have limits)

---

## Task 2: Registry Entries — @playwright/mcp & Server-Puppeteer

**Files:** `src/shared/registry/index.ts`

Create the registry object with the first two entries:

```typescript
export const MCP_REGISTRY: MCPRegistry = {
  "@playwright/mcp": {
    id: "@playwright/mcp",
    label: "@playwright/mcp",
    toolNamespacePrefix: "browser_",
    transportMode: "stdio",
    parallelismModel: "multiple",
    tags: ["aria", "microsoft", "stable"],
    description: "Playwright MCP by Microsoft, uses ARIA snapshot mode",
  },
  "@modelcontextprotocol/server-puppeteer": {
    id: "@modelcontextprotocol/server-puppeteer",
    label: "@modelcontextprotocol/server-puppeteer",
    toolNamespacePrefix: "puppeteer_",
    transportMode: "stdio",
    parallelismModel: "multiple",
    tags: ["css-selectors", "anthropic", "stable"],
    description: "Puppeteer MCP by Anthropic, uses CSS selector mode",
  },
};

// Placeholder entries for future phases (stubs only, not functional)
// @browserbasehq/mcp — cloud proxy
// mcp-playwright — community server
```

**Design notes:**
- Tool prefixes ensure system prompts for Playwright don't mention Puppeteer tools and vice versa
- Both use stdio transport (spawned as child processes)
- Both support multiple scenarios in parallel (though each run is isolated)

---

## Task 3: Registry Lookup & Tool Filtering

**Files:** `src/shared/registry/utils.ts`

Implement helper functions:

- `function getRegistryEntry(mcpId: string): MCPServerEntry | null`
  - Simple lookup: `MCP_REGISTRY[mcpId] ?? null`

- `function getToolsForMCP(mcpId: string, allTools: ToolDefinition[]): ToolDefinition[]`
  - Get registry entry → extract `toolNamespacePrefix`
  - Filter `allTools` array: include only tools whose `name` starts with the prefix
  - Return filtered subset

- `function getMCPLabel(mcpId: string): string`
  - Look up entry, return `label` or fallback to `id`

**Design notes:**
- `ToolDefinition` is from the MCP SDK (will be imported in Phase 3)
- Tool filtering is done by string prefix matching on tool name
- These are pure utility functions with no side effects

---

## Task 4: Dynamic System Prompt Assembly

**Files:** `src/shared/llm/systemPrompt.ts`

Implement the core function that builds per-MCP system prompts:

```typescript
export function assembleSystemPrompt(
  mcpId: string,
  allTools: ToolDefinition[],
  basePromptTemplate?: string
): string
```

Logic:
1. Get registry entry for `mcpId` → extract tool namespace prefix
2. Filter `allTools` by prefix → get tools for this MCP only
3. Build tool list in plain text: each tool formatted as `**tool_name(params)**: description`
4. Interpolate into base template:

```
You are a browser automation assistant. You have access to the following tools:

[TOOL_LIST]

Your task is to execute the given Gherkin scenario step-by-step. Each step has a clear objective. 
Use the tools provided to achieve the objective. Respond with the results or error messages as encountered.
```

5. Return the assembled prompt string

**Design notes:**
- The prompt should NOT mention non-applicable tools (Puppeteer steps shouldn't see browser_ tools)
- Tool descriptions come from the MCP tool definitions (passed in)
- Base template is customizable for future extensibility

---

## Task 5: Tests for Registry & System Prompt

**Files:** `src/shared/registry/index.test.ts`, `src/shared/registry/systemPrompt.test.ts`

Test registry lookup and system prompt assembly:

**Registry tests:**
- `getRegistryEntry("@playwright/mcp")` returns the correct entry with `toolNamespacePrefix: "browser_"`
- `getRegistryEntry("unknown")` returns `null`
- `getMCPLabel("@playwright/mcp")` returns a non-empty string

**Tool filtering tests:**
- Mock `ToolDefinition[]` with both `browser_*` and `puppeteer_*` tools
- `getToolsForMCP("@playwright/mcp", allTools)` returns only `browser_*` tools
- `getToolsForMCP("@modelcontextprotocol/server-puppeteer", allTools)` returns only `puppeteer_*` tools

**System prompt tests:**
- `assembleSystemPrompt("@playwright/mcp", mockTools)` returns a string containing:
  - "browser_" tool names (from filtered subset)
  - "puppeteer_" tool names NOT present
  - Base instruction text

---

## Success Criteria

- [ ] Registry schema is defined and well-documented
- [ ] First two MCP entries (@playwright/mcp, @modelcontextprotocol/server-puppeteer) are correctly registered
- [ ] Tool namespace prefixes are clearly separated (`browser_` vs `puppeteer_`)
- [ ] `getToolsForMCP()` correctly filters tools by prefix
- [ ] `assembleSystemPrompt()` includes only tools for the requested MCP
- [ ] All tests pass (registry lookup, tool filtering, prompt assembly)
- [ ] No external dependencies on MCP SDK yet (Phase 3 will integrate actual tool definitions)
