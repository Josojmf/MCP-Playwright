export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

export interface BudgetLimits {
  hardCapTokens: number;
  warnThresholdRatio: number; // e.g., 0.8 for 80%
}

export class TokenBudget {
  private usedTokens: number = 0;
  private hardCap: number;
  private warnCap: number;
  private hasWarned: boolean = false;
  private onWarn: (msg: string) => void;

  constructor(limits: BudgetLimits, warnCallback?: (msg: string) => void) {
    this.hardCap = limits.hardCapTokens;
    this.warnCap = limits.hardCapTokens * limits.warnThresholdRatio;
    this.onWarn = warnCallback || console.warn;
  }

  public addUsage(tokens: number) {
    this.usedTokens += tokens;
    this.checkThresholds();
  }

  /**
   * Check before making an LLM API Request.
   * `estimatedNext` can be a fast tiktoken local run on the prompt.
   */
  public checkBudget(estimatedNext: number = 0) {
    if (this.usedTokens + estimatedNext > this.hardCap) {
      throw new BudgetExceededError(`Token budget hard cap exceeded (${this.usedTokens + estimatedNext} > ${this.hardCap})`);
    }
  }

  private checkThresholds() {
    if (!this.hasWarned && this.usedTokens >= this.warnCap) {
      this.hasWarned = true;
      this.onWarn(`Warning: Tokens have reached ${this.warnCap} (>= ${this.usedTokens}) approach hard cap!`);
    }
  }

  public getStats() {
    return {
      used: this.usedTokens,
      cap: this.hardCap,
      remaining: this.hardCap - this.usedTokens
    };
  }
}
