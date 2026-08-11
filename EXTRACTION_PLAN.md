# EXTRACTION PLAN — `api-stock-crypto-market-data`

> **Source:** `C:\00 - GITHUB\volume-usdt-batch`
> **Target:** `C:\00 - GITHUB\api-stock-crypto-market-data`
> **Goal:** Extract the NestJS API server from the monorepo, apply clean architecture, containerize for local development, and prepare for GCP Cloud Run deployment.

---

## Dependency Analysis Summary

### Entry Point

`src/server.ts` bootstraps a **NestJS + Fastify** application using `AppModule`. There is **no framework code in `server.ts` itself** — all routes, services, and adapters live inside `src/modules/` and `src/infrastructure/`.

### Full Import Tree (server.ts → AppModule → leaf modules)

```
server.ts
└── AppModule (app.module.ts)
    ├── ConfigModule (@nestjs/config — global)
    ├── AppConfigModule (modules/config/app-config.module.ts)
    │   └── infrastructure/config/AppConfig.ts         ← env loader
    ├── DatabaseModule (modules/database/database.module.ts)
    │   └── infrastructure/database/PostgresDatabaseAdapter.ts  ← 70 KB
    │       [NOTE: NOT used by any HTTP route handler — only by batch tasks]
    ├── BinanceModule (modules/binance/binance.module.ts)  [Global]
    │   ├── infrastructure/binance/BinanceHttpClient.ts
    │   ├── infrastructure/binance/BinanceApiAdapter.ts
    │   │   ├── application/ports/BinancePort.ts
    │   │   ├── domain/symbol/Symbol.ts
    │   │   ├── domain/shared/types.ts
    │   │   └── infrastructure/binance/BinanceRateLimiter.ts
    │   └── shared/errors/AppError.ts
    ├── AlpacaModule (modules/alpaca/alpaca.module.ts)  [Global]
    │   ├── infrastructure/alpaca/AlpacaHttpClient.ts
    │   │   └── shared/errors/AppError.ts
    │   └── infrastructure/alpaca/AlpacaApiAdapter.ts
    ├── YahooModule (modules/yahoo/yahoo.module.ts)  [Global]
    │   ├── infrastructure/yahoo/YahooFinanceHttpClient.ts
    │   │   └── shared/errors/AppError.ts
    │   └── infrastructure/yahoo/YahooFinanceApiAdapter.ts
    │       └── cli/utils/dateUtils.ts               ← utility (yahooMaxHistoryMs, formatDate)
    ├── JobsModule (modules/jobs/jobs.module.ts)  [Global]
    │   ├── jobs.controller.ts (GET /api/jobs/status/:id)
    │   │   └── common/guards/api-key.guard.ts
    │   └── jobs.service.ts (in-memory job map, no DB dependency)
    └── MarketDataModule (modules/market-data/market-data.module.ts)
        ├── market-data.controller.ts
        │   ├── BinanceApiAdapter (spot + futures DI tokens)
        │   ├── AlpacaApiAdapter
        │   ├── YahooFinanceApiAdapter
        │   ├── common/guards/api-key.guard.ts
        │   └── dto/ (FetchCandlesDto, FetchTopGainersCandlesDto, GetMarketTickerDto)
        └── market-data.service.ts
            ├── BinanceApiAdapter (spot + futures)
            └── dto/ (FetchTopGainersCandlesDto, MarketType)
```

---

## Open Questions / Ambiguities Found

> [!IMPORTANT]
> **Q1 — `DatabaseModule` inclusion**: `PostgresDatabaseAdapter` (70 KB, complex) is registered in `AppModule` but is **not injected into any HTTP route handler or service** (`market-data`, `jobs`). It is only used by batch/cron scripts not imported by `server.ts`. Should `DatabaseModule` be **excluded** from the extracted API server, or kept for future use?
>
> **Recommendation:** Exclude it from the initial extraction to keep the API server lean and dependency-free from PostgreSQL. It can be added later as a separate module when needed.

