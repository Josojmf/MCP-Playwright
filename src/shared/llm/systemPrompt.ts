import { getRegistryEntry, getToolsForMCP } from '../registry/utils';
import { ToolDefinition } from '../registry/types';

const DEFAULT_PROMPT_TEMPLATE = `You are a browser automation assistant. You have access to the following tools:

{TOOL_LIST}

Your task is to execute the given Gherkin scenario step-by-step. Each step has a clear objective.
Use the tools provided to achieve the objective. Respond with the results or error messages as encountered.
Focus on one step at a time. After completing a step, report the result clearly before proceeding.`;

export function assembleSystemPrompt(
  mcpId: string,
  allTools: ToolDefinition[],
  basePromptTemplate?: string
): string {
  const registryEntry = getRegistryEntry(mcpId);
  const filteredTools = registryEntry ? getToolsForMCP(mcpId, allTools) : [];
  const template = basePromptTemplate ?? DEFAULT_PROMPT_TEMPLATE;

  let toolList: string;
  if (filteredTools.length === 0) {
    toolList = '(no tools available for this MCP)';
  } else {
    toolList = filteredTools
      .map(tool => {
        const params = tool.inputSchema
          ? JSON.stringify(tool.inputSchema, null, 0).slice(0, 100)
          : '';
        return `**${tool.name}${params ? `(${params})` : ''}**: ${tool.description ?? 'No description'}`;
      })
      .join('\n');
  }

  return template.replace('{TOOL_LIST}', toolList);
}
