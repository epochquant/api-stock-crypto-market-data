import { type BinancePort } from '../../application/ports/BinancePort';
import { type Symbol, createSymbol, type SymbolStatus } from '../../domain/symbol/Symbol';
import { toSymbolId, toPrice, toVolumeAmount } from '../../domain/shared/types';
import { BinanceHttpClient } from './BinanceHttpClient';
import { binanceRateLimiter } from './BinanceRateLimiter';

interface BinanceExchangeInfoSymbol {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
}

interface BinanceExchangeInfo {
  symbols: BinanceExchangeInfoSymbol[];
}

interface BinanceTicker24h {
  symbol: string;
  volume: string;
  quoteVolume: string;
  lastPrice: string;
  priceChangePercent: string;
  priceChange: string;
  highPrice: string;
  lowPrice: string;
  count: number;
  bidQty: string;
  askQty: string;
}

export class BinanceApiAdapter implements BinancePort {
  constructor(private readonly client: BinanceHttpClient) {}

  async getActiveSymbols(): Promise<Symbol[]> {
    const [exchangeInfo, tickers] = await Promise.all([
      this.client.get<BinanceExchangeInfo>({ path: '/api/v3/exchangeInfo' }),
      this.client.get<BinanceTicker24h[]>({ path: '/api/v3/ticker/24hr' }),
    ]);

    const tickerMap = new Map<string, BinanceTicker24h>(tickers.map((t) => [t.symbol, t]));

    const symbols: Symbol[] = [];

    for (const raw of exchangeInfo.symbols) {
      if (raw.status !== 'TRADING') continue;
      if (raw.quoteAsset !== 'USDT') continue;

      const ticker = tickerMap.get(raw.symbol);
      if (!ticker) continue;

      try {
        symbols.push(
          createSymbol({
            id: toSymbolId(raw.symbol),
            baseAsset: raw.baseAsset,
            quoteAsset: raw.quoteAsset,
            volumeUsdt: toVolumeAmount(parseFloat(ticker.quoteVolume)),
            volumeAsset: toVolumeAmount(parseFloat(ticker.volume)),
            lastPrice: toPrice(parseFloat(ticker.lastPrice)),
            priceChangePercent: parseFloat(ticker.priceChangePercent),
            count: ticker.count,
            bidQty: toVolumeAmount(parseFloat(ticker.bidQty)),
            askQty: toVolumeAmount(parseFloat(ticker.askQty)),
            status: raw.status as SymbolStatus,
          }),
        );
      } catch {
        continue;
      }
    }

    return symbols;
  }