> [!IMPORTANT]
> **Q2 — `AppConfig` env variable scope**: `loadAppConfig()` currently calls `requireEnv()` (throws on missing) for `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `INFLUXDB_URL`, `INFLUXDB_TOKEN`, `INFLUXDB_ORG`, and `INFLUXDB_BUCKET`. Since the API server does **not use InfluxDB** in any route, these should become optional with defaults in the refactored version. **Confirm this is acceptable.**

> [!IMPORTANT]
> **Q3 — `BINANCE_API_KEY` / `BINANCE_API_SECRET`**: The `BinanceModule` creates an `AUTH_BINANCE_ADAPTER` using API key/secret, but this authenticated adapter is **not used by any of the current HTTP route controllers**. Only the public spot adapter and the public futures adapter (hardcoded to `https://fapi.binance.com`) are used. Should the authenticated Binance adapter (order management, balances, trades) be included as infrastructure, or excluded until needed?
>
> **Recommendation:** Exclude for now; make `BINANCE_API_KEY`/`BINANCE_API_SECRET` optional env vars with empty defaults.

> [!WARNING]
> **Q4 — `cli/utils/dateUtils.ts` dependency**: `YahooFinanceApiAdapter` imports `yahooMaxHistoryMs` and `formatDate` from `cli/utils/dateUtils.ts`. This creates a dependency on the CLI utilities directory. It will be relocated to `src/utils/dateUtils.ts` in the target. Acceptable?

> [!NOTE]
> **Q5 — NestJS vs. pure Express/Fastify**: The source uses **NestJS** with full DI, decorators, Swagger, and class-validator. The target should remain NestJS (same framework), rather than stripping it down to plain Express/Fastify, to preserve the existing architecture. **Confirm this decision.**

---

## Dependency Table: Source → Target File Mapping

| Source File (relative to `volume-usdt-batch/`) | Target File (relative to `api-stock-crypto-market-data/`) | Action |
|---|---|---|
| `src/server.ts` | `src/server.ts` | Extract + refactor |
| `src/app.module.ts` | `src/app.module.ts` | Extract + trim (remove DB) |
| `src/modules/config/app-config.module.ts` | `src/modules/config/app-config.module.ts` | Copy |
| `src/infrastructure/config/AppConfig.ts` | `src/config/AppConfig.ts` | Refactor (trim unused env vars) |
| `src/modules/binance/binance.module.ts` | `src/modules/binance/binance.module.ts` | Refactor |
| `src/infrastructure/binance/BinanceHttpClient.ts` | `src/infrastructure/binance/BinanceHttpClient.ts` | Copy |
| `src/infrastructure/binance/BinanceApiAdapter.ts` | `src/infrastructure/binance/BinanceApiAdapter.ts` | Copy |
| `src/infrastructure/binance/BinanceRateLimiter.ts` | `src/infrastructure/binance/BinanceRateLimiter.ts` | Copy |
| `src/modules/alpaca/alpaca.module.ts` | `src/modules/alpaca/alpaca.module.ts` | Copy |
| `src/infrastructure/alpaca/AlpacaHttpClient.ts` | `src/infrastructure/alpaca/AlpacaHttpClient.ts` | Copy |
| `src/infrastructure/alpaca/AlpacaApiAdapter.ts` | `src/infrastructure/alpaca/AlpacaApiAdapter.ts` | Copy |
| `src/modules/yahoo/yahoo.module.ts` | `src/modules/yahoo/yahoo.module.ts` | Copy |
| `src/infrastructure/yahoo/YahooFinanceHttpClient.ts` | `src/infrastructure/yahoo/YahooFinanceHttpClient.ts` | Copy |
| `src/infrastructure/yahoo/YahooFinanceApiAdapter.ts` | `src/infrastructure/yahoo/YahooFinanceApiAdapter.ts` | Update import path |
| `src/cli/utils/dateUtils.ts` | `src/utils/dateUtils.ts` | Relocate |
| `src/modules/jobs/jobs.module.ts` | `src/modules/jobs/jobs.module.ts` | Copy |
| `src/modules/jobs/jobs.controller.ts` | `src/modules/jobs/jobs.controller.ts` | Copy |
| `src/modules/jobs/jobs.service.ts` | `src/modules/jobs/jobs.service.ts` | Copy |
| `src/modules/market-data/market-data.module.ts` | `src/modules/market-data/market-data.module.ts` | Copy |
| `src/modules/market-data/market-data.controller.ts` | `src/modules/market-data/market-data.controller.ts` | Copy |
| `src/modules/market-data/market-data.service.ts` | `src/modules/market-data/market-data.service.ts` | Copy |
| `src/modules/market-data/dto/fetch-candles.dto.ts` | `src/modules/market-data/dto/fetch-candles.dto.ts` | Copy |
| `src/modules/market-data/dto/fetch-top-gainers-candles.dto.ts` | `src/modules/market-data/dto/fetch-top-gainers-candles.dto.ts` | Copy |
| `src/modules/market-data/dto/get-market-ticker.dto.ts` | `src/modules/market-data/dto/get-market-ticker.dto.ts` | Copy |
| `src/application/ports/BinancePort.ts` | `src/application/ports/BinancePort.ts` | Copy |
| `src/domain/symbol/Symbol.ts` | `src/domain/symbol/Symbol.ts` | Copy |
| `src/domain/shared/types.ts` | `src/domain/shared/types.ts` | Copy |
| `src/shared/errors/AppError.ts` | `src/shared/errors/AppError.ts` | Copy |
| `src/common/guards/api-key.guard.ts` | `src/common/guards/api-key.guard.ts` | Copy |

