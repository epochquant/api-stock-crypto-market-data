import * as https from 'https';
import { type IncomingHttpHeaders } from 'http';
import { AlpacaApiError } from '../../shared/errors/AppError';

interface RequestOptions {
  path: string;
  method?: 'GET' | 'POST' | 'DELETE';
  params?: Record<string, string | number>;
}

/**
 * Thin wrapper around Node's built-in `https` module for calling the Alpaca REST API.
 * Handles query-string encoding, JSON parsing, error mapping, and authentication.
 */
export class AlpacaHttpClient {
  constructor(
    public readonly baseUrl: string,
    private readonly apiKeyId?: string,
    private readonly apiSecretKey?: string,
  ) {}

  async get<T>(options: RequestOptions): Promise<T> {
    const { data } = await this.getFull<T>(options);
    return data;
  }

  async getFull<T>(
    options: RequestOptions,
    retries = 3,
    backoffMs = 1000,
  ): Promise<{ data: T; headers: IncomingHttpHeaders }> {
    const { url, headers } = this.buildRequest(options.path, options.params);
    const method = options.method ?? 'GET';

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await new Promise<{ data: T; headers: IncomingHttpHeaders }>((resolve, reject) => {
          const req = https.request(url, { method, headers }, (res) => {
            let body = '';
            res.on('data', (chunk: Buffer) => {
              body += chunk.toString();
            });
            res.on('end', () => {
              if (res.statusCode === 429 && attempt < retries) {
                reject(new Error('Rate Limit Exceeded (429)'));
                return;
              }
              if (
                res.statusCode === undefined ||
                res.statusCode < 200 ||
                res.statusCode >= 300
              ) {
                reject(
                  new AlpacaApiError(
                    `Alpaca API returned HTTP ${res.statusCode ?? 'unknown'} for ${url}`,
                    { statusCode: res.statusCode, body },
                  ),
                );
                return;
              }
              try {
                resolve({ data: JSON.parse(body) as T, headers: res.headers });
              } catch {
                reject(
                  new AlpacaApiError('Failed to parse Alpaca API response as JSON', { body }),
                );
              }
            });
          });

          req.on('error', (err: Error) => {
            reject(
              new AlpacaApiError(`Network error calling Alpaca API: ${err.message}`, { url }),
            );
          });

          req.setTimeout(15000, () => {
            req.destroy(new Error('Request timed out after 15s'));
          });

          req.end();
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const isNetworkError =
          message.includes('Network error') ||
          message.includes('timed out') ||
          message.includes('429');
        if (isNetworkError && attempt < retries) {
          console.warn(`[Alpaca API] Request failed: ${message}. Retrying in ${backoffMs}ms...`);
          await new Promise((r) => setTimeout(r, backoffMs));
          backoffMs *= 2;
        } else {
          throw err;
        }
      }
    }
    throw new Error('Unreachable');
  }

  private buildRequest(
    path: string,
    params?: Record<string, string | number>,
  ): { url: string; headers: Record<string, string> } {
    const base = this.baseUrl.replace(/\/$/, '');
    const headers: Record<string, string> = { Accept: 'application/json' };

    if (this.apiKeyId) headers['APCA-API-KEY-ID'] = this.apiKeyId;
    if (this.apiSecretKey) headers['APCA-API-SECRET-KEY'] = this.apiSecretKey;

    const query = Object.entries({ ...params })
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');

    const url = query ? `${base}${path}?${query}` : `${base}${path}`;
    return { url, headers };
  }
}