  async getKlines(
    symbols: string[],
    interval: string,
    limit: number = 1,
    startTime?: number,
    endTime?: number,
  ): Promise<Map<string, unknown[][]>> {
    const results = new Map<string, unknown[][]>();

    const fetchKline = async (symbol: string) => {
      try {
        await binanceRateLimiter.waitIfNearLimit(80);

        const params: Record<string, string | number> = { symbol, interval, limit };
        if (startTime !== undefined) params['startTime'] = startTime;
        if (endTime !== undefined) params['endTime'] = endTime;

        const isFutures = this.client.baseUrl.includes('fapi');
        const endpointPath = isFutures ? '/fapi/v1/klines' : '/api/v3/klines';

        const { data: klines, headers } = await this.client.getFull<unknown[][]>({
          path: endpointPath,
          params,
        });

        binanceRateLimiter.updateWeight(headers);

        if (klines && klines.length > 0) {
          results.set(toSymbolId(symbol), klines);
        }
      } catch (err) {
        console.error(`BinanceApiAdapter: failed to fetch ${interval} klines for ${symbol}`, err);
      }
    };

    const CHUNK_SIZE = 15;
    const DELAY_MS = 80;

    for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
      const chunk = symbols.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk.map((s) => fetchKline(s)));
      if (i + CHUNK_SIZE < symbols.length) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }
    }

    return results;
  }

  async getExchangeInfo(): Promise<unknown> {
    const { data, headers } = await this.client.getFull<unknown>({ path: '/api/v3/exchangeInfo' });
    binanceRateLimiter.updateWeight(headers);
    return data;
  }

  async getTickers24hr(): Promise<unknown[]> {
    const isFutures = this.client.baseUrl.includes('fapi');
    const endpointPath = isFutures ? '/fapi/v1/ticker/24hr' : '/api/v3/ticker/24hr';
    const { data, headers } = await this.client.getFull<unknown[]>({ path: endpointPath });
    binanceRateLimiter.updateWeight(headers);
    return data;
  }

  async getTicker24hr(symbol: string): Promise<unknown> {
    const isFutures = this.client.baseUrl.includes('fapi');
    const endpointPath = isFutures ? '/fapi/v1/ticker/24hr' : '/api/v3/ticker/24hr';
    const { data, headers } = await this.client.getFull<unknown>({
      path: endpointPath,
      params: { symbol },
    });
    binanceRateLimiter.updateWeight(headers);
    return data;
  }

  async getBookTickers(): Promise<unknown[]> {
    const { data, headers } = await this.client.getFull<unknown[]>({
      path: '/api/v3/ticker/bookTicker',
    });
    binanceRateLimiter.updateWeight(headers);
    return data;
  }

  async getBalances(): Promise<unknown[]> {
    const res = await this.client.get<{ balances?: unknown[] }>({
      path: '/api/v3/account',
      requireAuth: true,
    });
    return res.balances ?? [];
  }

  async getMyTrades(symbol: string): Promise<unknown[]> {
    return this.client.get<unknown[]>({
      path: '/api/v3/myTrades',
      params: { symbol },
      requireAuth: true,
    });
  }

  async getOpenOrders(): Promise<unknown[]> {
    return this.client.get<unknown[]>({ path: '/api/v3/openOrders', requireAuth: true });
  }

  async getOrderBook(symbol: string, limit: number = 100): Promise<unknown> {
    const { data, headers } = await this.client.getFull<unknown>({
      path: '/api/v3/depth',
      params: { symbol, limit },
    });
    binanceRateLimiter.updateWeight(headers);
    return data;
  }

  async getTickerPrices(symbol?: string): Promise<unknown[] | unknown> {
    const options: { path: string; params?: Record<string, string> } = {
      path: '/api/v3/ticker/price',
    };
    if (symbol) options.params = { symbol };
    const { data, headers } = await this.client.getFull<unknown>(options);
    binanceRateLimiter.updateWeight(headers);
    return data;
  }

  async cancelOrder(symbol: string, orderId: number | string): Promise<unknown> {
    return this.client.delete<unknown>({
      path: '/api/v3/order',
      params: { symbol, orderId },
      requireAuth: true,
    });
  }

  async createMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
  ): Promise<unknown> {
    return this.client.post<unknown>({
      path: '/api/v3/order',
      params: { symbol, side, type: 'MARKET', quantity },
      requireAuth: true,
    });
  }

  async getPremiumIndex(symbol: string): Promise<unknown> {
    const isFutures = this.client.baseUrl.includes('fapi');
    const endpointPath = isFutures ? '/fapi/v1/premiumIndex' : '/api/v3/premiumIndex';
    const { data, headers } = await this.client.getFull<unknown>({
      path: endpointPath,
      params: { symbol },
    });
    binanceRateLimiter.updateWeight(headers);
    return data;
  }

  async getOpenInterest(symbol: string): Promise<unknown> {
    const isFutures = this.client.baseUrl.includes('fapi');
    if (!isFutures) return null;
    const { data, headers } = await this.client.getFull<unknown>({
      path: '/fapi/v1/openInterest',
      params: { symbol },
    });
    binanceRateLimiter.updateWeight(headers);
    return data;
  }
}