**Files explicitly EXCLUDED (batch/cron only, not imported by server.ts):**
- `src/infrastructure/database/PostgresDatabaseAdapter.ts` (batch only)
- `src/infrastructure/database/TradeSimulatorService.ts` (batch only)
- `src/modules/database/database.module.ts` (batch only)
- `src/infrastructure/ai/` (batch only)
- `src/infrastructure/queue/` (batch only)
- `src/infrastructure/rules/` (batch only)
- `src/infrastructure/workers/` (batch only)
- `src/domain/` (all except `symbol/Symbol.ts` and `shared/types.ts`)
- `src/application/use-cases/` (all — batch scripts)
- `src/scripts/`, `src/cli/fetchers/` (CLI/batch only)
- All `src/*.ts` root-level scripts (`main.ts`, `manual_*.ts`, etc.)

---

## Target Project Structure

```
api-stock-crypto-market-data/
├── src/
│   ├── app.module.ts                              # Root NestJS module (trimmed)
│   ├── server.ts                                  # Entry point (bootstrap)
│   ├── config/
│   │   └── AppConfig.ts                           # Env loader (refactored)
│   ├── common/
│   │   └── guards/
│   │       └── api-key.guard.ts
│   ├── application/
│   │   └── ports/
│   │       └── BinancePort.ts
│   ├── domain/
│   │   ├── symbol/
│   │   │   └── Symbol.ts
│   │   └── shared/
│   │       └── types.ts
│   ├── shared/
│   │   └── errors/
│   │       └── AppError.ts
│   ├── utils/
│   │   └── dateUtils.ts                           # Relocated from cli/utils/
│   ├── infrastructure/
│   │   ├── binance/
│   │   │   ├── BinanceHttpClient.ts
│   │   │   ├── BinanceApiAdapter.ts
│   │   │   └── BinanceRateLimiter.ts
│   │   ├── alpaca/
│   │   │   ├── AlpacaHttpClient.ts
│   │   │   └── AlpacaApiAdapter.ts
│   │   └── yahoo/
│   │       ├── YahooFinanceHttpClient.ts
│   │       └── YahooFinanceApiAdapter.ts          # Updated import path for dateUtils
│   └── modules/
│       ├── config/
│       │   └── app-config.module.ts
│       ├── binance/
│       │   └── binance.module.ts
│       ├── alpaca/
│       │   └── alpaca.module.ts
│       ├── yahoo/
│       │   └── yahoo.module.ts
│       ├── jobs/
│       │   ├── jobs.module.ts
│       │   ├── jobs.controller.ts
│       │   └── jobs.service.ts
│       └── market-data/
│           ├── market-data.module.ts
│           ├── market-data.controller.ts
│           ├── market-data.service.ts
│           └── dto/
│               ├── fetch-candles.dto.ts
│               ├── fetch-top-gainers-candles.dto.ts
│               └── get-market-ticker.dto.ts
├── tests/
│   ├── market-data.service.spec.ts
│   ├── jobs.service.spec.ts
│   └── api-key.guard.spec.ts
├── .env.example
├── .env                                           # Git-ignored
├── .gitignore
├── Dockerfile
├── docker-compose.yaml
├── package.json
├── tsconfig.json
└── README.md
```

