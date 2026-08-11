import { type IncomingHttpHeaders } from 'http';

/**
 * Singleton to coordinate Binance API weight usage.
 * Prevents hitting the 1200 req/min rate limit when fetching many symbols.
 */
export class BinanceRateLimiter {
  private static instance: BinanceRateLimiter;

  private usedWeight: number = 0;
  private isRankingActive: boolean = false;
  private weightLimit: number = 1200; // Binance default per minute

  private constructor() {}

  public static getInstance(): BinanceRateLimiter {
    if (!BinanceRateLimiter.instance) {
      BinanceRateLimiter.instance = new BinanceRateLimiter();
    }
    return BinanceRateLimiter.instance;
  }

  public updateWeight(headers: IncomingHttpHeaders): void {
    const weight1m = headers['x-mbx-used-weight-1m'];
    if (weight1m) {
      this.usedWeight = parseInt(weight1m as string, 10);
    }
  }

  public getUsedWeight(): number {
    return this.usedWeight;
  }

  public getWeightLimit(): number {
    return this.weightLimit;
  }

  public getUsagePercent(): number {
    return (this.usedWeight / this.weightLimit) * 100;
  }

  public setRankingActive(active: boolean): void {
    this.isRankingActive = active;
  }

  public isRankingRunning(): boolean {
    return this.isRankingActive;
  }

  /** Dynamic pause if weight usage is too high. */
  public async waitIfNearLimit(threshold: number = 80): Promise<void> {
    if (this.getUsagePercent() >= threshold) {
      console.warn(
        `[BinanceRateLimiter] Weight usage at ${this.getUsagePercent().toFixed(1)}%, pausing for 5 seconds...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

export const binanceRateLimiter = BinanceRateLimiter.getInstance();
