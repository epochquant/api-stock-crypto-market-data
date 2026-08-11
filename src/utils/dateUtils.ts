/**
 * Helper to calculate ms from N months ago.
 */
export function monthsAgoMs(months: number): number {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.getTime();
}

/**
 * Helper to calculate ms from N days ago.
 */
export function daysAgoMs(days: number): number {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.getTime();
}

/**
 * Helper to parse a date string like 'YYYY-MM-DD' to ms.
 */
export function parseDateArg(dateStr: string): number {
  return new Date(dateStr).getTime();
}

/**
 * Helper to format a Date object or timestamp as 'YYYY-MM-DD'.
 */
export function formatDate(date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toISOString().split('T')[0] as string;
}

/**
 * Generates chunks of `chunkDays` size between startMs and endMs.
 */
export function generateChunks(
  startMs: number,
  endMs: number,
  chunkDays: number,
): Array<{ start: number; end: number }> {
  const chunks = [];
  let currentStart = startMs;
  const chunkMs = chunkDays * 24 * 60 * 60 * 1000;

  while (currentStart < endMs) {
    let currentEnd = currentStart + chunkMs;
    if (currentEnd > endMs) {
      currentEnd = endMs;
    }
    chunks.push({ start: currentStart, end: currentEnd });
    currentStart = currentEnd;
  }

  return chunks;
}

// ─── Yahoo Finance data-retention limits ────────────────────────────────────

/**
 * Returns the maximum history window (in ms) that Yahoo Finance allows for a
 * given interval string (Yahoo format: '1m', '5m', '15m', '30m', '60m', '90m',
 * '1h', '1d', '5d', '1wk', '1mo', '3mo').
 *
 * Returns `null` when there is no meaningful cap (daily and above).
 */
export function yahooMaxHistoryMs(yahooInterval: string): number | null {
  const DAY_MS = 24 * 60 * 60 * 1000;
  switch (yahooInterval) {
    case '1m':
      return 7 * DAY_MS;
    case '2m':
    case '5m':
    case '15m':
    case '30m':
    case '60m':
    case '90m':
      return 60 * DAY_MS;
    case '1h':
      return 730 * DAY_MS;
    default:
      return null;
  }
}

/**
 * Maps an internal interval string to the Yahoo Finance API format.
 */
export function toYahooInterval(interval: string): string {
  const match = interval.match(/^(\d+)([mhdwM])$/);
  if (!match) return '15m';
  const val = match[1] as string;
  const unit = match[2] as string;

  switch (unit) {
    case 'm':
      return ['1', '2', '5', '15', '30', '60', '90'].includes(val) ? `${val}m` : '15m';
    case 'h':
      return val === '1' ? '1h' : '60m';
    case 'd':
      return val === '1' || val === '5' ? `${val}d` : '1d';
    case 'w':
      return '1wk';
    case 'M':
      return val === '1' || val === '3' ? `${val}mo` : '1mo';
    default:
      return '15m';
  }
}

/**
 * Clamps `startMs` to the oldest date Yahoo Finance can serve for the given interval.
 */
export function clampStartToYahooLimit(interval: string, startMs: number, endMs: number): number {
  const yahooInterval = toYahooInterval(interval);
  const maxHistoryMs = yahooMaxHistoryMs(yahooInterval);

  if (maxHistoryMs === null) return startMs;

  const SAFETY_BUFFER_MS = 2 * 24 * 60 * 60 * 1000;
  const oldestAllowedMs = endMs - maxHistoryMs + SAFETY_BUFFER_MS;

  if (startMs < oldestAllowedMs) {
    const requestedDays = Math.round((endMs - startMs) / (24 * 60 * 60 * 1000));
    const maxDays = Math.round(maxHistoryMs / (24 * 60 * 60 * 1000));
    console.warn(
      `\n⚠️  Yahoo Finance only provides ${maxDays} days of history for the "${yahooInterval}" interval ` +
        `(you requested ${requestedDays} days).\n` +
        `   Adjusting start date: ${formatDate(startMs)} → ${formatDate(oldestAllowedMs)}\n`,
    );
    return oldestAllowedMs;
  }

  return startMs;
}