---

## Identified Environment Variables

### Required for API Server

| Variable | Required? | Default | Description |
|---|---|---|---|
| `BACKEND_PORT` | Optional | `3000` | HTTP server port |
| `API_KEY` | **Required** | — | Server API key (guards protected endpoints) |
| `BINANCE_BASE_URL` | Optional | `https://api.binance.com` | Binance spot base URL |
| `BINANCE_API_KEY` | Optional | — | Binance API key (only needed for authenticated routes) |
| `BINANCE_API_SECRET` | Optional | — | Binance API secret |
| `ALPACA_API_KEY_ID` | Optional | — | Alpaca API key ID |
| `ALPACA_API_SECRET_KEY` | Optional | — | Alpaca API secret key |
| `ALPACA_BASE_URL` | Optional | `https://data.alpaca.markets` | Alpaca data API base URL |
| `YAHOO_FINANCE_BASE_URL` | Optional | `https://query1.finance.yahoo.com` | Yahoo Finance base URL |
| `LOG_LEVEL` | Optional | `info` | Log level |
| `NODE_ENV` | Optional | `development` | Runtime environment |

### Removed from Source (batch-only, excluded):
`INFLUXDB_*`, `24H_CRON_SCHEDULE`, `KLINE_CRON_SCHEDULE`, `INFLUXDB_KLINE_BUCKET`, `DETECT_INTERVAL`, `ALERT_*`, `DB_*`, `MAX_ZERO_VOLUME_*`, `MIN_*`, `ALERT_PARALLEL_CONCURRENCY`, `BINANCE_MAX_CONCURRENT_REQUESTS`, `SYNC_SPOT_TRADES_*`, `EMA_REJECTION_THRESHOLD`, `BLOCK_HOURS_EMA_REJECTION`, `SIMULATION_EXPIRY_DAYS`, `AUTO_SELL_BEARISH_TREND_ENABLED`.

---

