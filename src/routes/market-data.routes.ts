import { type FastifyInstance } from 'fastify';
import { apiKeyMiddleware } from '../middleware/api-key.middleware';
import { MarketDataService, MarketType } from '../services/market-data.service';
import { BinanceApiAdapter } from '../infrastructure/binance/BinanceApiAdapter';
import { AlpacaApiAdapter } from '../infrastructure/alpaca/AlpacaApiAdapter';
import { YahooFinanceApiAdapter } from '../infrastructure/yahoo/YahooFinanceApiAdapter';

interface CandlesQuery {
  symbol: string;
  timeframe: string;
  limit?: number;
  startTime?: number;
  endTime?: number;
}

interface TopGainersBody {
  n: number;
  market_type: MarketType;
  timeframe: string;
  limit?: number;
  startTime?: number;
  endTime?: number;
}

interface MarketDataRouteOptions {
  apiKey: string;
  spotAdapter: BinanceApiAdapter;
  futuresAdapter: BinanceApiAdapter;
  alpacaAdapter: AlpacaApiAdapter;
  yahooAdapter: YahooFinanceApiAdapter;
  marketDataService: MarketDataService;
}

const candlesQuerySchema = {
  type: 'object',
  required: ['symbol', 'timeframe'],
  properties: {
    symbol: { type: 'string', description: 'Trading pair symbol (e.g. BTCUSDT)' },
    timeframe: { type: 'string', description: 'Candle interval (e.g. 1m, 15m, 1h, 1d)' },
    limit: { type: 'number', minimum: 1, description: 'Max candles to return (default: 500)' },
    startTime: { type: 'number', description: 'Start timestamp in milliseconds' },
    endTime: { type: 'number', description: 'End timestamp in milliseconds' },
  },
} as const;

