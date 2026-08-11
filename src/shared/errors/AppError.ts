/**
 * Base application error.
 * Extend for domain- or infrastructure-specific errors so callers
 * can distinguish between app errors and unexpected throws.
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly context: Record<string, unknown> | undefined;

  constructor(params: {
    message: string;
    code: string;
    context?: Record<string, unknown>;
    cause?: Error;
  }) {
    super(params.message, params.cause ? { cause: params.cause } : undefined);
    this.name = 'AppError';
    this.code = params.code;
    this.context = params.context !== undefined ? params.context : undefined;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BinanceApiError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super({ message, code: 'BINANCE_API_ERROR', ...(context !== undefined ? { context } : {}) });
    this.name = 'BinanceApiError';
  }
}

export class AlpacaApiError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super({ message, code: 'ALPACA_API_ERROR', ...(context !== undefined ? { context } : {}) });
    this.name = 'AlpacaApiError';
  }
}

export class YahooFinanceApiError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super({ message, code: 'YAHOO_FINANCE_API_ERROR', ...(context !== undefined ? { context } : {}) });
    this.name = 'YahooFinanceApiError';
  }
}