## API Endpoints Reference

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/market/spot/candles` | `x-api-key` | Fetch Binance spot candlestick data |
| `GET` | `/api/market/futures/candles` | `x-api-key` | Fetch Binance futures candlestick data |
| `GET` | `/api/market/stocks/candles` | `x-api-key` | Fetch NYSE/NASDAQ stock candles (Alpaca) |
| `GET` | `/api/market/byma/candles` | `x-api-key` | Fetch BYMA stock candles (Yahoo Finance) |
| `GET` | `/api/market/futures/premium-index` | None | Futures premium index |
| `GET` | `/api/market/ticker` | None | Market ticker statistics (futures only) |
| `POST` | `/api/market/top-gainers/candles` | `x-api-key` | Top N gainers with candles |
| `GET` | `/api/jobs/status/:id` | `x-api-key` | Job status lookup |
| `GET` | `/api/docs` | None | Swagger UI |
| `GET` | `/api/docs-json` | None | Swagger JSON spec |

---

## Phase-by-Phase Execution Plan

---

### Phase 1: Dependency Analysis & Mapping ✅ COMPLETE

> See "Full Import Tree" and "Dependency Table" above.

**Key findings:**
1. The server is a pure **read-only market data API** — no DB writes occur from HTTP routes.
2. `PostgresDatabaseAdapter` is registered in `AppModule` but is **unused by any route**. It imports a 70 KB adapter full of SQL queries for batch tasks.
3. `YahooFinanceApiAdapter` has a transitive dependency on `cli/utils/dateUtils.ts` — this will be relocated.
4. The `AUTH_BINANCE_ADAPTER` (authenticated Binance trades/orders) is registered but not consumed by any route controller.
5. All HTTP clients are built on **Node's built-in `https` module** — zero third-party HTTP client dependencies.

---

### Phase 2: Project Setup & Environment Parametrization

**Steps:**
1. Initialize `package.json` with NestJS + Fastify dependencies (trimmed from source).
2. Create `tsconfig.json` with `strict: true`, decorator support, and `es2022` target.
3. Generate `.env.example` with all API server variables.
4. Set up `.gitignore` to exclude `.env`, `node_modules`, `dist`.

**Key NestJS dependencies to include:**
```json
{
  "@nestjs/common": "^11.x",
  "@nestjs/core": "^11.x",
  "@nestjs/config": "^4.x",
  "@nestjs/platform-fastify": "^11.x",
  "@nestjs/swagger": "^11.x",
  "class-transformer": "^0.5.x",
  "class-validator": "^0.15.x",
  "dotenv": "^16.x",
  "reflect-metadata": "^0.2.x",
  "rxjs": "^7.x"
}
```

**Dev dependencies:**
```json
{
  "@types/node": "^20.x",
  "typescript": "^5.x",
  "ts-node": "^10.x",
  "jest": "^30.x",
  "ts-jest": "^29.x",
  "@types/jest": "^30.x",
  "rimraf": "^5.x"
}
```

---

### Phase 3: Module Extraction & Refactoring

**Execution order (dependencies first):**

1. **Shared utilities & errors:**
   - `src/shared/errors/AppError.ts` — copy as-is
   - `src/utils/dateUtils.ts` — relocate from `cli/utils/dateUtils.ts` (only `yahooMaxHistoryMs` and `formatDate` are used by the server)

2. **Domain layer:**
   - `src/domain/shared/types.ts` — copy as-is
   - `src/domain/symbol/Symbol.ts` — copy as-is
   - `src/application/ports/BinancePort.ts` — copy as-is

3. **Config:**
   - `src/config/AppConfig.ts` — **refactor**: remove all batch-only env vars (`INFLUXDB_*`, `DB_*`, cron schedules, etc.), make `BINANCE_API_KEY/SECRET` optional

4. **Infrastructure adapters (no NestJS DI — pure classes):**
   - Binance: `BinanceRateLimiter.ts`, `BinanceHttpClient.ts`, `BinanceApiAdapter.ts`
   - Alpaca: `AlpacaHttpClient.ts`, `AlpacaApiAdapter.ts`
   - Yahoo: `YahooFinanceHttpClient.ts`, `YahooFinanceApiAdapter.ts` (update `dateUtils` import path)

5. **Guards:**
   - `src/common/guards/api-key.guard.ts` — copy as-is

6. **NestJS modules (DI wiring):**
   - `AppConfigModule`, `BinanceModule`, `AlpacaModule`, `YahooModule`
   - `JobsModule` (controller + service)
   - `MarketDataModule` (controller + service + DTOs)

7. **Root module & entry point:**
   - `app.module.ts` — trim `DatabaseModule` import
   - `server.ts` — copy as-is

---

### Phase 4: Testing & Validation

**Test files to create:**

| Test File | Scope | Mocks |
|---|---|---|
| `tests/market-data.service.spec.ts` | `MarketDataService` unit test | Mock `BinanceApiAdapter` (spot + futures) |
| `tests/jobs.service.spec.ts` | `JobsService` unit test | No mocks needed |
| `tests/api-key.guard.spec.ts` | `ApiKeyGuard` unit test | Mock `ConfigService` |

**Test framework:** Jest + ts-jest

---

### Phase 5: Containerization & GCP Cloud Run Deployment

#### Dockerfile (multi-stage, node:22-alpine)

```dockerfile
# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci --ignore-scripts
COPY src/ ./src/
RUN npm run build

