import * as https from 'https';
import { type IncomingHttpHeaders } from 'http';
import * as crypto from 'crypto';
import { BinanceApiError } from '../../shared/errors/AppError';

interface RequestOptions {
  path: string;
  method?: 'GET' | 'POST' | 'DELETE';
  params?: Record<string, string | number>;
  requireAuth?: boolean;
}

/**
 * Thin wrapper around Node's built-in `https` module for calling the Binance REST API.
 * Handles query-string encoding, JSON parsing, error mapping, and authentication.
 */
export class BinanceHttpClient {
  constructor(
    public readonly baseUrl: string,
    private readonly apiKey?: string,
    private readonly apiSecret?: string,
  ) {}

  async get<T>(options: RequestOptions): Promise<T> {
    const { data } = await this.getFull<T>(options);
    return data;
  }

  async post<T>(options: RequestOptions): Promise<T> {
    const { data } = await this.getFull<T>({ ...options, method: 'POST' });
    return data;
  }

  async delete<T>(options: RequestOptions): Promise<T> {
    const { data } = await this.getFull<T>({ ...options, method: 'DELETE' });
    return data;
  }

  async getFull<T>(
    options: RequestOptions,
  ): Promise<{ data: T; headers: IncomingHttpHeaders }> {
    const { url, headers } = this.buildRequest(
      options.path,
      options.params,
      options.requireAuth,
    );
    const method = options.method ?? 'GET';

    return new Promise<{ data: T; headers: IncomingHttpHeaders }>((resolve, reject) => {
      const req = https.request(url, { method, headers }, (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on('end', () => {
          if (res.statusCode === undefined || res.statusCode < 200 || res.statusCode >= 300) {
            reject(
              new BinanceApiError(
                `Binance API returned HTTP ${res.statusCode ?? 'unknown'} for ${url}`,
                { statusCode: res.statusCode, body },
              ),
            );
            return;
          }
          try {
            resolve({ data: JSON.parse(body) as T, headers: res.headers });
          } catch {
            reject(
              new BinanceApiError('Failed to parse Binance API response as JSON', { body }),
            );
          }
        });
      });

      req.on('error', (err: Error) => {
        reject(
          new BinanceApiError(`Network error calling Binance API: ${err.message}`, { url }),
        );
      });

      req.end();
    });
  }

  private buildRequest(
    path: string,
    params?: Record<string, string | number>,
    requireAuth?: boolean,
  ): { url: string; headers: Record<string, string> } {
    const base = this.baseUrl.replace(/\/$/, '');
    const headers: Record<string, string> = {};

    let queryArgs = { ...params };

    if (requireAuth) {
      if (!this.apiKey || !this.apiSecret) {
        throw new Error('Binance API key and secret are required for authenticated requests.');
      }
      headers['X-MBX-APIKEY'] = this.apiKey;
      queryArgs = { ...queryArgs, timestamp: Date.now() };
    }

    let query = Object.entries(queryArgs)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');

    if (requireAuth && this.apiSecret) {
      const signature = crypto.createHmac('sha256', this.apiSecret).update(query).digest('hex');
      query += `&signature=${signature}`;
    }

    const url = query ? `${base}${path}?${query}` : `${base}${path}`;
    return { url, headers };
  }
}
