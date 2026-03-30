import { spawn, ChildProcess } from 'node:child_process';

/**
 * Lifecycle manager for MCP processes.
 * Handles spawning, health checks, graceful shutdown, and crash detection.
 */
export class McpProcessManager {
  private process: ChildProcess | null = null;
  private mcpId: string;

  public pid: number | null = null;
  public startedAt: Date | null = null;
  public crashed: boolean = false;
  public crashReason: string | null = null;

  constructor(mcpId: string) {
    this.mcpId = mcpId;
  }

  /**
   * Spawn the MCP process.
   * Returns { pid, startedAt } and exposes crash state.
   */
  public async spawn(): Promise<{ pid: number; startedAt: Date }> {
    if (this.process !== null) {
      throw new Error(
        `Proceso MCP ya está en ejecución (PID: ${this.pid})`
      );
    }

    // Spawn the process
    this.process = spawn('node', ['-v'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.pid = this.process.pid!;
    this.startedAt = new Date();
    this.crashed = false;
    this.crashReason = null;

    // Listen for exit/crash
    this.process.on('exit', (code, signal) => {
      this.crashed = true;
      this.crashReason =
        code !== 0
          ? `Proceso MCP (${this.mcpId}) finalizó con código ${code}`
          : `Proceso MCP (${this.mcpId}) terminado por signal ${signal}`;
    });

    // Listen for error
    this.process.on('error', (err) => {
      this.crashed = true;
      this.crashReason = `Proceso MCP (${this.mcpId}) error: ${err.message}`;
    });

    return { pid: this.pid, startedAt: this.startedAt };
  }

  /**
   * Check if process is healthy.
   */
  public async healthCheck(): Promise<boolean> {
    if (this.process === null || this.crashed) {
      return false;
    }

    // Simple check: is process still alive?
    try {
      // Sending signal 0 checks if process exists without killing it
      process.kill(this.pid!, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stop the process gracefully, with fallback to SIGKILL.
   */
  public async stop(timeoutMs: number = 5000): Promise<void> {
    if (this.process === null) {
      return;
    }

    // Try SIGTERM first
    this.process.kill('SIGTERM');

    // Wait for graceful shutdown
    let isKilled = false;
    const checkInterval = setInterval(() => {
      try {
        // signal 0 = check if alive without killing
        if (this.pid !== null) {
          process.kill(this.pid, 0);
        }
      } catch {
        isKilled = true;
        clearInterval(checkInterval);
      }
    }, 100);

    const startTime = Date.now();
    while (!isKilled && Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    clearInterval(checkInterval);

    // Force kill if still alive
    if (this.process !== null && !isKilled) {
      this.process.kill('SIGKILL');
    }
  }

  /**
   * Dispose the process manager.
   * Cleans up in finally block (both success and error).
   */
  public async dispose(): Promise<void> {
    try {
      if (this.process !== null) {
        await this.stop(1000);
      }
    } finally {
      this.process = null;
      this.pid = null;
      this.startedAt = null;
    }
  }
}
