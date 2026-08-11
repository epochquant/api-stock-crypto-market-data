import * as dotenv from 'dotenv';

dotenv.config({ path: process.env['NODE_ENV'] === 'production' ? '.env.prod' : '.env' });

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Typed, validated configuration loaded from environment variables.
 * Fails fast at startup if API_KEY is absent.
 * All external API credentials are optional — public endpoints work without them.
 */
export interface AppConfig {
  port: number;
  apiKey: string;
  logLevel: string;
  binance: {
    baseUrl: string;
    apiKey?: string;
    apiSecret?: string;
  };
  alpaca: {
    apiKeyId: string;
    apiSecretKey: string;
    baseUrl: string;
  };
  yahooFinance: {
    baseUrl: string;
  };
}

export function loadAppConfig(): AppConfig {
  return {
    port: parseInt(optionalEnv('BACKEND_PORT', '3000'), 10),
    apiKey: requireEnv('API_KEY'),
    logLevel: optionalEnv('LOG_LEVEL', 'info'),
    binance: {
      baseUrl: optionalEnv('BINANCE_BASE_URL', 'https://api.binance.com'),
      ...(process.env['BINANCE_API_KEY'] ? { apiKey: process.env['BINANCE_API_KEY'] } : {}),
      ...(process.env['BINANCE_API_SECRET'] ? { apiSecret: process.env['BINANCE_API_SECRET'] } : {}),
    },
    alpaca: {
      apiKeyId: optionalEnv('ALPACA_API_KEY_ID', ''),
      apiSecretKey: optionalEnv('ALPACA_API_SECRET_KEY', ''),
      baseUrl: optionalEnv('ALPACA_BASE_URL', 'https://data.alpaca.markets'),
    },
    yahooFinance: {
      baseUrl: optionalEnv('YAHOO_FINANCE_BASE_URL', 'https://query1.finance.yahoo.com'),
    },
  };
}