export async function marketDataRoutes(
  fastify: FastifyInstance,
  opts: MarketDataRouteOptions,
): Promise<void> {
  const { apiKey, spotAdapter, futuresAdapter, alpacaAdapter, yahooAdapter, marketDataService } = opts;
  const withApiKey = (req: Parameters<typeof apiKeyMiddleware>[0], reply: Parameters<typeof apiKeyMiddleware>[1]) =>
    apiKeyMiddleware(req, reply, apiKey);

  // ── GET /api/market/spot/candles ────────────────────────────────────────────
  fastify.get<{ Querystring: CandlesQuery }>(
    '/api/market/spot/candles',
    {
      preHandler: withApiKey,
      schema: {
        tags: ['Market Data'],
        summary: 'Fetch spot market candles (Binance)',
        security: [{ apiKey: [] }],
        querystring: candlesQuerySchema,
      },
    },
    async (request, reply) => {
      let { symbol, timeframe, limit, startTime, endTime } = request.query;
      if (startTime && !endTime) endTime = Date.now();
      const limitNum = limit ?? 500;
      const resultMap = await spotAdapter.getKlines([symbol], timeframe, limitNum, startTime, endTime);
      const data = Array.from(resultMap.values())[0] ?? [];
      return reply.send({ symbol, timeframe, count: data.length, data });
    },
  );

  // ── GET /api/market/futures/candles ─────────────────────────────────────────
  fastify.get<{ Querystring: CandlesQuery }>(
    '/api/market/futures/candles',
    {
      preHandler: withApiKey,
      schema: {
        tags: ['Market Data'],
        summary: 'Fetch futures market candles (Binance)',
        security: [{ apiKey: [] }],
        querystring: candlesQuerySchema,
      },
    },
    async (request, reply) => {
      let { symbol, timeframe, limit, startTime, endTime } = request.query;
      if (startTime && !endTime) endTime = Date.now();
      const limitNum = limit ?? 500;
      const resultMap = await futuresAdapter.getKlines([symbol], timeframe, limitNum, startTime, endTime);
      const data = Array.from(resultMap.values())[0] ?? [];
      return reply.send({ symbol, timeframe, count: data.length, data });
    },
  );

  // ── GET /api/market/stocks/candles ──────────────────────────────────────────
  fastify.get<{ Querystring: CandlesQuery }>(
    '/api/market/stocks/candles',
    {
      preHandler: withApiKey,
      schema: {
        tags: ['Market Data'],
        summary: 'Fetch NYSE/NASDAQ stock candles (Alpaca)',
        security: [{ apiKey: [] }],
        querystring: candlesQuerySchema,
      },
    },
    async (request, reply) => {
      let { symbol, timeframe, limit, startTime, endTime } = request.query;
      if (startTime && !endTime) endTime = Date.now();
      const limitNum = limit ?? 500;
      const data = await alpacaAdapter.getKlines(symbol, timeframe, limitNum, startTime, endTime);
      return reply.send({ symbol, timeframe, count: data.length, data });
    },
  );

  // ── GET /api/market/byma/candles ────────────────────────────────────────────
  fastify.get<{ Querystring: CandlesQuery }>(
    '/api/market/byma/candles',
    {
      preHandler: withApiKey,
      schema: {
        tags: ['Market Data'],
        summary: 'Fetch BYMA stock candles (Yahoo Finance)',
        security: [{ apiKey: [] }],
        querystring: candlesQuerySchema,
      },
    },
    async (request, reply) => {
      let { symbol, timeframe, limit, startTime, endTime } = request.query;
      if (startTime && !endTime) endTime = Date.now();
      const limitNum = limit ?? 500;
      const data = await yahooAdapter.getKlines(symbol, timeframe, limitNum, startTime, endTime);
      return reply.send({ symbol, timeframe, count: data.length, data });
    },
  );

  // ── GET /api/market/futures/premium-index ────────────────────────────────────
  fastify.get<{ Querystring: { symbol: string } }>(
    '/api/market/futures/premium-index',
    {
      schema: {
        tags: ['Market Data'],
        summary: 'Fetch futures premium index (Binance)',
        querystring: {
          type: 'object',
          required: ['symbol'],
          properties: { symbol: { type: 'string', description: 'Futures symbol (e.g. BTCUSDT)' } },
        },
      },
    },
    async (request, reply) => {
      const { symbol } = request.query;
      if (!symbol) {
        return reply.status(422).send({ statusCode: 422, message: 'Missing required field: symbol' });
      }
      const data = await futuresAdapter.getPremiumIndex(symbol);
      return reply.send(data);
    },
  );

  // ── GET /api/market/ticker ──────────────────────────────────────────────────
  fastify.get<{ Querystring: { symbol: string; market_type: MarketType } }>(
    '/api/market/ticker',
    {
      schema: {
        tags: ['Market Data'],
        summary: 'Fetch market ticker statistics (futures)',
        querystring: {
          type: 'object',
          required: ['symbol', 'market_type'],
          properties: {
            symbol: { type: 'string', description: 'Trading pair symbol' },
            market_type: { type: 'string', enum: Object.values(MarketType), description: 'Market type' },
          },
        },
      },
    },
    async (request, reply) => {
      const { symbol, market_type } = request.query;
      const data = await marketDataService.getMarketTicker(symbol, market_type);
      return reply.send(data);
    },
  );

  // ── POST /api/market/top-gainers/candles ────────────────────────────────────
  fastify.post<{ Body: TopGainersBody }>(
    '/api/market/top-gainers/candles',
    {
      preHandler: withApiKey,
      schema: {
        tags: ['Market Data'],
        summary: 'Fetch top N gainers with candles',
        security: [{ apiKey: [] }],
        body: {
          type: 'object',
          required: ['n', 'market_type', 'timeframe'],
          properties: {
            n: { type: 'number', minimum: 1, description: 'Number of top gainers to retrieve' },
            market_type: { type: 'string', enum: Object.values(MarketType), description: 'Market source' },
            timeframe: { type: 'string', description: 'Candle interval (e.g. 15m)' },
            limit: { type: 'number', minimum: 1, description: 'Max candles per symbol' },
            startTime: { type: 'number', description: 'Start timestamp in ms' },
            endTime: { type: 'number', description: 'End timestamp in ms' },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body;
      const result = await marketDataService.getTopGainersCandles(body);
      return reply.status(201).send({
        market_type: body.market_type,
        timeframe: body.timeframe,
        symbol_count: result.length,
        data: result,
      });
    },
  );
}
