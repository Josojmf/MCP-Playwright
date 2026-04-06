import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCP_REGISTRY } from '../../shared/registry';
import type { BaseMcpClient, ToolResult } from './InstrumentedMcpClient';

interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * Real MCP process lifecycle manager.
 * Spawns an MCP server process via StdioClientTransport, performs the JSON-RPC
 * initialize handshake, implements BaseMcpClient for callTool delegation,
 * and detects crashes via transport onclose/onerror.
 */
export class McpProcessManager implements BaseMcpClient {
  private transport: StdioClientTransport | null = null;
  private client: Client | null = null;
  private mcpId: string;
  private tools: ToolDefinition[] = [];

  public pid: number | null = null;
  public startedAt: Date | null = null;
  public crashed: boolean = false;
  public crashReason: string | null = null;
  private extraEnv: Record<string, string>;

  constructor(mcpId: string, extraEnv: Record<string, string> = {}) {
    this.mcpId = mcpId;
    this.extraEnv = extraEnv;

    const entry = MCP_REGISTRY[mcpId];
    if (!entry?.spawnCommand || entry.spawnCommand.length === 0) {
      throw new Error(`No spawnCommand in registry for ${mcpId}`);
    }
  }

  /**
   * Spawn the MCP process, perform initialize handshake, and list available tools.
   * Returns { pid, startedAt } on success.
   */
  public async spawn(): Promise<{ pid: number; startedAt: Date }> {
    if (this.client !== null) {
      throw new Error('MCP process already running');
    }

    const [command, ...args] = MCP_REGISTRY[this.mcpId].spawnCommand!;

    const spawnEnv = Object.keys(this.extraEnv).length > 0
      ? { ...process.env, ...this.extraEnv } as Record<string, string>
      : undefined;

    this.transport = new StdioClientTransport({ command, args, stderr: 'pipe', env: spawnEnv });
    this.client = new Client({ name: 'mcp-bench', version: '1.0.0' }, { capabilities: {} });

    // Wire crash detection before connecting
    this.transport.onclose = () => {
      if (!this.crashed) {
        this.crashed = true;
        this.crashReason = `MCP process (${this.mcpId}) transport closed unexpectedly`;
      }
    };

    this.transport.onerror = (err: Error) => {
      this.crashed = true;
      this.crashReason = `MCP process (${this.mcpId}) transport error: ${err.message}`;
    };

    // client.connect() spawns the process AND performs the initialize handshake.
    // Do NOT call transport.start() manually — that would throw "StdioClientTransport already started!"
    await this.client.connect(this.transport);

    // pid is available after transport start
    this.pid = (this.transport as unknown as { _process?: { pid?: number } })._process?.pid ?? null;
    this.startedAt = new Date();
    this.crashed = false;

    // Discover available tools via tools/list.
    // Some community MCP servers return non-canonical inputSchema documents that
    // fail strict SDK parsing; do not abort spawn in that case.
    try {
      const { tools } = await this.client.listTools();
      this.tools = tools as ToolDefinition[];
    } catch {
      this.tools = [];
    }

    return { pid: this.pid!, startedAt: this.startedAt };
  }

  /**
   * Health check via capability negotiation result.
   * Returns true if client is connected and no crash detected.
   */
  public async healthCheck(): Promise<boolean> {
    return this.client !== null && !this.crashed;
  }

  /**
   * Delegate a tool call to the real MCP server via JSON-RPC.
   */
  public async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.client) {
      throw new Error('MCP client not initialized');
    }

    const result = await this.client.callTool({ name, arguments: args });

    return {
      type: result.isError ? 'error' : 'success',
      content: result.content as Array<{ type: string; text: string }>,
      error: result.isError
        ? String((result.content as Array<{ type: string; text: string }>)?.[0]?.text ?? 'tool error')
        : undefined,
    };
  }

  /**
   * Returns the list of tools discovered during spawn().
   */
  public getTools(): ToolDefinition[] {
    return this.tools;
  }

  /**
   * Gracefully close the transport, with SIGKILL fallback on timeout.
   */
  public async stop(timeoutMs: number = 5000): Promise<void> {
    if (this.transport === null) {
      return;
    }

    await Promise.race([
      this.transport.close(),
      new Promise<void>((resolve) =>
        setTimeout(() => {
          // Fallback: force kill if pid is known
          if (this.pid !== null) {
            try {
              process.kill(this.pid, 'SIGKILL');
            } catch {
              // Process may already be gone
            }
          }
          resolve();
        }, timeoutMs)
      ),
    ]);
  }

  /**
   * Dispose the process manager, cleaning up all internal state.
   */
  public async dispose(): Promise<void> {
    try {
      await this.stop(1000);
    } finally {
      this.transport = null;
      this.client = null;
      this.pid = null;
      this.startedAt = null;
    }
  }
}
