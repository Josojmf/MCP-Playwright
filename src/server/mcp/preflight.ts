import { MCP_REGISTRY } from '../../shared/registry';

export interface PreflightOptions {
  mcpId: string;
  localPlaywrightVersion: string;
  targetPlaywrightVersion: string;
  capabilities?: {
    toolNamespace?: string;
  };
}

export interface PreflightResult {
  status: 'ok' | 'blocked';
  reason?: string;
  action?: string;
}

/**
 * Validates MCP compatibility before execution.
 * - Check Playwright version match
 * - Verify MCP capabilities
 * - Validate command availability
 */
export async function preflight(options: PreflightOptions): Promise<PreflightResult> {
  const { mcpId, localPlaywrightVersion, targetPlaywrightVersion, capabilities } = options;

  // 1. Check if MCP is supported (registered in MCP_REGISTRY)
  const mcpEntry = MCP_REGISTRY[mcpId];
  if (!mcpEntry) {
    return {
      status: 'blocked',
      reason: `MCP ${mcpId} no soportado o no registrado en MCP_REGISTRY`,
      action: `Instala el MCP con: npm install ${mcpId} o agregalo a MCP_REGISTRY`,
    };
  }

  // 2. Check Playwright version match
  if (localPlaywrightVersion !== targetPlaywrightVersion) {
    return {
      status: 'blocked',
      reason: `Versión Playwright mismatch: local ${localPlaywrightVersion}, target ${targetPlaywrightVersion}`,
      action: `Actualiza Playwright a ${targetPlaywrightVersion} con: npm install @playwright/test@${targetPlaywrightVersion}`,
    };
  }

  // 3. Check capabilities if provided
  if (capabilities) {
    if (capabilities.toolNamespace && capabilities.toolNamespace !== mcpEntry.toolNamespacePrefix) {
      return {
        status: 'blocked',
        reason: `Tool namespace mismatch: ${capabilities.toolNamespace} vs ${mcpEntry.toolNamespacePrefix}`,
        action: `Verifica la configuración del MCP ${mcpId}`,
      };
    }
  }

  // All checks passed
  return { status: 'ok' };
}
