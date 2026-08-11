# api-stock-crypto-market-data

Lightweight, stateless REST API providing real-time candlestick and ticker data from **Binance**, **Alpaca**, and **Yahoo Finance**. Built with plain [Fastify](https://fastify.dev/) and TypeScript — no ORM, no DI framework, no database.

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/market/spot/candles` | `x-api-key` | Binance spot candlestick data |
| `GET` | `/api/market/futures/candles` | `x-api-key` | Binance futures candlestick data |
| `GET` | `/api/market/stocks/candles` | `x-api-key` | NYSE/NASDAQ stock candles (Alpaca) |
| `GET` | `/api/market/byma/candles` | `x-api-key` | BYMA (Argentine) stock candles (Yahoo Finance) |
| `GET` | `/api/market/futures/premium-index` | None | Binance futures premium index |
| `GET` | `/api/market/ticker` | None | Market ticker statistics (futures) |
| `POST` | `/api/market/top-gainers/candles` | `x-api-key` | Top N gainers with candles |
| `GET` | `/api/jobs/status/:id` | `x-api-key` | Job status lookup |
| `GET` | `/api/docs` | None | Swagger UI |
| `GET` | `/api/docs-json` | None | OpenAPI JSON spec |

### Query Parameters (candle endpoints)

| Param | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | Yes | Trading pair (e.g. `BTCUSDT`, `AAPL`) |
| `timeframe` | string | Yes | Interval (e.g. `1m`, `15m`, `1h`, `1d`) |
| `limit` | number | No | Max candles to return (default: 500) |
| `startTime` | number | No | Start timestamp in milliseconds |
| `endTime` | number | No | End timestamp in milliseconds |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `API_KEY` | **Yes** | — | Secret key sent in `x-api-key` header |
| `BACKEND_PORT` | No | `3000` | HTTP server port |
| `BINANCE_BASE_URL` | No | `https://api.binance.com` | Binance spot base URL |
| `ALPACA_API_KEY_ID` | No* | — | Alpaca API key ID |
| `ALPACA_API_SECRET_KEY` | No* | — | Alpaca API secret key |
| `ALPACA_BASE_URL` | No | `https://data.alpaca.markets` | Alpaca data API URL |
| `YAHOO_FINANCE_BASE_URL` | No | `https://query1.finance.yahoo.com` | Yahoo Finance base URL |
| `LOG_LEVEL` | No | `info` | Pino log level |
| `NODE_ENV` | No | `development` | Runtime environment |

> *Required for stock candle endpoints (`/api/market/stocks/candles`)

---

## Local Development

### Prerequisites
- Node.js 20+ or 22+
- npm 10+

### Run with Node

```bash
# Install dependencies
npm install

# Create and fill in your .env file
cp .env.example .env

# Start dev server (ts-node, no build needed)
npm run dev
```

### Run with Docker

```bash
# Build and start the container
docker compose up --build

# Stop
docker compose down
```

The API will be available at `http://localhost:3000`.
Swagger UI: `http://localhost:3000/api/docs`

---

## Testing

```bash
# Run all unit tests
npm test

# Type-check without emitting
npm run typecheck

# Build production bundle
npm run build
```

### Test Coverage

| Test File | Scope |
|---|---|
| `tests/jobs.service.spec.ts` | JobsService — create, update, get |
| `tests/market-data.service.spec.ts` | MarketDataService — ticker, caching, top gainers |
| `tests/api-key.middleware.spec.ts` | API key validation — pass, missing, invalid |

---

## GCP Cloud Run Deployment

### Prerequisites
- Google Cloud SDK (`gcloud`) installed and authenticated
- A GCP project with Cloud Run API enabled

### Deploy

```bash
# Set your project ID
export PROJECT_ID=your-gcp-project-id

# Build and push image to Google Container Registry
gcloud builds submit \
  --tag gcr.io/$PROJECT_ID/api-stock-crypto-market-data \
  .

# Deploy to Cloud Run (cost-optimized config)
gcloud run deploy api-stock-crypto-market-data \
  --image gcr.io/$PROJECT_ID/api-stock-crypto-market-data \
  --platform managed \
  --region us-central1 \
  --min-instances=0 \
  --max-instances=2 \
  --memory=512Mi \
  --cpu=1 \
  --port=3000 \
  --set-env-vars="NODE_ENV=production,API_KEY=YOUR_API_KEY,ALPACA_API_KEY_ID=...,ALPACA_API_SECRET_KEY=..." \
  --allow-unauthenticated
```

### Cost Notes
- `--min-instances=0` — scales to zero when idle (free tier eligible)
- `--max-instances=2` — prevents runaway billing
- `--memory=512Mi` — sufficient for a stateless proxy API
- No database, no persistent storage = no additional GCP service costs

---

## Architecture

```
src/
├── config/          # AppConfig — typed env variable loader (fail-fast)
├── infrastructure/  # Pure HTTP adapters (Binance, Alpaca, Yahoo Finance)
├── services/        # Business logic (MarketDataService, JobsService)
├── routes/          # Fastify route plugins (market-data, jobs)
├── middleware/      # API key preHandler
├── domain/          # Branded types, Symbol entity
├── application/     # Port interfaces (BinancePort)
├── shared/          # Error classes (AppError, BinanceApiError, ...)
├── utils/           # Date utilities (Yahoo Finance history clamping)
└── server.ts        # Fastify bootstrap — DI wiring, Swagger, listen
```

All HTTP clients use **Node's built-in `https` module** — zero third-party HTTP client dependencies.
