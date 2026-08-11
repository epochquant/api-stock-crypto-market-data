import { MarketDataService, MarketType } from '../src/services/market-data.service';
import { BinanceApiAdapter } from '../src/infrastructure/binance/BinanceApiAdapter';

// ── Minimal mock factory ─────────────────────────────────────────────────────

function makeMockBinanceAdapter(overrides: Partial<BinanceApiAdapter> = {}): BinanceApiAdapter {
  return {
    getTicker24hr: jest.fn().mockResolvedValue({
      symbol: 'BTCUSDT',
      lastPrice: '50000',
      priceChange: '500',
      priceChangePercent: '1.0',
      highPrice: '51000',
      lowPrice: '49000',
      volume: '1000',
      quoteVolume: '50000000',
    }),
    getPremiumIndex: jest.fn().mockResolvedValue({
      markPrice: '50100',
      indexPrice: '50050',
      lastFundingRate: '0.0001',
      nextFundingTime: '1700000000000',
    }),
    getOpenInterest: jest.fn().mockResolvedValue({ openInterest: '5000' }),
    getTickers24hr: jest.fn().mockResolvedValue([
      { symbol: 'BTCUSDT', priceChangePercent: '5.0' },
      { symbol: 'ETHUSDT', priceChangePercent: '3.0' },
      { symbol: 'BNBUSDT', priceChangePercent: '-1.0' }, // loser — should be filtered
    ]),
    getKlines: jest.fn().mockResolvedValue(
      new Map([['BTCUSDT', [[1700000000000, '50000', '51000', '49000', '50500', '100']]]]),
    ),
    ...overrides,
  } as unknown as BinanceApiAdapter;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MarketDataService', () => {
  let spotAdapter: BinanceApiAdapter;
  let futuresAdapter: BinanceApiAdapter;
  let service: MarketDataService;

  beforeEach(() => {
    spotAdapter = makeMockBinanceAdapter();
    futuresAdapter = makeMockBinanceAdapter();
    service = new MarketDataService(spotAdapter, futuresAdapter);
  });

  // ── getMarketTicker ────────────────────────────────────────────────────────

  describe('getMarketTicker', () => {
    it('should throw 501 for SPOT market type', async () => {
      await expect(
        service.getMarketTicker('BTCUSDT', MarketType.SPOT),
      ).rejects.toMatchObject({ statusCode: 501 });
    });

    it('should return aggregated ticker data for FUTURES market', async () => {
      const result = await service.getMarketTicker('BTCUSDT', MarketType.FUTURES);
      expect(result).toMatchObject({
        symbol: 'BTCUSDT',
        lastPrice: 50000,
        priceChange: 500,
        markPrice: 50100,
        fundingRate: 0.0001,
        openInterest: 5000 * 50100, // openInterest * markPrice
      });
    });

    it('should return cached result on second call within TTL', async () => {
      await service.getMarketTicker('BTCUSDT', MarketType.FUTURES);
      await service.getMarketTicker('BTCUSDT', MarketType.FUTURES);
      // getTicker24hr should only have been called once (second was cached)
      expect(futuresAdapter.getTicker24hr).toHaveBeenCalledTimes(1);
    });

    it('should throw 400 when ticker24hr returns null', async () => {
      const adapter = makeMockBinanceAdapter({
        getTicker24hr: jest.fn().mockRejectedValue(new Error('network error')),
      });
      const svc = new MarketDataService(spotAdapter, adapter);
      await expect(svc.getMarketTicker('UNKNOWN', MarketType.FUTURES)).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  // ── getTopGainersCandles ───────────────────────────────────────────────────

  describe('getTopGainersCandles', () => {
    it('should return only positive gainers sorted descending', async () => {
      const result = await service.getTopGainersCandles({
        n: 5,
        market_type: MarketType.FUTURES,
        timeframe: '15m',
        limit: 10,
      });
      expect(result).toHaveLength(2); // BNBUSDT loser excluded
      const first = result[0] as { symbol: string; priceChangePercent: number };
      expect(first.symbol).toBe('BTCUSDT');
      expect(first.priceChangePercent).toBe(5.0);
    });

    it('should return empty array when no gainers', async () => {
      const adapter = makeMockBinanceAdapter({
        getTickers24hr: jest.fn().mockResolvedValue([
          { symbol: 'BTCUSDT', priceChangePercent: '-2.0' },
        ]),
      });
      const svc = new MarketDataService(spotAdapter, adapter);
      const result = await svc.getTopGainersCandles({
        n: 5,
        market_type: MarketType.FUTURES,
        timeframe: '15m',
      });
      expect(result).toHaveLength(0);
    });

    it('should use spot adapter when market_type is SPOT', async () => {
      await service.getTopGainersCandles({
        n: 2,
        market_type: MarketType.SPOT,
        timeframe: '1h',
      });
      expect(spotAdapter.getTickers24hr).toHaveBeenCalled();
      expect(futuresAdapter.getTickers24hr).not.toHaveBeenCalled();
    });
  });
});
