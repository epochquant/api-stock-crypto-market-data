import { BinanceApiAdapter } from '../infrastructure/binance/BinanceApiAdapter';

export enum MarketType {
  FUTURES = 'futures',
  SPOT = 'spot',
}

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

export interface TopGainersCandlesRequest {
  n: number;
  market_type: MarketType;
  timeframe: string;
  limit?: number;
  startTime?: number;
  endTime?: number;
}

/**
 * Core market data service.
 * Fetches and aggregates data from Binance (spot + futures).
 * Uses a short-lived in-memory cache (3s TTL) for the ticker endpoint
 * to absorb concurrent requests from polling UIs.
 */
export class MarketDataService {
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 3000;

  constructor(
    private readonly spotAdapter: BinanceApiAdapter,
    private readonly futuresAdapter: BinanceApiAdapter,
  ) {}

  async getMarketTicker(symbol: string, marketType: MarketType): Promise<unknown> {
    if (marketType === MarketType.SPOT) {
      throw Object.assign(new Error('Spot market ticker not fully implemented yet.'), {
        statusCode: 501,
      });
    }

    const cacheKey = `${marketType}:${symbol}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    const [ticker24hr, premiumIndex, openInterestData] = await Promise.all([
      this.futuresAdapter.getTicker24hr(symbol).catch(() => null),
      this.futuresAdapter.getPremiumIndex(symbol).catch(() => null),
      this.futuresAdapter.getOpenInterest(symbol).catch(() => null),
    ]);

    if (!ticker24hr) {
      throw Object.assign(new Error(`Failed to fetch ticker for symbol ${symbol}`), {
        statusCode: 400,
      });
    }

    const t = ticker24hr as Record<string, string>;
    const pi = premiumIndex as Record<string, string> | null;
    const oi = openInterestData as Record<string, string> | null;

    let openInterestUsdt: number | null = null;
    if (oi?.['openInterest'] && pi?.['markPrice']) {
      openInterestUsdt = parseFloat(oi['openInterest']) * parseFloat(pi['markPrice']);
    }

    const responseData = {
      symbol: t['symbol'],
      lastPrice: parseFloat(t['lastPrice'] ?? '0'),
      priceChange: parseFloat(t['priceChange'] ?? '0'),
      priceChangePercent: parseFloat(t['priceChangePercent'] ?? '0'),
      markPrice: pi ? parseFloat(pi['markPrice'] ?? '0') : null,
      indexPrice: pi ? parseFloat(pi['indexPrice'] ?? '0') : null,
      fundingRate: pi ? parseFloat(pi['lastFundingRate'] ?? '0') : null,
      nextFundingTime: pi ? parseInt(pi['nextFundingTime'] ?? '0') : null,
      highPrice: parseFloat(t['highPrice'] ?? '0'),
      lowPrice: parseFloat(t['lowPrice'] ?? '0'),
      volume: parseFloat(t['volume'] ?? '0'),
      quoteVolume: parseFloat(t['quoteVolume'] ?? '0'),
      openInterest: openInterestUsdt,
    };

    this.cache.set(cacheKey, { data: responseData, expiresAt: Date.now() + this.CACHE_TTL_MS });
    return responseData;
  }

  async getTopGainersCandles(req: TopGainersCandlesRequest): Promise<unknown[]> {
    let { n, market_type, timeframe, limit, startTime, endTime } = req;

    if (startTime && !endTime) {
      endTime = Date.now();
    }

    const limitNum = limit ?? 500;
    const adapter = market_type === MarketType.SPOT ? this.spotAdapter : this.futuresAdapter;

    const tickers = await adapter.getTickers24hr();

    const gainers = (tickers as Array<Record<string, string>>)
      .filter((t) => t['symbol']?.endsWith('USDT') && parseFloat(t['priceChangePercent'] ?? '0') > 0)
      .sort((a, b) => parseFloat(b['priceChangePercent'] ?? '0') - parseFloat(a['priceChangePercent'] ?? '0'))
      .slice(0, n);

    if (gainers.length === 0) return [];

    const topSymbols = gainers.map((t) => t['symbol'] as string);
    const resultMap = await adapter.getKlines(topSymbols, timeframe, limitNum, startTime, endTime);

    return gainers.map((gainer) => {
      const symbol = gainer['symbol'] as string;
      const candles = resultMap.get(symbol) ?? [];
      return {
        symbol,
        priceChangePercent: parseFloat(gainer['priceChangePercent'] ?? '0'),
        count: candles.length,
        candles,
      };
    });
  }
}
