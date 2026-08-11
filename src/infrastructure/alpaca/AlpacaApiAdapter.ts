import { AlpacaHttpClient } from './AlpacaHttpClient';

interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  vw?: number;
  n?: number;
}

interface AlpacaBarsResponse {
  bars: Record<string, AlpacaBar[]>;
  next_page_token?: string;
}

/**
 * Adapter implementing stock bar queries using Alpaca Market Data API v2.
 * Converts outputs into standardized kline arrays mapping directly to Binance schema.
 */
export class AlpacaApiAdapter {
  constructor(private readonly client: AlpacaHttpClient) {}

  async getKlines(
    symbol: string,
    timeframe: string,
    limit?: number,
    startTime?: number,
    endTime?: number,
  ): Promise<unknown[][]> {
    const formattedSymbol = symbol.trim().toUpperCase();
    const alpacaTimeframe = this.mapTimeframeToAlpaca(timeframe);
    const limitNum = limit ?? 500;

    let endMs = endTime !== undefined ? endTime : Date.now();
    const fifteenMinsAgo = Date.now() - 15 * 60 * 1000;
    if (endMs > fifteenMinsAgo) {
      endMs = fifteenMinsAgo;
    }

    const intervalMs = this.timeframeToMs(timeframe);

    const params: Record<string, string | number> = {
      symbols: formattedSymbol,
      timeframe: alpacaTimeframe,
      limit: limitNum,
      feed: 'sip',
    };

    if (startTime === undefined) {
      const bufferFactor = 2.5;
      const calculatedStartMs = endMs - Math.ceil(limitNum * intervalMs * bufferFactor);
      params['start'] = new Date(calculatedStartMs).toISOString();
      params['end'] = new Date(endMs).toISOString();
      params['sort'] = 'desc';
    } else {
      params['start'] = new Date(startTime).toISOString();
      params['end'] = new Date(endMs).toISOString();
      params['sort'] = 'asc';
    }

    try {
      let mappedKlines: unknown[][] = [];
      let pageToken: string | undefined = undefined;

      do {
        if (pageToken) {
          params['page_token'] = pageToken;
        }

        const response = await this.client.get<AlpacaBarsResponse>({
          path: '/v2/stocks/bars',
          params,
        });

        const bars = response.bars[formattedSymbol] ?? [];

        const pageMappedKlines = bars.map((bar) => {
          const openTime = new Date(bar.t).getTime();
          const closeTime = openTime + intervalMs - 1;
          const volume = bar.v;
          const closePrice = bar.c;
          const quoteVolume = volume * (bar.vw ?? closePrice);

          return [
            openTime,
            bar.o.toString(),
            bar.h.toString(),
            bar.l.toString(),
            closePrice.toString(),
            volume.toString(),
            closeTime,
            quoteVolume.toString(),
            bar.n ?? 0,
            '0',
            '0',
            '0',
          ];
        });

        mappedKlines.push(...pageMappedKlines);
        pageToken = response.next_page_token;
      } while (pageToken && mappedKlines.length < limitNum);

      if (mappedKlines.length > limitNum) {
        mappedKlines = mappedKlines.slice(0, limitNum);
      }

      if (startTime === undefined) {
        mappedKlines.reverse();
      }

      return mappedKlines;
    } catch (err) {
      console.error(`AlpacaApiAdapter: failed to fetch candles for ${formattedSymbol}`, err);
      throw err;
    }
  }

  private mapTimeframeToAlpaca(timeframe: string): string {
    const match = timeframe.match(/^(\d+)([mhdwM])$/);
    if (!match) return '15Min';
    const val = match[1];
    const unit = match[2];
    if (!val || !unit) return '15Min';
    switch (unit) {
      case 'm': return `${val}Min`;
      case 'h': return `${val}Hour`;
      case 'd': return `${val}Day`;
      case 'w': return `${val}Week`;
      case 'M': return `${val}Month`;
      default: return '15Min';
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
