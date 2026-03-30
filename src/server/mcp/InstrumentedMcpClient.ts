import { randomUUID } from 'node:crypto';

/**
 * Resultado de una llamada a tool MCP
 */
export interface ToolResult {
  type: 'success' | 'error';
  content?: Array<{ type: string; text: string }>;
  error?: string;
}

/**
 * Trace de una llamada a herramienta con evidencia integrada
 */
export interface ToolCallTrace {
  toolId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result?: string;
  error?: string;
  // Campos instrumentados
  correlationId: string;
  status: 'success' | 'error';
  latencyMs: number;
  captureTimestamp: string;
  screenshotId?: string;
  errorMessage?: string;
}

/**
 * Contexto para captura de screenshot
 */
export interface CaptureContext {
  runId: string;
  stepId: string;
  screenshot?: Buffer;
}

/**
 * Cliente MCP base (mock para testing, integración con real MCP)
 */
export interface BaseMcpClient {
  callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolResult>;
}

/**
 * InstrumentedMcpClient envuelve un cliente MCP base y captura:
 * - Información de llamadas a herramientas (nombre, argumentos, resultado)
 * - Latency per call
 * - Screenshots tras cada llamada
 * - ToolCallTrace con correlationId para debugging y UI
 *
 * Manejo robusto: errores de tool call conservan evidencia parcial
 */
export class InstrumentedMcpClient {
  private traces: ToolCallTrace[] = [];
  private screenshotStore: Map<string, Buffer> = new Map();

  constructor(private baseClient: BaseMcpClient) {}

  /**
   * Ejecuta una llamada a herramienta con instrumentación completa
   * @param toolName nombre de la herramienta
   * @param args argumentos de la herramienta
   * @param context contexto de captura (runId, stepId, screenshot)
   * @returns resultado de la llamada a herramienta
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    context: CaptureContext
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const correlationId = randomUUID();
    const captureTimestamp = new Date().toISOString();

    let screenshotId: string | undefined;
    let status: 'success' | 'error' = 'success';
    let errorMessage: string | undefined;
    let toolResult: ToolResult | undefined;

    try {
      // Ejecutar tool call contra base client
      toolResult = await this.baseClient.callTool(toolName, args);

      // Si hay screenshot, almacenarlo
      if (context.screenshot) {
        screenshotId = this.saveScreenshot(
          context.screenshot,
          context.runId,
          context.stepId,
          correlationId
        );
      }

      status = toolResult.type === 'success' ? 'success' : 'error';
    } catch (error) {
      status = 'error';
      errorMessage = error instanceof Error ? error.message : String(error);
      // Aún conservar screenshot parcial si fue capturado
      if (context.screenshot) {
        screenshotId = this.saveScreenshot(
          context.screenshot,
          context.runId,
          context.stepId,
          correlationId
        );
      }
    }

    const latencyMs = Date.now() - startTime;

    // Crear y registrar trace
    const trace: ToolCallTrace = {
      toolId: `${context.runId}-${correlationId}`,
      toolName,
      arguments: args,
      status,
      correlationId,
      latencyMs,
      captureTimestamp,
      screenshotId,
      errorMessage,
      result: toolResult
        ? toolResult.type === 'success'
          ? toolResult.content?.[0]?.text || 'Sin contenido'
          : toolResult.error || 'Error desconocido'
        : undefined,
      error: toolResult?.type === 'error' ? toolResult.error : undefined,
    };

    this.traces.push(trace);

    // Retornar resultado original o error
    if (toolResult) {
      return toolResult;
    }
    throw new Error(errorMessage || 'Error al ejecutar tool call');
  }

  /**
   * Guarda screenshot localmente en memoria (v1 simplificada)
   * @param buffer datos binarios del screenshot
   * @param runId identificador del run
   * @param stepId identificador del step
   * @param correlationId identificador único del call
   * @returns screenshotId generado
   */
  private saveScreenshot(
    buffer: Buffer,
    runId: string,
    stepId: string,
    correlationId: string
  ): string {
    const screenshotId = `${runId}-${stepId}-${correlationId}`;
    this.screenshotStore.set(screenshotId, buffer);
    return screenshotId;
  }

  /**
   * Retorna todos los traces registrados
   */
  getTraces(): ToolCallTrace[] {
    return [...this.traces];
  }

  /**
   * Retorna screenshot por ID
   */
  getScreenshot(screenshotId: string): Buffer | undefined {
    return this.screenshotStore.get(screenshotId);
  }

  /**
   * Limpia traces (para testing)
   */
  clearTraces(): void {
    this.traces = [];
  }
}
