import { getRegistryEntry } from "../registry/utils";
import { ToolDefinition } from "../registry/utils";

const DEFAULT_PROMPT_TEMPLATE = `You are a browser automation assistant. You have access to the following tools:\n\n{{TOOLS}}\n\nYour task is to execute the given Gherkin scenario step-by-step. Each step has a clear objective.\nUse the tools provided to achieve the objective. Respond with the results or error messages as encountered.`;

export function assembleSystemPrompt(
  mcpId: string,
  allTools: ToolDefinition[],
  basePromptTemplate: string = DEFAULT_PROMPT_TEMPLATE
): string {
  const entry = getRegistryEntry(mcpId);
  if (!entry) {
    return basePromptTemplate.replace("{{TOOLS}}", "(No MCP registry entry found for selected server.)");
  }

  const scopedTools = allTools.filter((tool) => tool.name.startsWith(entry.toolNamespacePrefix));
  const toolLines = scopedTools.length
    ? scopedTools.map((tool) => `- ${tool.name}: ${tool.description ?? "No description"}`).join("\n")
    : "- (No tools discovered for this MCP namespace)";

  return basePromptTemplate.replace("{{TOOLS}}", toolLines);
}
