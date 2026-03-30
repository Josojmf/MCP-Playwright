export class LoopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoopError";
  }
}

export interface ToolCallRecord {
  name: string;
  argsString: string; // stringified arguments to generate fingerprint
}

export class LoopDetector {
  private history: ToolCallRecord[] = [];
  private toolCounts: Record<string, number> = {};
  
  private exactMatchThreshold: number;
  private budgetLimitPerStep: number;

  constructor(exactMatchThreshold = 3, budgetLimitPerStep = 20) {
    this.exactMatchThreshold = exactMatchThreshold;
    this.budgetLimitPerStep = budgetLimitPerStep;
  }

  /**
   * Records a tool call and checks if a loop has formed.
   * Throws LoopError if the exact identical call happens threshold times consecutively,
   * or if the total identical tool matches exceed the budget for the step.
   */
  public recordAndCheck(call: ToolCallRecord) {
    this.history.push(call);
    this.toolCounts[call.name] = (this.toolCounts[call.name] || 0) + 1;

    // Check budget
    if (this.toolCounts[call.name] > this.budgetLimitPerStep) {
      throw new LoopError(`Tool ${call.name} exceeded budget limit of ${this.budgetLimitPerStep} per step`);
    }

    // Check consecutive exact match (sliding window at the end of history)
    if (this.history.length >= this.exactMatchThreshold) {
      let isLoop = true;
      for (let i = 1; i <= this.exactMatchThreshold; i++) {
        const record = this.history[this.history.length - i];
        if (record.name !== call.name || record.argsString !== call.argsString) {
          isLoop = false;
          break;
        }
      }
      if (isLoop) {
        throw new LoopError(`Identical sequential tool call loop detected for ${call.name}`);
      }
    }
  }

  public resetStep() {
    // Reset history/counts, typically at the start of a new Gherkin step
    this.history = [];
    this.toolCounts = {};
  }
}
