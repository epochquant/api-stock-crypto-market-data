import * as https from 'https';
import { type IncomingHttpHeaders } from 'http';
import { YahooFinanceApiError } from '../../shared/errors/AppError';

interface RequestOptions {
  path: string;
  method?: 'GET' | 'POST' | 'DELETE';
  params?: Record<string, string | number>;
}

/**
 * Thin wrapper around Node's built-in `https` module for calling the Yahoo Finance REST API.
 */
export class YahooFinanceHttpClient {
  constructor(public readonly baseUrl: string) {}

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
                const retryAfterSec = res.headers['retry-after'];
                const waitMs = retryAfterSec
                  ? parseInt(retryAfterSec, 10) * 1000
                  : Math.min(backoffMs, 30_000) + Math.floor(Math.random() * 500);
                reject(
                  Object.assign(
                    new Error(`Rate Limit Exceeded (429). Retry in ${waitMs}ms`),
                    { waitMs },
                  ),
                );
                return;
              }
              if (
                res.statusCode === undefined ||
                res.statusCode < 200 ||
                res.statusCode >= 300
              ) {
                reject(
                  new YahooFinanceApiError(
                    `Yahoo Finance API returned HTTP ${res.statusCode ?? 'unknown'} for ${url}`,
                    { statusCode: res.statusCode, body },
                  ),
                );
                return;
              }
              try {
                resolve({ data: JSON.parse(body) as T, headers: res.headers });
              } catch {
                reject(
                  new YahooFinanceApiError(
                    'Failed to parse Yahoo Finance API response as JSON',
                    { body },
                  ),
                );
              }
            });
          });

          req.on('error', (err: Error) => {
            reject(
              new YahooFinanceApiError(
                `Network error calling Yahoo Finance API: ${err.message}`,
                { url },
              ),
            );
          });

          req.setTimeout(15000, () => {
            req.destroy(new Error('Request timed out after 15s'));
          });

          req.end();
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const waitMs =
          err !== null && typeof err === 'object' && 'waitMs' in err
            ? (err as { waitMs: number }).waitMs
            : undefined;
        const isRetryable =
          message.includes('Network error') ||
          message.includes('timed out') ||
          message.includes('Rate Limit Exceeded');

        if (isRetryable && attempt < retries) {
          const jitter = Math.floor(Math.random() * 500);
          const delay = waitMs ?? Math.min(backoffMs + jitter, 30_000);
          console.warn(
            `[Yahoo API] Request failed (attempt ${attempt + 1}/${retries + 1}): ${message}. Waiting ${delay}ms...`,
          );
          await new Promise((r) => setTimeout(r, delay));
          backoffMs = Math.min(backoffMs * 2, 30_000);
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
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    };

    const query = Object.entries({ ...params })
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');

    const url = query ? `${base}${path}?${query}` : `${base}${path}`;
    return { url, headers };
  }
}
