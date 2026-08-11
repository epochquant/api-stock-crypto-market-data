import 'dotenv/config';
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { loadAppConfig } from './config/AppConfig';
import { BinanceHttpClient } from './infrastructure/binance/BinanceHttpClient';
import { BinanceApiAdapter } from './infrastructure/binance/BinanceApiAdapter';
import { AlpacaHttpClient } from './infrastructure/alpaca/AlpacaHttpClient';
import { AlpacaApiAdapter } from './infrastructure/alpaca/AlpacaApiAdapter';
import { YahooFinanceHttpClient } from './infrastructure/yahoo/YahooFinanceHttpClient';
import { YahooFinanceApiAdapter } from './infrastructure/yahoo/YahooFinanceApiAdapter';
import { MarketDataService } from './services/market-data.service';
import { JobsService } from './services/jobs.service';
import { marketDataRoutes } from './routes/market-data.routes';
import { jobsRoutes } from './routes/jobs.routes';

async function bootstrap(): Promise<void> {
  const config = loadAppConfig();

  // ── Fastify instance ───────────────────────────────────────────────────────
  const isDev = config.logLevel !== 'silent' && process.env['NODE_ENV'] !== 'production';
  const loggerConfig = isDev
    ? {
        level: config.logLevel,
        transport: { target: 'pino-pretty', options: { colorize: true } },
      }
    : { level: config.logLevel };

  const server = Fastify({ logger: loggerConfig });

  // ── Swagger / OpenAPI ──────────────────────────────────────────────────────
  await server.register(swagger, {
    openapi: {
      info: {
        title: 'Stock & Crypto Market Data API',
        description: 'REST API providing candlestick and ticker data from Binance, Alpaca, and Yahoo Finance',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            name: 'x-api-key',
            in: 'header',
          },
        },
      },
    },
  });

  await server.register(swaggerUi, {
    routePrefix: '/api/docs',
    uiConfig: { docExpansion: 'list' },
  });

  // ── Infrastructure adapters (pure classes, no DI) ─────────────────────────
  const spotHttpClient = new BinanceHttpClient(config.binance.baseUrl);
  const spotAdapter = new BinanceApiAdapter(spotHttpClient);

  const futuresHttpClient = new BinanceHttpClient('https://fapi.binance.com');
  const futuresAdapter = new BinanceApiAdapter(futuresHttpClient);

  const alpacaHttpClient = new AlpacaHttpClient(
    config.alpaca.baseUrl,
    config.alpaca.apiKeyId || undefined,
    config.alpaca.apiSecretKey || undefined,
  );
  const alpacaAdapter = new AlpacaApiAdapter(alpacaHttpClient);

  const yahooHttpClient = new YahooFinanceHttpClient(config.yahooFinance.baseUrl);
  const yahooAdapter = new YahooFinanceApiAdapter(yahooHttpClient);

  // ── Services ───────────────────────────────────────────────────────────────
  const marketDataService = new MarketDataService(spotAdapter, futuresAdapter);
  const jobsService = new JobsService();

  // ── Routes ─────────────────────────────────────────────────────────────────
  await server.register(marketDataRoutes, {
    apiKey: config.apiKey,
    spotAdapter,
    futuresAdapter,
    alpacaAdapter,
    yahooAdapter,
    marketDataService,
  });

  await server.register(jobsRoutes, {
    apiKey: config.apiKey,
    jobsService,
  });

  // ── Global error handler ───────────────────────────────────────────────────
  server.setErrorHandler((error, _request, reply) => {
    const err = error instanceof Error ? error : new Error(String(error));
    const errAsRecord = err as unknown as Record<string, unknown>;
    const statusCode =
      typeof errAsRecord['statusCode'] === 'number'
        ? (errAsRecord['statusCode'] as number)
        : errAsRecord['validation']
          ? 400
          : 500;
    server.log.error(err);
    void reply.status(statusCode).send({
      statusCode,
      error: err.name ?? 'Error',
      message: err.message,
    });
  });

  // ── Start ──────────────────────────────────────────────────────────────────
  await server.listen({ port: config.port, host: '0.0.0.0' });
  server.log.info(`✅ API running on port ${config.port}`);
  server.log.info(`📖 Swagger docs at http://localhost:${config.port}/api/docs`);
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
