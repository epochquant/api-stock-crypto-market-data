import { YahooFinanceHttpClient } from './YahooFinanceHttpClient';
import { yahooMaxHistoryMs, formatDate } from '../../utils/dateUtils';

export interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: {
        currency: string;
        symbol: string;
      };
      timestamp?: number[];
      indicators: {
        quote: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }> | null;
    error: unknown;
  };
}

/**
 * Adapter implementing stock queries using Yahoo Finance Chart API.
 * Supports both BYMA (Argentine stocks, with .BA suffix) and NYSE/NASDAQ
 * (US stocks, without suffix). The `appendBaSuffix` param controls this behavior.
 */
export class YahooFinanceApiAdapter {
  constructor(private readonly client: YahooFinanceHttpClient) {}

  async getKlines(
    symbol: string,
    timeframe: string,
    limit?: number,
    startTime?: number,
    endTime?: number,
    appendBaSuffix: boolean = true,
  ): Promise<unknown[][]> {
    const formattedSymbol = symbol.trim().toUpperCase();

    let yahooSymbol: string;
    if (appendBaSuffix) {
      yahooSymbol = formattedSymbol.endsWith('.BA')
        ? formattedSymbol
        : `${formattedSymbol}.BA`;
    } else {
      yahooSymbol = formattedSymbol.endsWith('.BA')
        ? formattedSymbol.replace(/\.BA$/, '')
        : formattedSymbol;
    }

    const yahooInterval = this.mapTimeframeToYahoo(timeframe);
    const limitNum = limit ?? 500;

    let endMs = endTime !== undefined ? endTime : Date.now();
    const intervalMs = this.timeframeToMs(timeframe);

    let startMs = startTime;
    if (startMs === undefined) {
      const bufferFactor = 3;
      startMs = endMs - Math.ceil(limitNum * intervalMs * bufferFactor);
    }

    const params: Record<string, string | number> = {
      interval: yahooInterval,
      period1: Math.floor(startMs / 1000),
      period2: Math.floor(endMs / 1000),
    };

    const maxHistoryMs = yahooMaxHistoryMs(yahooInterval);
    if (maxHistoryMs !== null) {
      const SAFETY_BUFFER_MS = 2 * 24 * 60 * 60 * 1000;
      const oldestAllowedMs = endMs - maxHistoryMs + SAFETY_BUFFER_MS;
      if (startMs < oldestAllowedMs) {
        const maxDays = Math.round(maxHistoryMs / 86400000);
        console.warn(
          `[YahooFinanceApiAdapter] Interval "${yahooInterval}" supports at most ${maxDays} days of history. ` +
            `Adjusting startTime from ${formatDate(startMs)} to ${formatDate(oldestAllowedMs)}.`,
        );
        startMs = oldestAllowedMs;
        params['period1'] = Math.floor(startMs / 1000);
      }
    }

    try {
      const response = await this.client.get<YahooChartResponse>({
        path: `/v8/finance/chart/${yahooSymbol}`,
        params,
      });

      if (response.chart.error) {
        throw new Error(JSON.stringify(response.chart.error));
      }

      const result = response.chart.result?.[0];
      if (!result || !result.timestamp || !result.indicators.quote[0]) {
        return [];
      }

      const timestamps = result.timestamp;
      const quote = result.indicators.quote[0];

      const opens = quote.open ?? [];
      const highs = quote.high ?? [];
      const lows = quote.low ?? [];
      const closes = quote.close ?? [];
      const volumes = quote.volume ?? [];

      const mappedKlines: unknown[][] = [];

      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        const o = opens[i];
        const h = highs[i];
        const l = lows[i];
        const c = closes[i];
        const v = volumes[i];

        if (ts === undefined || o === null || o === undefined || c === null || c === undefined) {
          continue;
        }

        const openTime = ts * 1000;
        const closeTime = openTime + intervalMs - 1;
        const volume = v ?? 0;
        const closePrice = c;
        const quoteVolume = volume * closePrice;

        mappedKlines.push([
          openTime,
          o.toString(),
          h?.toString() ?? o.toString(),
          l?.toString() ?? o.toString(),
          c.toString(),
          volume.toString(),
          closeTime,
          quoteVolume.toString(),
          0,
          '0',
          '0',
          '0',
        ]);
      }

      if (startTime === undefined && mappedKlines.length > limitNum) {
        return mappedKlines.slice(-limitNum);
      }

      return mappedKlines;
    } catch (err) {
      console.error(`YahooFinanceApiAdapter: failed to fetch candles for ${yahooSymbol}`, err);
      throw err;
    }
  }

  private mapTimeframeToYahoo(timeframe: string): string {
    const match = timeframe.match(/^(\d+)([mhdwM])$/);
    if (!match) return '15m';
    const val = match[1];
    const unit = match[2];
    if (!val || !unit) return '15m';

    switch (unit) {
      case 'm':
        return ['1', '2', '5', '15', '30', '60', '90'].includes(val) ? `${val}m` : '15m';
      case 'h':
        return val === '1' ? '1h' : '60m';
      case 'd':
        return val === '1' || val === '5' ? `${val}d` : '1d';
      case 'w':
        return '1wk';
      case 'M':
        return val === '1' || val === '3' ? `${val}mo` : '1mo';
      default:
        return '15m';
    }
  }

  private timeframeToMs(timeframe: string): number {
    const match = timeframe.match(/^(\d+)([mhdwM])$/);
    if (!match) return 15 * 60 * 1000;
    const valStr = match[1];
    const unit = match[2];
    if (!valStr || !unit) return 15 * 60 * 1000;
    const val = parseInt(valStr, 10);
    switch (unit) {
      case 'm': return val * 60 * 1000;
      case 'h': return val * 60 * 60 * 1000;
      case 'd': return val * 24 * 60 * 60 * 1000;
      case 'w': return val * 7 * 24 * 60 * 60 * 1000;
      case 'M': return val * 30 * 24 * 60 * 60 * 1000;
      default: return 15 * 60 * 1000;
    }
  }
}