# Stage 2: Production
FROM node:22-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

#### docker-compose.yaml (local development)

```yaml
services:
  api:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env
    restart: unless-stopped
```

#### GCP Cloud Run Deployment

```bash
# Build & push to Artifact Registry
gcloud builds submit --tag gcr.io/PROJECT_ID/api-stock-crypto-market-data

# Deploy to Cloud Run
gcloud run deploy api-stock-crypto-market-data \
  --image gcr.io/PROJECT_ID/api-stock-crypto-market-data \
  --platform managed \
  --region us-central1 \
  --min-instances=0 \
  --max-instances=2 \
  --memory=512Mi \
  --cpu=1 \
  --port=3000 \
  --set-env-vars="NODE_ENV=production,API_KEY=...,BINANCE_BASE_URL=..." \
  --allow-unauthenticated
```

**Cost optimization notes:**
- `--min-instances=0`: Cold starts allowed (lowest cost, free tier eligible)
- `--max-instances=2`: Hard cap to prevent runaway billing
- `--memory=512Mi`: Sufficient for a stateless API without in-process DB
- No persistent storage required (all data is fetched from external APIs in real-time)

---

### Phase 6: Documentation (README.md)

`README.md` will cover:
- Project overview and API endpoint reference
- Local setup: `npm install`, `.env` config, `npm run dev`
- Docker local run: `docker compose up`
- Environment variable reference table
- Testing instructions: `npm test`
- GCP Cloud Run deployment steps

---

## Verification Plan

### Automated Tests
```bash
npm test                    # Run all Jest unit tests
npm run typecheck           # TypeScript strict type checking (no emit)
npm run build               # Ensure compilation succeeds
```

### Manual Verification (after `docker compose up`)
1. `GET http://localhost:3000/api/docs` — Swagger UI loads correctly
2. `GET http://localhost:3000/api/market/futures/premium-index?symbol=BTCUSDT` — Returns JSON
3. `GET http://localhost:3000/api/market/ticker?symbol=BTCUSDT&market_type=futures` — Returns ticker data
4. `GET http://localhost:3000/api/market/spot/candles?symbol=BTCUSDT&timeframe=15m&limit=5` with `x-api-key` header — Returns candles
5. Missing `x-api-key` on guarded routes — 401 Unauthorized

---

## Clarifying Questions for User Confirmation

Before executing code, please confirm these decisions:

1. [ ] **Exclude `DatabaseModule` / `PostgresDatabaseAdapter`** from the extracted server? *(Recommended: YES)*
2. [ ] **Make `BINANCE_API_KEY`/`BINANCE_API_SECRET` optional** (no authenticated Binance routes currently)? *(Recommended: YES)*
3. [ ] **Remove InfluxDB variables** from `AppConfig` entirely? *(Recommended: YES)*
4. [ ] **Relocate `cli/utils/dateUtils.ts` to `src/utils/dateUtils.ts`** in target? *(Recommended: YES)*
5. [ ] **Keep NestJS as the framework** (not strip to plain Express/Fastify)? *(Recommended: YES)*
6. [ ] **Target Node.js version**: `node:22-alpine` for Dockerfile? *(Recommended: YES)*
